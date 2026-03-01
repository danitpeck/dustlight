import Phaser from 'phaser';
import { parseRoom, ROOM_WIDTH, ROOM_HEIGHT } from '../rooms/parser';
import { ROOMS, STARTING_ROOM } from '../rooms/index';
import { getSolidTileIndices, TileIndex } from '../data/glyphs';
import { Player } from '../entities/Player';
import { Enemy, ENEMY_DEFAULTS } from '../entities/Enemy';
import { Crawler } from '../entities/Crawler';
import { Clinger } from '../entities/Clinger';
import { DOOR_CONNECTIONS, DoorEdge, OPPOSITE_EDGE } from '../rooms/connections';
import { EditorOverlay } from '../editor/EditorOverlay';
import { AbilityState, AbilityId, createAbilityState, unlockAbility, hasAbility, ROOM_ABILITY_MAP, unlockAll } from '../systems/abilities';
import { GROUND_POUND } from '../data/constants';

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
    /** Thin platform physics bodies (separate from tilemap for clean one-way collision) */
    private platformBodies: Phaser.Physics.Arcade.StaticGroup | null = null;
    /** Whether the scene is in hitstop (freeze frames on melee connect) */
    private hitstopTimer = 0;
    /** Current room ID (for respawn) */
    private currentRoomId: string = STARTING_ROOM;
    /** True while a room transition is in progress (prevents re-triggering) */
    private isTransitioning = false;
    /** Which edge the player should spawn at (null = use S marker) */
    private arrivalEdge: DoorEdge | null = null;
    /** Player feet Y at end of last frame — for manual platform landing */
    private prevPlayerFeetY = 0;
    /** In-game debug tile editor */
    private editor!: EditorOverlay;
    /** Ability unlock state — persists across room transitions */
    private abilityState: AbilityState = createAbilityState();
    /** Ability pickup zones in the current room */
    private pickupZones: Phaser.GameObjects.Zone[] = [];
    /** Phase wall tile indices (to toggle collision during Phase Shift) */
    private phaseWallTiles: Phaser.Tilemaps.Tile[] = [];
    /** Set of defeated boss IDs — persists across room transitions */
    private defeatedBosses: Set<string> = new Set();
    /** The active boss in the current room (if any) */
    private activeBoss: Clinger | null = null;
    /** Graphics used for iris wipe mask */
    private irisGraphics!: Phaser.GameObjects.Graphics;
    /** Geometry mask for the iris wipe */
    private irisMask!: Phaser.Display.Masks.GeometryMask;
    /** Current iris radius (tweened) */
    private irisRadius = 0;
    /** Center of the iris wipe */
    private irisX = 0;
    private irisY = 0;
    /** Max radius needed to cover the full screen */
    private readonly IRIS_MAX = 200; // sqrt(320² + 240²) / 2 ≈ 200

    constructor() {
        super('Game');
    }

    create(): void {
        // Disable right-click context menu (editor uses right-click to erase)
        this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // ── Iris wipe mask setup ──
        // Graphics is used only as a mask shape — remove from display list so it's not drawn
        this.irisGraphics = this.make.graphics({});
        this.irisMask = new Phaser.Display.Masks.GeometryMask(this, this.irisGraphics);
        this.irisRadius = this.IRIS_MAX;

        // Create the debug editor (must exist before loadRoom so it can receive room data)
        this.editor = new EditorOverlay(this, (ascii) => {
            this.switchRoom(this.currentRoomId, null, ascii);
        });

        this.loadRoom(STARTING_ROOM);
        this.setupDebugKeys();

        // ── Respawn on death ──
        this.events.on('player-dead', () => {
            this.time.delayedCall(600, () => {
                this.switchRoom(this.currentRoomId);
            });
        });

        // ── Phase Shift: toggle phase wall collision ──
        this.events.on('phase-start', () => {
            for (const tile of this.phaseWallTiles) {
                tile.setCollision(false);
            }
        });
        this.events.on('phase-end', () => {
            for (const tile of this.phaseWallTiles) {
                tile.setCollision(true);
            }
            this.ejectFromPhaseWalls();
        });

        // ── Ground Pound: break cracked floors + AOE damage ──
        this.events.on('ground-pound-impact', (x: number, y: number) => {
            this.breakCrackedFloors(x, y);
            this.groundPoundDamageEnemies(x, y);
            // Hitstop on impact for extra juice
            this.hitstopTimer = GROUND_POUND.IMPACT_FREEZE_MS;
        });

        // ── Boss defeated: open locked doors, track globally ──
        this.events.on('boss-defeated', (bossId: string) => {
            this.defeatedBosses.add(bossId);
            this.activeBoss = null;
            // Freeze for a beat to let the death animation breathe
            this.hitstopTimer = 200;
        });
    }

    update(time: number, delta: number): void {
        // ── Editor mode: skip gameplay, let editor handle everything ──
        if (this.editor.isActive) {
            this.editor.update();
            return;
        }

        // ── Redraw iris mask every frame while transitioning ──
        if (this.isTransitioning) {
            this.irisGraphics.clear();
            this.irisGraphics.fillStyle(0xffffff);
            this.irisGraphics.fillCircle(this.irisX, this.irisY, this.irisRadius);
        }

        // ── Hitstop: freeze everything for a few frames on melee connect ──
        if (this.hitstopTimer > 0) {
            this.hitstopTimer -= delta;
            return; // skip all updates — that's the juice!
        }

        // ── Manual one-way platform landing (runs BEFORE tick so onGround is correct) ──
        this.resolvePlayerPlatforms();

        // ── Snap player Y when grounded to kill sub-pixel jitter ──
        // Phaser's tilemap separation can leave body.position.y at fractional
        // values, which causes 1px oscillation at certain tile boundaries.
        // Rounding when on the ground is invisible and eliminates the flicker.
        const pBody = this.player.body as Phaser.Physics.Arcade.Body;
        if (pBody.blocked.down) {
            pBody.position.y = Math.round(pBody.position.y);
        }

        this.player.tick(time, delta);

        for (const enemy of this.enemies) {
            enemy.tick(time, delta);
        }

        // Prune dead enemies
        this.enemies = this.enemies.filter(e => e.alive);

        // Snapshot feet Y AFTER everything — used next frame for crossing detection
        const pb = this.player.body as Phaser.Physics.Arcade.Body;
        this.prevPlayerFeetY = pb.position.y + pb.height;
    }

    /**
     * Manual one-way platform resolution.
     *
     * Runs after physics step but before player.tick() so that
     * body.blocked.down is set correctly for ground detection.
     *
     * Logic: if the player's feet crossed a platform's top edge this frame
     * (were at-or-above last frame, are at-or-below now), snap them onto it.
     * Completely bypasses Phaser's collision separation — no oscillation possible.
     */
    private resolvePlayerPlatforms(): void {
        if (!this.platformBodies) return;
        if (this.player.droppingThrough) return;

        const body = this.player.body as Phaser.Physics.Arcade.Body;
        // Don't land on platforms while jumping upward
        if (body.velocity.y < 0) return;

        const feetY = body.position.y + body.height;
        const prevFeetY = this.prevPlayerFeetY;

        for (const child of this.platformBodies.getChildren()) {
            const sb = (child as Phaser.GameObjects.Zone).body as Phaser.Physics.Arcade.StaticBody;
            const platTop = sb.position.y;
            const platLeft = sb.position.x;
            const platRight = platLeft + sb.width;

            // Horizontal overlap?
            if (body.position.x + body.width <= platLeft) continue;
            if (body.position.x >= platRight) continue;

            // Feet crossed or reached the platform top this frame?
            // prevFeetY <= platTop (was at or above) AND feetY >= platTop (now at or below)
            if (prevFeetY <= platTop + 1 && feetY >= platTop) {
                // Snap moth onto the platform
                body.position.y = platTop - body.height;
                body.velocity.y = 0;
                body.blocked.down = true;
                return;
            }
        }
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
                if (this.editor.isActive) return; // editor uses number keys for palette
                console.log(`[DEBUG] Switching to room: ${roomId}`);
                this.switchRoom(roomId);
            });
        }

        // F1 — toggle debug tile editor
        const editorKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F1);
        editorKey.on('down', () => {
            this.editor.toggle();
        });

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

        // F2 — unlock all abilities (debug)
        const unlockAllKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F2);
        unlockAllKey.on('down', () => {
            this.abilityState = unlockAll();
            this.player.abilities = this.abilityState;
            console.log('[DEBUG] All abilities unlocked!');
        });

        // F3 — unlock next ability in sequence (debug)
        const unlockNextKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F3);
        unlockNextKey.on('down', () => {
            const next = this.getNextLockedAbility();
            if (next) {
                this.abilityState = unlockAbility(this.abilityState, next);
                this.player.abilities = this.abilityState;
                console.log(`[DEBUG] Unlocked: ${next}`);
            } else {
                console.log('[DEBUG] All abilities already unlocked');
            }
        });
    }

    /**
     * Tear down the current room and load a new one.
     */
    private switchRoom(roomId: string, arrivalEdge: DoorEdge | null = null, overrideAscii?: string): void {
        // Clean up old room
        for (const enemy of this.enemies) {
            enemy.destroy();
        }
        this.enemies = [];
        this.activeBoss = null;
        for (const zone of this.doorZones) {
            zone.destroy();
        }
        this.doorZones = [];
        for (const zone of this.spikeZones) {
            zone.destroy();
        }
        this.spikeZones = [];
        for (const zone of this.pickupZones) {
            zone.destroy();
        }
        this.pickupZones = [];
        this.phaseWallTiles = [];
        if (this.platformBodies) {
            this.platformBodies.destroy(true);
            this.platformBodies = null;
        }
        this.player.meleeZone.destroy();
        this.player.slashGraphics.destroy();
        this.player.dustParticles.destroy();
        this.player.destroy();
        this.layer.destroy();
        this.map.destroy();

        this.arrivalEdge = arrivalEdge;
        this.loadRoom(roomId, overrideAscii);
    }

    /**
     * Transition to another room via a door — iris close, switch, iris open.
     */
    private transitionToRoom(roomId: string, arrivalEdge: DoorEdge): void {
        if (this.isTransitioning) return;
        this.isTransitioning = true;

        // Freeze player movement during transition
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(0, 0);
        body.setAcceleration(0, 0);
        body.setAllowGravity(false);

        // Center the iris on the moth
        this.irisX = this.player.x;
        this.irisY = this.player.y;

        // Apply mask to the camera
        this.cameras.main.setMask(this.irisMask);

        // Iris close → switch room → iris open
        this.tweens.add({
            targets: this,
            irisRadius: 0,
            duration: 180,
            ease: 'Sine.easeIn',
            onComplete: () => {
                this.switchRoom(roomId, arrivalEdge);

                // Re-center iris on new player position
                this.irisX = this.player.x;
                this.irisY = this.player.y;

                // Iris open
                this.tweens.add({
                    targets: this,
                    irisRadius: this.IRIS_MAX,
                    duration: 200,
                    ease: 'Sine.easeOut',
                    onComplete: () => {
                        this.cameras.main.clearMask();
                        this.isTransitioning = false;
                    },
                });
            },
        });
    }

    /**
     * Parse an ASCII room and render it as a Phaser tilemap,
     * then spawn the player at the S marker.
     */
    private loadRoom(roomId: string, overrideAscii?: string): void {
        this.currentRoomId = roomId;
        const ascii = overrideAscii ?? ROOMS[roomId];
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

        // Pass room data to the editor
        this.editor?.loadRoom(roomId, ascii, this.map);

        // Thin platform tiles are VISUAL ONLY — no tile collision.
        // Physics is handled by separate static bodies below.
        // (This avoids Phaser's tilemap collision bugs at certain Y values.)

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
        this.player.abilities = this.abilityState;
        this.physics.add.collider(this.player, this.layer);

        // ─── Thin platform zones (for manual landing + enemy collision) ───
        // NO player collider — landing is handled manually in resolvePlayerPlatforms().
        // This completely bypasses Phaser's collision separation to avoid oscillation bugs.
        this.platformBodies = this.physics.add.staticGroup();
        this.layer.forEachTile((tile) => {
            if (tile.index === TileIndex.THIN_PLATFORM) {
                const zone = this.add.zone(
                    tile.pixelX + TILE_SIZE / 2,
                    tile.pixelY + TILE_SIZE / 2,
                    TILE_SIZE,
                    TILE_SIZE,
                );
                this.physics.add.existing(zone, true); // static body
                this.platformBodies!.add(zone);
            }
        });

        // Init prev-feet snapshot for platform crossing detection
        const initBody = this.player.body as Phaser.Physics.Arcade.Body;
        this.prevPlayerFeetY = initBody.position.y + initBody.height;

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

        // ─── Spawn enemies from E glyphs + bosses from B glyphs ───
        this.enemies = [];
        this.activeBoss = null;
        for (const spawn of spawns) {
            const worldX = spawn.col * TILE_SIZE + TILE_SIZE / 2;
            const worldY = spawn.row * TILE_SIZE + TILE_SIZE / 2;

            if (spawn.glyph === 'E') {
                const crawler = new Crawler(this, worldX, worldY, this.layer);
                this.physics.add.collider(crawler, this.layer);
                // Crawlers also walk on thin platform bodies
                if (this.platformBodies) {
                    this.physics.add.collider(crawler, this.platformBodies);
                }
                this.enemies.push(crawler);
            } else if (spawn.glyph === 'B') {
                // Boss spawn — only if not already defeated
                const bossId = this.getBossIdForRoom(roomId);
                if (bossId && !this.defeatedBosses.has(bossId)) {
                    const boss = new Clinger(this, worldX, worldY, this.layer);
                    boss.setPlayer(this.player);
                    this.enemies.push(boss);
                    this.activeBoss = boss;
                }
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

        // ─── Ability pickup zones ───
        // Scan tilemap for ABILITY_PICKUP tiles and create overlap triggers.
        // Which ability a pickup grants is determined by ROOM_ABILITY_MAP,
        // or defaults to a debug "next ability" if the room isn't mapped.
        this.pickupZones = [];
        this.layer.forEachTile((tile) => {
            if (tile.index === TileIndex.ABILITY_PICKUP) {
                const zoneX = tile.pixelX + TILE_SIZE / 2;
                const zoneY = tile.pixelY + TILE_SIZE / 2;
                const zone = this.add.zone(zoneX, zoneY, TILE_SIZE, TILE_SIZE);
                this.physics.add.existing(zone, true);
                this.pickupZones.push(zone);

                this.physics.add.overlap(this.player, zone, () => {
                    this.onAbilityPickup(tile, zone);
                });
            }
        });

        // ─── Phase wall tile references (for Phase Shift collision toggling) ───
        this.phaseWallTiles = [];
        this.layer.forEachTile((tile) => {
            if (tile.index === TileIndex.PHASE_WALL) {
                this.phaseWallTiles.push(tile);
            }
        });
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
     * Map room IDs to boss IDs. Returns null if the room has no boss.
     */
    private getBossIdForRoom(roomId: string): string | null {
        const ROOM_BOSS_MAP: Record<string, string> = {
            'C5': 'clinger',
            // Future: 'F?': 'current', 'S?': 'updraft', etc.
        };
        return ROOM_BOSS_MAP[roomId] ?? null;
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

    // ═══════════════════════════════════════════════════════
    // ─── Ability Pickup System ────────────────────────────
    // ═══════════════════════════════════════════════════════

    /**
     * Called when the player overlaps an ability pickup tile (*).
     * Determines which ability to grant, unlocks it, plays VFX,
     * and removes the tile from the world.
     */
    private onAbilityPickup(tile: Phaser.Tilemaps.Tile, zone: Phaser.GameObjects.Zone): void {
        // Determine which ability this pickup grants
        const abilityId = ROOM_ABILITY_MAP[this.currentRoomId] ?? this.getNextLockedAbility();
        if (!abilityId) return; // all abilities already unlocked

        // Already have this one? Skip
        if (hasAbility(this.abilityState, abilityId)) return;

        // ── Unlock the ability ──
        this.abilityState = unlockAbility(this.abilityState, abilityId);
        this.player.abilities = this.abilityState;
        console.log(`[ABILITY] Unlocked: ${abilityId}!`);

        // ── Remove the tile + zone ──
        this.layer.removeTileAt(tile.x, tile.y);
        zone.destroy();
        this.pickupZones = this.pickupZones.filter(z => z !== zone);

        // ── Pickup VFX! ──
        this.pickupJuice(tile.pixelX + TILE_SIZE / 2, tile.pixelY + TILE_SIZE / 2, abilityId);
    }

    /**
     * Get the next ability in acquisition order that hasn't been unlocked yet.
     * Used as a fallback when ROOM_ABILITY_MAP doesn't have an entry for the room.
     */
    private getNextLockedAbility(): AbilityId | null {
        const order: AbilityId[] = ['wallCling', 'dash', 'doubleJump', 'groundPound', 'phaseShift'];
        for (const id of order) {
            if (!hasAbility(this.abilityState, id)) return id;
        }
        return null;
    }

    /**
     * Juice for picking up an ability — flash, freeze, particle burst.
     * This is the "you got a thing!" moment. Make it feel GOOD.
     */
    private pickupJuice(x: number, y: number, abilityId: AbilityId): void {
        // Screen flash — warm white
        this.cameras.main.flash(300, 255, 255, 220, false, undefined, 0.6);

        // Brief hitstop — freeze to let it land
        this.hitstopTimer = 200;

        // Camera zoom pulse — using a tween instead of zoomTo because
        // Phaser's zoomTo callback fights with itself when chaining.
        this.cameras.main.zoom = 1; // reset in case a previous zoom was stuck
        this.tweens.add({
            targets: this.cameras.main,
            zoom: 1.15,
            duration: 150,
            ease: 'Sine.easeOut',
            yoyo: true,
            yoyoDelay: 50,
            onComplete: () => {
                this.cameras.main.zoom = 1;
            },
        });

        // Particle burst at pickup location
        if (this.player.dustParticles) {
            this.player.dustParticles.emitParticleAt(x, y, 12);
        }

        // Show ability name text — the moth earned this!
        const ABILITY_NAMES: Record<AbilityId, string> = {
            wallCling: 'WALL CLING',
            dash: 'DASH',
            doubleJump: 'DOUBLE JUMP',
            groundPound: 'GROUND POUND',
            phaseShift: 'PHASE SHIFT',
        };
        const label = this.add.text(x, y - 20, ABILITY_NAMES[abilityId], {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 2,
            align: 'center',
        }).setOrigin(0.5);
        label.setDepth(20);

        // Float up and fade out
        this.tweens.add({
            targets: label,
            y: label.y - 24,
            alpha: 0,
            duration: 1200,
            ease: 'Power2',
            onComplete: () => label.destroy(),
        });
    }

    // ═══════════════════════════════════════════════════════
    // ─── Ground Pound: Cracked Floor Breaking ─────────────
    // ═══════════════════════════════════════════════════════

    /**
     * Check for cracked floor tiles (`=`) under the impact point and break them.
     * Called when the moth lands a ground pound.
     */
    private breakCrackedFloors(x: number, y: number): void {
        // Check a small area below the moth's feet
        const tileCol = Math.floor(x / TILE_SIZE);
        const tileRow = Math.floor((y + 8) / TILE_SIZE); // slightly below center

        // Check the tile directly below and its neighbors
        for (let dc = -1; dc <= 1; dc++) {
            const col = tileCol + dc;
            if (col < 0 || col >= ROOM_WIDTH) continue;

            for (let dr = 0; dr <= 1; dr++) {
                const row = tileRow + dr;
                if (row < 0 || row >= ROOM_HEIGHT) continue;

                const tile = this.layer.getTileAt(col, row);
                if (tile && tile.index === TileIndex.CRACKED_FLOOR) {
                    // Remove the cracked floor tile — it's gone!
                    this.layer.removeTileAt(col, row);

                    // Particle burst at the broken tile
                    const tileWorldX = col * TILE_SIZE + TILE_SIZE / 2;
                    const tileWorldY = row * TILE_SIZE + TILE_SIZE / 2;
                    if (this.player.dustParticles) {
                        this.player.dustParticles.emitParticleAt(tileWorldX, tileWorldY, 6);
                    }
                }
            }
        }
    }

    /**
     * Deal AOE damage to all enemies within the ground pound impact zone.
     * Hits anything within the AOE rectangle centered below the moth.
     */
    private groundPoundDamageEnemies(x: number, y: number): void {
        const halfW = GROUND_POUND.AOE_WIDTH / 2;
        const aoeTop = y;
        const aoeBottom = y + GROUND_POUND.AOE_HEIGHT;

        for (const enemy of this.enemies) {
            if (!enemy.alive) continue;

            const dx = Math.abs(enemy.x - x);
            const ey = enemy.y;

            if (dx <= halfW && ey >= aoeTop && ey <= aoeBottom) {
                const hit = enemy.takeDamage(2, x); // ground pound hits HARD
                if (hit) {
                    this.cameras.main.shake(80, 0.008);
                }
            }
        }
    }

    /**
     * If the moth is stuck inside a phase wall when phase shift ends,
     * eject her to the nearest non-solid tile so she doesn't clip
     * through the world.
     */
    private ejectFromPhaseWalls(): void {
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        const centerX = body.center.x;
        const centerY = body.center.y;

        // Which tile is the moth's center in?
        const col = Math.floor(centerX / TILE_SIZE);
        const row = Math.floor(centerY / TILE_SIZE);

        const tile = this.layer.getTileAt(col, row);
        if (!tile || tile.index !== TileIndex.PHASE_WALL) return; // not stuck

        // Search outward in 4 directions for the nearest non-solid tile.
        // Prefer horizontal ejection (left/right) over vertical so the
        // moth lands somewhere natural instead of teleporting up/down.
        const directions: [number, number][] = [
            [-1,  0], // left
            [ 1,  0], // right
            [ 0, -1], // up
            [ 0,  1], // down
        ];

        let bestDist = Infinity;
        let bestCol = col;
        let bestRow = row;

        for (const [dx, dy] of directions) {
            for (let dist = 1; dist <= Math.max(ROOM_WIDTH, ROOM_HEIGHT); dist++) {
                const testCol = col + dx * dist;
                const testRow = row + dy * dist;

                // Out of bounds — stop searching this direction
                if (testCol < 0 || testCol >= ROOM_WIDTH ||
                    testRow < 0 || testRow >= ROOM_HEIGHT) break;

                const testTile = this.layer.getTileAt(testCol, testRow);
                const isSolid = testTile && testTile.collideUp;

                if (!isSolid) {
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestCol = testCol;
                        bestRow = testRow;
                    }
                    break; // found nearest clear tile in this direction
                }
            }
        }

        if (bestDist < Infinity) {
            const newX = bestCol * TILE_SIZE + TILE_SIZE / 2;
            const newY = bestRow * TILE_SIZE + TILE_SIZE / 2;
            this.player.setPosition(newX, newY);
            body.reset(newX, newY);

            // Little dust poof to sell the ejection
            if (this.player.dustParticles) {
                this.player.dustParticles.emitParticleAt(newX, newY, 4);
            }
        }
    }
}
