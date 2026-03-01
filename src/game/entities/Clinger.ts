import Phaser from 'phaser';
import { Enemy } from './Enemy';

/**
 * Boss sprite frames — using Kenney 1-bit spritesheet.
 * Row 17 has larger/scarier critters. We'll use a spider-ish one.
 * Using row 17, col 8-11 area for boss frames.
 */
const CLINGER_IDLE_FRAME = 17 * 20 + 8;  // 348 — spider idle
const CLINGER_WALK_FRAMES = [17 * 20 + 8, 17 * 20 + 9]; // 348, 349 — 2-frame scuttle

/** The Clinger — boss tuning constants. */
export const CLINGER = {
    HP:              8,     // hits to defeat
    DAMAGE:          1,     // contact damage
    SCUTTLE_SPEED: 100,     // px/s — floor movement speed
    LUNGE_SPEED:   280,     // px/s — horizontal lunge from wall
    DROP_SPEED:    250,     // px/s — drop from ceiling
    /** Phase durations */
    CLING_TIME:   1500,     // ms — how long it clings before acting
    SCUTTLE_TIME: 2000,     // ms — how long it scuttles on floor (vulnerable!)
    LUNGE_PAUSE:   300,     // ms — telegraph before lunging
    DROP_PAUSE:    400,     // ms — telegraph before dropping
    /** Arena bounds (tile coords, adjusted to world in constructor) */
    ARENA_LEFT:     2,      // tiles from left wall
    ARENA_RIGHT:   17,      // tiles from right wall
    ARENA_TOP:      2,      // tiles from ceiling
    ARENA_FLOOR:   13,      // tile row of floor
} as const;

/** Which phase The Clinger is in. */
type ClingerPhase =
    | 'intro'       // brief pause when room is entered
    | 'cling-wall'  // clinging to a wall, choosing attack
    | 'telegraph'   // flash/shake before attack (gives player time to react)
    | 'lunge'       // horizontal lunge across the room
    | 'cling-ceil'  // clinging to ceiling, about to drop
    | 'drop'        // dropping straight down
    | 'scuttle'     // on floor, walking toward player (VULNERABLE)
    | 'defeated';   // dead, playing death sequence

const TILE_SIZE = 16;

/**
 * The Clinger — first boss. Fear incarnate.
 *
 * Surface: A giant spider-thing blocking the shaft.
 * Hidden:  Fear. She clings to it because letting go means going deeper.
 *
 * Attack pattern:
 * 1. Clings to a wall for CLING_TIME ms
 * 2. Telegraphs (flash) for LUNGE_PAUSE ms
 * 3. Lunges across the room horizontally
 * 4. Clings to ceiling briefly
 * 5. Drops straight down
 * 6. Scuttles along the floor toward the player (VULNERABLE window)
 * 7. Returns to wall and repeats
 *
 * The player learns: wait for the scuttle, dodge the lunge, punish the floor phase.
 * Fear attacks in bursts — you survive by being patient.
 */
