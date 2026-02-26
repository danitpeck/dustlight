import Phaser from 'phaser';
import { parseRoom, ROOM_WIDTH, ROOM_HEIGHT } from '../rooms/parser';
import { ROOMS, STARTING_ROOM } from '../rooms/index';
import { getSolidTileIndices, TileIndex } from '../data/glyphs';
import { Player } from '../entities/Player';
import { Enemy, ENEMY_DEFAULTS } from '../entities/Enemy';
import { Crawler } from '../entities/Crawler';
import { DOOR_CONNECTIONS, DoorEdge, OPPOSITE_EDGE } from '../rooms/connections';

/** Tile size in pixels */
const TILE_SIZE = 16;

/**
 * Game scene — renders the current room, spawns the moth, lets her fly.
 */
export class Game extends Phaser.Scene {
    private map!: Phaser.Tilemaps.Tilemap;
    /** The tilemap layer — public so entities can query tiles (e.g. drop-through) */
    public layer!: Phaser.Tilemaps.TilemapLayer;
    private player!: Player;
    /** All living enemies in the current room */
    private enemies: Enemy[] = [];
    /** Door trigger zones in the current room */
    private doorZones: Phaser.GameObjects.Zone[] = [];
    /** Spike hazard zones in the current room */
    private spikeZones: Phaser.GameObjects.Zone[] = [];
    /** Whether the scene is in hitstop (freeze frames on melee connect) */
    private hitstopTimer = 0;
    /** Current room ID (for respawn) */
    private currentRoomId: string = STARTING_ROOM;
    /** True while a room transition is in progress (prevents re-triggering) */
    private isTransitioning = false;
    /** Which edge the player should spawn at (null = use S marker) */
    private arrivalEdge: DoorEdge | null = null;

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
    private switchRoom(roomId: string, arrivalEdge: DoorEdge | null = null): void {
        // Clean up old room
        for (const enemy of this.enemies) {
            enemy.destroy();
        }
        this.enemies = [];
        for (const zone of this.doorZones) {
            zone.destroy();
        }
        this.doorZones = [];
        for (const zone of this.spikeZones) {
            zone.destroy();
        }
        this.spikeZones = [];
        this.player.meleeZone.destroy();
        this.player.slashGraphics.destroy();
        this.player.destroy();
        this.layer.destroy();
        this.map.destroy();

        this.arrivalEdge = arrivalEdge;
        this.loadRoom(roomId);
    }

    /**
     * Transition to another room via a door — fade out, switch, fade in.
     */
    private transitionToRoom(roomId: string, arrivalEdge: DoorEdge): void {
        if (this.isTransitioning) return;
        this.isTransitioning = true;

        // Freeze player movement during transition
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(0, 0);
        body.setAcceleration(0, 0);
        body.setAllowGravity(false);

        // Fade out → switch → fade in
        this.cameras.main.fadeOut(150, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.switchRoom(roomId, arrivalEdge);
            this.cameras.main.fadeIn(150, 0, 0, 0);
            this.cameras.main.once('camerafadeincomplete', () => {
                this.isTransitioning = false;
            });
        });
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

