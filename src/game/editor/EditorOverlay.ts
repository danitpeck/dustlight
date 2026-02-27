/**
 * In-Game Debug Editor (Phase 1)
 *
 * Toggle with F1. Pauses gameplay, shows grid overlay + glyph palette.
 * Click to paint, right-click to erase, E to export ASCII.
 * On close, rebuilds the room from the modified ASCII so physics stay correct.
 *
 * This is a debug tool, not a production UI — it's intentionally scrappy.
 */

import Phaser from 'phaser';
import { GLYPH_TO_TILE, TileIndex, TERRAIN_SETS } from '../data/glyphs';
import { pickAutotile, type TerrainSet } from '../rooms/autotile';
import { ROOM_WIDTH, ROOM_HEIGHT } from '../rooms/parser';

const TILE_SIZE = 16;

/** Glyph palette entries — number keys map to glyphs */
const PALETTE = [
    { key: Phaser.Input.Keyboard.KeyCodes.ONE,   glyph: '#', label: 'Wall' },
    { key: Phaser.Input.Keyboard.KeyCodes.TWO,   glyph: '~', label: 'Platform' },
    { key: Phaser.Input.Keyboard.KeyCodes.THREE, glyph: '^', label: 'Spikes' },
    { key: Phaser.Input.Keyboard.KeyCodes.FOUR,  glyph: '=', label: 'Cracked' },
    { key: Phaser.Input.Keyboard.KeyCodes.FIVE,  glyph: '%', label: 'Phase' },
    { key: Phaser.Input.Keyboard.KeyCodes.SIX,   glyph: '*', label: 'Pickup' },
    { key: Phaser.Input.Keyboard.KeyCodes.SEVEN, glyph: 'S', label: 'Spawn' },
    { key: Phaser.Input.Keyboard.KeyCodes.EIGHT, glyph: 'D', label: 'Door' },
    { key: Phaser.Input.Keyboard.KeyCodes.NINE,  glyph: 'E', label: 'Enemy' },
    { key: Phaser.Input.Keyboard.KeyCodes.ZERO,  glyph: '.', label: 'Air' },
] as const;

/** Colors for entity marker overlays */
const MARKER_COLORS: Record<string, number> = {
    'S': 0x00ff00,   // green — player spawn
    'D': 0x0088ff,   // blue — door
    'E': 0xff4444,   // red — enemy
    'B': 0xff00ff,   // magenta — boss
    '*': 0xffff00,   // yellow — pickup
    '?': 0x00ffff,   // cyan — secret
};

export class EditorOverlay {
    private scene: Phaser.Scene;
    private _active = false;
    private dirty = false;

    // ─── Visual layers ───
    private gridGraphics: Phaser.GameObjects.Graphics;
    private cursorGraphics: Phaser.GameObjects.Graphics;
    private markerGraphics: Phaser.GameObjects.Graphics;
    private hudText: Phaser.GameObjects.Text;

    // ─── State ───
    private selectedGlyph = '#';
    private selectedLabel = 'Wall';
    private asciiGrid: string[][] = [];
    private roomId = '';
    private terrainSet: TerrainSet = TERRAIN_SETS.DEFAULT;
    private exportFlashTimer = 0;

    // ─── References ───
    private map: Phaser.Tilemaps.Tilemap | null = null;
    private onRebuild: (ascii: string) => void;

    // ─── Input keys ───

    get isActive(): boolean { return this._active; }

    constructor(scene: Phaser.Scene, onRebuild: (ascii: string) => void) {
        this.scene = scene;
        this.onRebuild = onRebuild;

        // ── Visual layers (hidden until editor opens) ──
        this.gridGraphics = scene.add.graphics().setDepth(100).setVisible(false);
        this.cursorGraphics = scene.add.graphics().setDepth(101).setVisible(false);
        this.markerGraphics = scene.add.graphics().setDepth(99).setVisible(false);

        this.hudText = scene.add.text(2, 2, '', {
            fontSize: '10px',
            fontFamily: 'monospace',
            color: '#ffffff',
            backgroundColor: '#000000',
            padding: { x: 2, y: 1 },
        }).setDepth(102).setVisible(false);

        // ── Input keys (event-driven, not polled) ──
        const kb = scene.input.keyboard;
        if (kb) {
            for (const entry of PALETTE) {
                const key = kb.addKey(entry.key);
                key.on('down', () => {
                    if (!this._active) return;
                    this.selectedGlyph = entry.glyph;
                    this.selectedLabel = entry.label;
                });
            }
            const exportKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
            exportKey.on('down', () => {
                if (!this._active) return;
                this.exportAscii();
            });
        }
    }

