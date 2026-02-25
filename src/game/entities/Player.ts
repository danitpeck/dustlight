import Phaser from 'phaser';

/**
 * Moth sprite — row 14, col 3 on the Kenney 1-Bit spritesheet.
 * Index = 14 * 20 + 3 = 283.
 */
const MOTH_FRAME = 283;

/**
 * Movement tuning constants.
 * Tweak these until the moth feels ~just right~.
 *
 * All extracted as plain data so they're easy to test
 * and eventually feed into a debug editor.
 */
export const MOVE = {
    MAX_RUN:      130,   // px/s — max horizontal speed
    ACCEL:        900,   // px/s² — run acceleration (snappy!)
    DRAG:         700,   // px/s² — deceleration when no input
    JUMP_VEL:    -280,   // px/s — initial upward impulse (negative = up)
    JUMP_CUT:     0.4,   // multiplier applied to velocityY on early release
    COYOTE_MS:     80,   // ms grace period after leaving a ledge
    BUFFER_MS:    100,   // ms jump-press memory before landing
} as const;

/**
 * Player entity — the Moth.
 *
 * Arcade physics sprite with:
 * - Horizontal run w/ accel/decel curves
 * - Variable-height jump (hold = full, tap = short hop)
 * - Coyote time (forgiveness after walking off ledges)
 * - Jump buffering (press jump just before landing)
 *
 * Call `player.tick(time, delta)` from the scene's update().
 * (Named `tick` to avoid shadowing Phaser's internal `update`.)
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private jumpKey!: Phaser.Input.Keyboard.Key;

    /** ms remaining in the coyote-time window */
    private coyoteTimer = 0;
    /** ms remaining in the jump-buffer window */
    private jumpBufferTimer = 0;
    /** true while ascending from a jump (for variable height cut) */
    private isJumping = false;
    /** edge-detection: was jump held last frame? */
    private jumpWasDown = false;

    constructor(scene: Phaser.Scene, x: number, y: number) {
        super(scene, x, y, 'tiles', MOTH_FRAME);

        scene.add.existing(this);
        scene.physics.add.existing(this);

        // ─── Physics body ───
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setMaxVelocityX(MOVE.MAX_RUN);
        body.setDragX(MOVE.DRAG);

        // Slightly smaller hitbox for forgiving collisions (16×16 tile → 12×14 box)
        body.setSize(12, 14);
        body.setOffset(2, 2);

        // ─── Input ───
        if (scene.input.keyboard) {
            this.cursors = scene.input.keyboard.createCursorKeys();
            this.jumpKey = scene.input.keyboard.addKey(
                Phaser.Input.Keyboard.KeyCodes.SPACE,
            );
        }
    }

    /**
     * Per-frame update — call from `Scene.update(time, delta)`.
     */
    tick(_time: number, delta: number): void {
        const body = this.body as Phaser.Physics.Arcade.Body;
        const onGround = body.blocked.down;

        // ─── Horizontal movement ───
        if (this.cursors.left.isDown) {
            body.setAccelerationX(-MOVE.ACCEL);
            this.setFlipX(true);
        } else if (this.cursors.right.isDown) {
            body.setAccelerationX(MOVE.ACCEL);
            this.setFlipX(false);
        } else {
            body.setAccelerationX(0);
        }

        // ─── Coyote time ───
        if (onGround) {
            this.coyoteTimer = MOVE.COYOTE_MS;
            this.isJumping = false;
        } else {
            this.coyoteTimer -= delta;
        }

        // ─── Jump buffer ───
        const jumpHeld = this.cursors.up.isDown || this.jumpKey.isDown;
        const jumpJustPressed = jumpHeld && !this.jumpWasDown;

        if (jumpJustPressed) {
            this.jumpBufferTimer = MOVE.BUFFER_MS;
        } else {
            this.jumpBufferTimer -= delta;
        }

        // ─── Execute jump ───
        if (this.coyoteTimer > 0 && this.jumpBufferTimer > 0) {
            body.setVelocityY(MOVE.JUMP_VEL);
            this.isJumping = true;
            this.coyoteTimer = 0;
            this.jumpBufferTimer = 0;
        }

        // ─── Variable jump height (cut on early release) ───
        if (this.isJumping && !jumpHeld && body.velocity.y < 0) {
            body.velocity.y *= MOVE.JUMP_CUT;
            this.isJumping = false;
        }

        this.jumpWasDown = jumpHeld;
    }
}