export class Clinger extends Enemy {
    private phase: ClingerPhase = 'intro';
    private phaseTimer = 0;
    /** Which wall to cling to: -1 = left, 1 = right */
    private wallSide: -1 | 1 = -1;
    /** World-space arena bounds */
    private arenaLeft: number;
    private arenaRight: number;
    private arenaTop: number;
    private arenaFloor: number;
    /** Reference to player for tracking during scuttle */
    private playerRef: Phaser.Physics.Arcade.Sprite | null = null;
    /** Attack count — alternates pattern */
    private attackCount = 0;
    /** Reference to tilemap layer for collision */
    private groundLayer: Phaser.Tilemaps.TilemapLayer;

    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        groundLayer: Phaser.Tilemaps.TilemapLayer,
    ) {
        super(scene, x, y, CLINGER_IDLE_FRAME, {
            hp: CLINGER.HP,
            contactDamage: CLINGER.DAMAGE,
        });

        this.groundLayer = groundLayer;

        // Bigger body for a boss — 14×14 px
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setSize(14, 14);
        body.setOffset(1, 1);

        // Calculate arena bounds in world space
        this.arenaLeft = CLINGER.ARENA_LEFT * TILE_SIZE + TILE_SIZE / 2;
        this.arenaRight = CLINGER.ARENA_RIGHT * TILE_SIZE + TILE_SIZE / 2;
        this.arenaTop = CLINGER.ARENA_TOP * TILE_SIZE + TILE_SIZE / 2;
        this.arenaFloor = CLINGER.ARENA_FLOOR * TILE_SIZE + TILE_SIZE / 2;

        // Start with intro pause
        this.phase = 'intro';
        this.phaseTimer = 1000; // 1 second before boss activates
        body.setAllowGravity(false); // boss controls its own movement

        // ─── Scuttle animation ───
        const animKey = 'clinger-scuttle';
        if (!scene.anims.exists(animKey)) {
            scene.anims.create({
                key: animKey,
                frames: CLINGER_WALK_FRAMES.map(f => ({ key: 'tiles', frame: f })),
                frameRate: 8,
                repeat: -1,
            });
        }
    }

    /** Set the player reference for tracking. Called by Game.ts after spawn. */
    setPlayer(player: Phaser.Physics.Arcade.Sprite): void {
        this.playerRef = player;
    }

    get currentPhase(): ClingerPhase { return this.phase; }
    get isDefeated(): boolean { return this.phase === 'defeated'; }

    protected behave(delta: number): void {
        if (this.phase === 'defeated') return;
        if (this.isHitstunned) return;

        this.phaseTimer -= delta;
        const body = this.body as Phaser.Physics.Arcade.Body;

        switch (this.phase) {
            case 'intro':
                // Hovering in place, menacingly
                body.setVelocity(0, 0);
                if (this.phaseTimer <= 0) {
                    this.goToWall();
                }
                break;

            case 'cling-wall':
                // Clinging to wall, waiting
                body.setVelocity(0, 0);
                // Gentle bob
                this.y += Math.sin(Date.now() / 200) * 0.3;

                if (this.phaseTimer <= 0) {
                    // Telegraph before attack
                    this.phase = 'telegraph';
                    this.phaseTimer = CLINGER.LUNGE_PAUSE;
                    // Flash to warn player
                    this.setTintFill(0xffffff);
                    this.scene.time.delayedCall(100, () => {
                        if (this.alive) this.clearTint();
                    });
                    this.scene.time.delayedCall(200, () => {
                        if (this.alive) this.setTintFill(0xffffff);
                    });
                }
                break;

            case 'telegraph':
                body.setVelocity(0, 0);
                if (this.phaseTimer <= 0) {
                    this.clearTint();
                    // Lunge across the room!
                    this.phase = 'lunge';
                    const lungeDir = this.wallSide === -1 ? 1 : -1;
                    body.setVelocityX(CLINGER.LUNGE_SPEED * lungeDir);
                    body.setVelocityY(0);
                    this.setFlipX(lungeDir === -1);
                    this.play('clinger-scuttle');
                }
                break;

            case 'lunge':
                // Flying across the room
                // Check if we've reached the opposite wall
                if ((this.wallSide === -1 && this.x >= this.arenaRight) ||
                    (this.wallSide ===  1 && this.x <= this.arenaLeft)) {
                    body.setVelocity(0, 0);
                    // Go to ceiling
                    this.phase = 'cling-ceil';
                    this.phaseTimer = CLINGER.DROP_PAUSE;
                    this.wallSide = (this.wallSide * -1) as -1 | 1;
                    // Move to ceiling height
                    this.y = this.arenaTop;
                    // Position above player for the drop
                    if (this.playerRef) {
                        this.x = Phaser.Math.Clamp(
                            this.playerRef.x,
                            this.arenaLeft,
                            this.arenaRight,
                        );
                    }
                    // Telegraph the drop
                    this.setTintFill(0xffffff);
                    this.scene.time.delayedCall(150, () => {
                        if (this.alive) this.clearTint();
                    });
                }
                break;

            case 'cling-ceil':
                body.setVelocity(0, 0);
                // Shake to telegraph
                this.x += (Math.random() - 0.5) * 2;
                if (this.phaseTimer <= 0) {
                    // DROP!
                    this.phase = 'drop';
                    body.setVelocityY(CLINGER.DROP_SPEED);
                    body.setVelocityX(0);
                    this.stop(); // stop animation during drop
                }
                break;

            case 'drop':
                // Falling straight down
                if (this.y >= this.arenaFloor) {
                    // Hit the floor — camera shake!
                    this.y = this.arenaFloor;
                    body.setVelocity(0, 0);
                    this.scene.cameras.main.shake(100, 0.01);

                    // Scuttle phase — VULNERABLE
                    this.phase = 'scuttle';
                    this.phaseTimer = CLINGER.SCUTTLE_TIME;
                    this.play('clinger-scuttle');
                    this.attackCount++;
                }
                break;

            case 'scuttle':
                // Walk toward player — this is the vulnerable window!
                if (this.playerRef) {
                    const dir = this.playerRef.x < this.x ? -1 : 1;
                    body.setVelocityX(CLINGER.SCUTTLE_SPEED * dir);
                    body.setVelocityY(0);
                    this.setFlipX(dir === -1);
                }

                if (this.phaseTimer <= 0) {
                    // Back to wall
                    this.goToWall();
                }
                break;
        }
    }

    /** Move to the wall to start the cling phase. */
    private goToWall(): void {
        // Alternate walls each cycle
        const targetX = this.wallSide === -1 ? this.arenaLeft : this.arenaRight;
        const targetY = this.arenaTop + (this.arenaFloor - this.arenaTop) * 0.4; // 40% down

        this.setPosition(targetX, targetY);
        this.setFlipX(this.wallSide === 1);
        this.stop(); // stop walk anim

        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(0, 0);

        this.phase = 'cling-wall';
        this.phaseTimer = CLINGER.CLING_TIME;
    }

    /** Override die to play boss death sequence. */
    protected die(): void {
        this.phase = 'defeated';
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.enable = false;
        body.setVelocity(0, 0);

        // Boss death is more dramatic than regular enemies
        this.scene.cameras.main.shake(300, 0.02);

        // Flash rapidly
        const flashEvent = this.scene.time.addEvent({
            delay: 80,
            repeat: 8,
            callback: () => {
                if (this.tintTopLeft === 0xffffff) {
                    this.clearTint();
                } else {
                    this.setTintFill(0xffffff);
                }
            },
        });

        // Expand and fade after flashing
        this.scene.time.delayedCall(800, () => {
            flashEvent.destroy();
            this.clearTint();
            this.scene.tweens.add({
                targets: this,
                scaleX: 2,
                scaleY: 2,
                alpha: 0,
                duration: 500,
                ease: 'Power2',
                onComplete: () => {
                    // Emit defeated event for Game.ts to handle (open doors, etc.)
                    this.scene.events.emit('boss-defeated', 'clinger');
                    this.destroy();
                },
            });
        });
    }
}
