import Phaser from 'phaser';
import { parseRoom, ROOM_WIDTH, ROOM_HEIGHT } from '../rooms/parser';
import { ROOMS, STARTING_ROOM } from '../rooms/index';
import { getSolidTileIndices, TileIndex } from '../data/glyphs';
import { Player } from '../entities/Player';
import { Enemy, ENEMY_DEFAULTS } from '../entities/Enemy';
import { Crawler } from '../entities/Crawler';

/** Tile size in pixels */
const TILE_SIZE = 16;

/**
 * Game scene — renders the current room, spawns the moth, lets her fly.
 */
export class Game extends Phaser.Scene {
    private map!: Phaser.Tilemaps.Tilemap;
    private layer!: Phaser.Tilemaps.TilemapLayer;
    private player!: Player;
    /** All living enemies in the current room */
    private enemies: Enemy[] = [];
    /** Whether the scene is in hitstop (freeze frames on melee connect) */
    private hitstopTimer = 0;
    /** Current room ID (for respawn) */
    private currentRoomId: string = STARTING_ROOM;

    constructor() {
        super('Game');
    }

    create(): void {
        this.loadRoom(STARTING_ROOM);
        this.setupDebugKeys();

        // ── Respawn on death ──
        this.events.on('player-dead', () => {
            this.time.delayedCall(600, () => {
                this.switchRoom(this.currentRoomId);
            });
        });
    }

    update(time: number, delta: number): void {
        // ── Hitstop: freeze everything for a few frames on melee connect ──
        if (this.hitstopTimer > 0) {
            this.hitstopTimer -= delta;
            return; // skip all updates — that's the juice!
        }

        this.player.tick(time, delta);

        for (const enemy of this.enemies) {
            enemy.tick(time, delta);
        }

        // Prune dead enemies
        this.enemies = this.enemies.filter(e => e.alive);
    }

    /**
     * Debug hotkeys: press 1-9 to jump to rooms.
     * Maps number keys to room IDs in registry order.
     */
    private setupDebugKeys(): void {
        const roomIds = Object.keys(ROOMS);
        const keyboard = this.input.keyboard;
        if (!keyboard) return;

        for (let i = 0; i < Math.min(roomIds.length, 9); i++) {
            const key = keyboard.addKey(
                Phaser.Input.Keyboard.KeyCodes.ONE + i,
            );
            const roomId = roomIds[i];
            key.on('down', () => {
                console.log(`[DEBUG] Switching to room: ${roomId}`);
                this.switchRoom(roomId);
            });
        }

        // Backtick (`) — toggle physics debug draw
        const debugKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.BACKTICK);
        debugKey.on('down', () => {
            const world = this.physics.world;
            if (world.drawDebug) {
                world.drawDebug = false;
                world.debugGraphic?.clear();
            } else {
                world.drawDebug = true;
                if (!world.debugGraphic) {
                    world.createDebugGraphic();
                }
            }
            console.log(`[DEBUG] Physics debug: ${world.drawDebug ? 'ON' : 'OFF'}`);
        });
    }

    /**
     * Tear down the current room and load a new one.
     */
    private switchRoom(roomId: string): void {
        // Clean up old room
        for (const enemy of this.enemies) {
            enemy.destroy();
        }
        this.enemies = [];
        this.player.meleeZone.destroy();
        this.player.slashGraphics.destroy();
        this.player.destroy();
        this.layer.destroy();
        this.map.destroy();

        this.loadRoom(roomId);
    }

    /**
     * Parse an ASCII room and render it as a Phaser tilemap,
     * then spawn the player at the S marker.
     */
    private loadRoom(roomId: string): void {
        this.currentRoomId = roomId;
        const ascii = ROOMS[roomId];
        if (!ascii) {
            throw new Error(`Room '${roomId}' not found in registry`);
        }

        const { tiles, spawns } = parseRoom(ascii);

        // ─── Tilemap ───
        this.map = this.make.tilemap({
            data: tiles,
            tileWidth: TILE_SIZE,
            tileHeight: TILE_SIZE,
        });

        const tileset = this.map.addTilesetImage('kenney', 'tiles', TILE_SIZE, TILE_SIZE, 0, 0);
        if (!tileset) {
            throw new Error('Failed to add tileset image');
        }

        const layer = this.map.createLayer(0, tileset, 0, 0);
        if (!layer) {
            throw new Error('Failed to create tilemap layer');
        }
        this.layer = layer;

        // Collision on solid tiles (terrain set pieces + cracked floor + phase wall)
        this.map.setCollision(getSolidTileIndices());

        // ─── Thin platforms: one-way collision (land on top, pass through below) ───
        this.map.setCollision(TileIndex.THIN_PLATFORM);
        this.layer.forEachTile((tile) => {
            if (tile.index === TileIndex.THIN_PLATFORM) {
                tile.collideDown = false;
                tile.collideLeft = false;
                tile.collideRight = false;
            }
        });

        // ─── Player spawn ───
        const playerSpawn = spawns.find(s => s.glyph === 'S');
        const spawnX = playerSpawn
            ? playerSpawn.col * TILE_SIZE + TILE_SIZE / 2
            : ROOM_WIDTH * TILE_SIZE / 2;
        const spawnY = playerSpawn
            ? playerSpawn.row * TILE_SIZE + TILE_SIZE / 2
            : ROOM_HEIGHT * TILE_SIZE / 2;

        this.player = new Player(this, spawnX, spawnY);
        this.physics.add.collider(this.player, this.layer);

        // ─── Spawn enemies from E glyphs ───
        this.enemies = [];
        for (const spawn of spawns) {
            const worldX = spawn.col * TILE_SIZE + TILE_SIZE / 2;
            const worldY = spawn.row * TILE_SIZE + TILE_SIZE / 2;

            if (spawn.glyph === 'E') {
                const crawler = new Crawler(this, worldX, worldY, this.layer);
                this.physics.add.collider(crawler, this.layer);
                this.enemies.push(crawler);
            } else if (spawn.glyph !== 'S') {
                console.log(`[${roomId}] ${spawn.glyph} spawn at tile (${spawn.col}, ${spawn.row}) → world (${worldX}, ${worldY})`);
            }
        }

        // ─── Melee attack ↔ enemy overlap (with hitstop juice!) ───
        for (const enemy of this.enemies) {
            this.physics.add.overlap(
                this.player.meleeZone,
                enemy,
                () => this.onMeleeHitEnemy(enemy),
            );
        }

        // ─── Contact damage: enemy body ↔ player ───
        for (const enemy of this.enemies) {
            this.physics.add.overlap(
                this.player,
                enemy,
                () => this.onEnemyContactPlayer(enemy),
            );
        }
    }

    /**
     * Called when the moth's melee hitbox overlaps an enemy.
     * Deals 1 damage, triggers hitstop + screen shake.
     */
    private onMeleeHitEnemy(enemy: Enemy): void {
        if (!enemy.alive || !this.player.isAttacking) return;

        const hit = enemy.takeDamage(1, this.player.x);
        if (hit) {
            // ── Hitstop — freeze everything for JUICY impact ──
            this.hitstopTimer = ENEMY_DEFAULTS.HITSTOP_MS;

            // ── Screen shake — tiny, punchy ──
            this.cameras.main.shake(80, 0.008);
        }
    }

    /**
     * Called when an enemy body overlaps the player.
     * Deals contact damage with knockback + invuln blink.
     */
    private onEnemyContactPlayer(enemy: Enemy): void {
        if (!enemy.alive) return;
        this.player.takeDamage(enemy.contactDamage, enemy.x);
    }
}