                // Fix Phaser's "interesting faces" optimization:
                // setCollision() marks the solid tile below as having a collision
                // neighbor above, stripping its faceTop. That means drop-through
                // would ghost through solid blocks below thin platforms. Force it back.
                const below = this.layer.getTileAt(tile.x, tile.y + 1);
                if (below && below.collides) {
                    below.faceTop = true;
                }
            }
        });

        // ─── Player spawn ───
        // If arriving from a door, spawn at that edge's door positions.
        // Otherwise fall back to the S marker.
        const doorSpawns = spawns.filter(s => s.glyph === 'D');
        let spawnX: number;
        let spawnY: number;

        if (this.arrivalEdge && doorSpawns.length > 0) {
            // Find door tiles on the arrival edge
            const edgeDoors = doorSpawns.filter(d => this.getDoorEdge(d.col, d.row) === this.arrivalEdge);
            if (edgeDoors.length > 0) {
                // Average position of door tiles on that edge (handles multi-tile doors)
                const avgCol = edgeDoors.reduce((sum, d) => sum + d.col, 0) / edgeDoors.length;
                const avgRow = edgeDoors.reduce((sum, d) => sum + d.row, 0) / edgeDoors.length;
                spawnX = avgCol * TILE_SIZE + TILE_SIZE / 2;
                spawnY = avgRow * TILE_SIZE + TILE_SIZE / 2;

                // Nudge player inward so they don't immediately re-trigger the door
                if (this.arrivalEdge === 'west')  spawnX += TILE_SIZE;
                if (this.arrivalEdge === 'east')  spawnX -= TILE_SIZE;
                if (this.arrivalEdge === 'north') spawnY += TILE_SIZE;
                if (this.arrivalEdge === 'south') spawnY -= TILE_SIZE;
            } else {
                // Fallback to S marker
                const s = spawns.find(s => s.glyph === 'S');
                spawnX = s ? s.col * TILE_SIZE + TILE_SIZE / 2 : ROOM_WIDTH * TILE_SIZE / 2;
                spawnY = s ? s.row * TILE_SIZE + TILE_SIZE / 2 : ROOM_HEIGHT * TILE_SIZE / 2;
            }
        } else {
            const playerSpawn = spawns.find(s => s.glyph === 'S');
            spawnX = playerSpawn
                ? playerSpawn.col * TILE_SIZE + TILE_SIZE / 2
                : ROOM_WIDTH * TILE_SIZE / 2;
            spawnY = playerSpawn
                ? playerSpawn.row * TILE_SIZE + TILE_SIZE / 2
                : ROOM_HEIGHT * TILE_SIZE / 2;
        }
        this.player = new Player(this, spawnX, spawnY);
        this.physics.add.collider(this.player, this.layer);

        // ─── Entry momentum: carry velocity through door transitions ───
        if (this.arrivalEdge) {
            const body = this.player.body as Phaser.Physics.Arcade.Body;
            switch (this.arrivalEdge) {
                case 'south': body.setVelocityY(-280); break;  // came from below → jumping up
                case 'north': body.setVelocityY(100); break;   // came from above → falling in
                case 'west':  body.setVelocityX(130); break;   // came from left → walking right
                case 'east':  body.setVelocityX(-130); break;  // came from right → walking left
            }
        }
        this.arrivalEdge = null;

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

        // ─── Spike hazard zones ───
        this.spikeZones = [];
        this.layer.forEachTile((tile) => {
            if (tile.index === TileIndex.SPIKES) {
                const zoneX = tile.pixelX + TILE_SIZE / 2;
                const zoneY = tile.pixelY + TILE_SIZE / 2;
                const zone = this.add.zone(zoneX, zoneY, TILE_SIZE, TILE_SIZE);
                this.physics.add.existing(zone, true); // static body
                // Shrink the spike hitbox a bit so it's forgiving (top half of tile)
                const zoneBody = zone.body as Phaser.Physics.Arcade.StaticBody;
                zoneBody.setSize(TILE_SIZE - 4, TILE_SIZE / 2);
                zoneBody.setOffset(2, 0);
                this.spikeZones.push(zone);

                this.physics.add.overlap(this.player, zone, () => {
                    this.player.takeDamage(1, this.player.x);
                });
            }
        });

        // ─── Door trigger zones ───
        this.doorZones = [];
        const connections = DOOR_CONNECTIONS[roomId] || [];
        for (const conn of connections) {
            // Find D tiles on the matching edge
            const edgeDoors = doorSpawns.filter(d => this.getDoorEdge(d.col, d.row) === conn.fromEdge);
            if (edgeDoors.length === 0) continue;

            // Create a trigger zone covering all door tiles on this edge
            const minCol = Math.min(...edgeDoors.map(d => d.col));
            const maxCol = Math.max(...edgeDoors.map(d => d.col));
            const minRow = Math.min(...edgeDoors.map(d => d.row));
            const maxRow = Math.max(...edgeDoors.map(d => d.row));

            const zoneX = (minCol + maxCol + 1) / 2 * TILE_SIZE;
            const zoneY = (minRow + maxRow + 1) / 2 * TILE_SIZE;
            const zoneW = (maxCol - minCol + 1) * TILE_SIZE;
            const zoneH = (maxRow - minRow + 1) * TILE_SIZE;

            const zone = this.add.zone(zoneX, zoneY, zoneW, zoneH);
            this.physics.add.existing(zone, true); // static body
            this.doorZones.push(zone);

            // Overlap: player touches door → transition!
            this.physics.add.overlap(this.player, zone, () => {
                this.transitionToRoom(conn.targetRoom, conn.toEdge);
            });
        }
    }

    /**
     * Determine which edge a door tile is on based on its grid position.
     */
    private getDoorEdge(col: number, row: number): DoorEdge | null {
        if (row === 0) return 'north';
        if (row === ROOM_HEIGHT - 1) return 'south';
        if (col === 0) return 'west';
        if (col === ROOM_WIDTH - 1) return 'east';
        return null;
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