    /**
     * Called when a room loads — captures the ASCII for editing.
     * Also stores a reference to the tilemap for live tile updates.
     */
    loadRoom(roomId: string, ascii: string, map: Phaser.Tilemaps.Tilemap): void {
        this.roomId = roomId;
        this.map = map;
        this.dirty = false;
        const lines = ascii.trim().split('\n').map(l => l.trimEnd());
        this.asciiGrid = lines.map(line => line.split(''));
    }

    /** Toggle the editor on/off. */
    toggle(): void {
        if (this._active) {
            this.close();
        } else {
            this.open();
        }
    }

    private open(): void {
        if (this._active) return;
        this._active = true;

        // Pause gameplay physics
        this.scene.physics.world.pause();

        // Draw static grid + entity markers
        this.drawGrid();
        this.drawMarkers();

        // Show all overlays
        this.gridGraphics.setVisible(true);
        this.cursorGraphics.setVisible(true);
        this.markerGraphics.setVisible(true);
        this.hudText.setVisible(true);
    }

    private close(): void {
        if (!this._active) return;
        this._active = false;

        // Hide overlays
        this.gridGraphics.setVisible(false);
        this.cursorGraphics.setVisible(false);
        this.markerGraphics.setVisible(false);
        this.hudText.setVisible(false);
        this.cursorGraphics.clear();

        // Resume physics
        this.scene.physics.world.resume();

        // If the room was edited, rebuild it so physics/zones are correct
        if (this.dirty) {
            this.dirty = false;
            this.onRebuild(this.toAsciiString());
        }
    }

    /** Called every frame from Game.update() when the editor is active. */
    update(): void {
        if (!this._active) return;

        // ── Tick flash timer ──
        if (this.exportFlashTimer > 0) {
            this.exportFlashTimer -= this.scene.game.loop.delta;
        }

        // ── Mouse → tile coords ──
        const pointer = this.scene.input.activePointer;
        const col = Math.floor(pointer.worldX / TILE_SIZE);
        const row = Math.floor(pointer.worldY / TILE_SIZE);
        const inBounds = col >= 0 && col < ROOM_WIDTH && row >= 0 && row < ROOM_HEIGHT;

        // ── Cursor highlight ──
        this.cursorGraphics.clear();
        if (inBounds) {
            const px = col * TILE_SIZE;
            const py = row * TILE_SIZE;
            this.cursorGraphics.fillStyle(0xffff00, 0.15);
            this.cursorGraphics.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            this.cursorGraphics.lineStyle(1, 0xffff00, 0.7);
            this.cursorGraphics.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        }

        // ── Paint (left click / drag) ──
        if (pointer.isDown && pointer.leftButtonDown() && inBounds) {
            this.paint(col, row, this.selectedGlyph);
        }

        // ── Erase (right click / drag) ──
        if (pointer.isDown && pointer.rightButtonDown() && inBounds) {
            this.paint(col, row, '.');
        }

        // ── HUD ──
        const tileInfo = inBounds
            ? `(${col},${row}) [${this.asciiGrid[row]?.[col] ?? '?'}]`
            : '';
        const paletteHint = PALETTE.map((p, i) =>
            p.glyph === this.selectedGlyph ? `[${(i + 1) % 10}:${p.glyph}]` : `${(i + 1) % 10}:${p.glyph}`
        ).join(' ');
        const exportNotice = this.exportFlashTimer > 0 ? ' ✓ Copied to clipboard!' : '';
        this.hudText.setText(
            `EDITOR | ${this.roomId} | ${this.selectedGlyph} ${this.selectedLabel} | ${tileInfo}${exportNotice}\n` +
            `${paletteHint}\n` +
            `LClick: Paint | RClick: Erase | E: Copy ASCII | F1: Close`
        );
    }

    // ─────────────────────────────────────────────────────────
    //  Painting
    // ─────────────────────────────────────────────────────────

