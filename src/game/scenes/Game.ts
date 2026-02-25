import Phaser from 'phaser';
import { parseRoom, ROOM_WIDTH, ROOM_HEIGHT } from '../rooms/parser';
import { ROOMS, STARTING_ROOM } from '../rooms/index';
import { getSolidTileIndices } from '../data/glyphs';
import { Player } from '../entities/Player';

/** Tile size in pixels */
const TILE_SIZE = 16;

/**
 * Game scene — renders the current room, spawns the moth, lets her fly.
 */
export class Game extends Phaser.Scene {
    private map!: Phaser.Tilemaps.Tilemap;
    private layer!: Phaser.Tilemaps.TilemapLayer;
    private player!: Player;

    constructor() {
        super('Game');
    }

    create(): void {
        this.loadRoom(STARTING_ROOM);
    }

    update(time: number, delta: number): void {
        this.player.tick(time, delta);
    }

    /**
     * Parse an ASCII room and render it as a Phaser tilemap,
     * then spawn the player at the S marker.
     */
    private loadRoom(roomId: string): void {
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

        // ─── Log other spawns (enemies, bosses — for later) ───
        for (const spawn of spawns) {
            if (spawn.glyph === 'S') continue;
            const worldX = spawn.col * TILE_SIZE + TILE_SIZE / 2;
            const worldY = spawn.row * TILE_SIZE + TILE_SIZE / 2;
            console.log(`[${roomId}] ${spawn.glyph} spawn at tile (${spawn.col}, ${spawn.row}) → world (${worldX}, ${worldY})`);
        }
    }
}