    private paint(col: number, row: number, glyph: string): void {
        if (!this.asciiGrid[row] || this.asciiGrid[row][col] === glyph) return;
        if (!this.map) return;

        this.asciiGrid[row][col] = glyph;
        this.dirty = true;

        if (glyph === '#') {
            // Wall — autotile this tile + cardinal neighbors
            this.autotileArea(col, row);
        } else {
            const tileIndex = GLYPH_TO_TILE[glyph];
            if (tileIndex !== undefined && tileIndex >= 0) {
                // Visible non-wall tile
                this.map.putTileAt(tileIndex, col, row);
            } else {
                // Air or entity marker — remove the tile
                this.map.removeTileAt(col, row);
            }
            // Neighbors that are walls might need new autotile variants
            this.autotileArea(col, row);
        }

        // Redraw entity markers
        this.drawMarkers();
    }

    /**
     * Re-autotile a tile and its 4 cardinal neighbors.
     * Only affects cells that are walls ('#') in the asciiGrid.
     */
    private autotileArea(col: number, row: number): void {
        if (!this.map) return;

        const positions = [
            [row, col],
            [row - 1, col],
            [row + 1, col],
            [row, col - 1],
            [row, col + 1],
        ];

        for (const [r, c] of positions) {
            if (r < 0 || r >= ROOM_HEIGHT || c < 0 || c >= ROOM_WIDTH) continue;
            if (this.asciiGrid[r][c] !== '#') continue;

            const hasUp    = this.isWall(r - 1, c);
            const hasDown  = this.isWall(r + 1, c);
            const hasLeft  = this.isWall(r, c - 1);
            const hasRight = this.isWall(r, c + 1);

            const tileIdx = pickAutotile(hasUp, hasDown, hasLeft, hasRight, this.terrainSet);
            this.map.putTileAt(tileIdx, c, r);
        }
    }

    /** Is this cell a wall? Out-of-bounds = solid (matches autotile convention). */
    private isWall(row: number, col: number): boolean {
        if (row < 0 || row >= ROOM_HEIGHT || col < 0 || col >= ROOM_WIDTH) return true;
        return this.asciiGrid[row][col] === '#';
    }

    // ─────────────────────────────────────────────────────────
    //  Drawing
    // ─────────────────────────────────────────────────────────

    /** Draw the tile grid overlay. */
    private drawGrid(): void {
        this.gridGraphics.clear();
        this.gridGraphics.lineStyle(1, 0xffffff, 0.12);

        for (let x = 0; x <= ROOM_WIDTH; x++) {
            this.gridGraphics.lineBetween(
                x * TILE_SIZE, 0,
                x * TILE_SIZE, ROOM_HEIGHT * TILE_SIZE,
            );
        }
        for (let y = 0; y <= ROOM_HEIGHT; y++) {
            this.gridGraphics.lineBetween(
                0, y * TILE_SIZE,
                ROOM_WIDTH * TILE_SIZE, y * TILE_SIZE,
            );
        }
    }

    /** Draw colored markers for entity / non-tile glyphs (S, D, E, B, *, ?). */
    private drawMarkers(): void {
        this.markerGraphics.clear();

        for (let row = 0; row < ROOM_HEIGHT; row++) {
            if (!this.asciiGrid[row]) continue;
            for (let col = 0; col < ROOM_WIDTH; col++) {
                const glyph = this.asciiGrid[row][col];
                const color = MARKER_COLORS[glyph];
                if (color === undefined) continue;

                this.markerGraphics.fillStyle(color, 0.35);
                this.markerGraphics.fillRect(
                    col * TILE_SIZE + 2,
                    row * TILE_SIZE + 2,
                    TILE_SIZE - 4,
                    TILE_SIZE - 4,
                );
            }
        }
    }

    // ─────────────────────────────────────────────────────────
    //  Export
    // ─────────────────────────────────────────────────────────

    /** Dump current ASCII to console + clipboard. */
    private exportAscii(): void {
        const ascii = this.toAsciiString();
        console.log(`\n──── Room ${this.roomId} ────`);
        console.log(ascii);
        console.log('────────────────────────');

        this.exportFlashTimer = 1500;

        navigator.clipboard.writeText(ascii).then(
            () => console.log('[EDITOR] Copied to clipboard!'),
            () => console.log('[EDITOR] Clipboard write failed — check permissions'),
        );
    }

    /** Get the current ASCII grid as a string. */
    toAsciiString(): string {
        return this.asciiGrid.map(row => row.join('')).join('\n');
    }

    /** Clean up all editor graphics (called on scene shutdown). */
    destroy(): void {
        this.gridGraphics.destroy();
        this.cursorGraphics.destroy();
        this.markerGraphics.destroy();
        this.hudText.destroy();
    }
}
