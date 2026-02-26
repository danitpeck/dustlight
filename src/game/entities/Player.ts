import Phaser from 'phaser';

/**
 * Moth sprite — row 14 on the Kenney 1-Bit spritesheet.
 * Col 0 = front-facing, col 1 = side idle, cols 1-3 = walk cycle, col 4 = jump/airborne.
 */
const MOTH_IDLE = 14 * 20 + 1;  // 281 (side-facing)
const MOTH_WALK_FRAMES = [14 * 20 + 1, 14 * 20 + 2, 14 * 20 + 3, 14 * 20 + 2]; // 281, 282, 283, 282 — classic 1-2-3-2 cycle

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

/** Melee attack tuning constants. */
export const ATTACK = {
    DURATION_MS:  150,   // ms the hitbox stays active
    COOLDOWN_MS:  300,   // ms before you can attack again
    RANGE_X:       14,   // px offset from moth center (horizontal)
    RANGE_Y:       -2,   // px offset from moth center (vertical)
    WIDTH:         12,   // hitbox width in px
    HEIGHT:        14,   // hitbox height in px
} as const;

/** Player survivability tuning. */
export const PLAYER_HP = {
    MAX:            3,   // starting / max hit points
    INVULN_MS:   1200,   // ms of invulnerability after taking damage
    BLINK_MS:     100,   // ms per blink cycle during invuln
    KNOCKBACK_X:  150,   // px/s horizontal knockback impulse
    KNOCKBACK_Y: -180,   // px/s upward pop on hit
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
    private attackKey!: Phaser.Input.Keyboard.Key;
    private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
    /** Whether the left mouse button was pressed this frame (edge-detect) */
    private mouseAttackJustPressed = false;

    /** Current hit points */
    private _hp: number = PLAYER_HP.MAX;
    /** ms remaining of post-hit invulnerability */
    private invulnTimer = 0;
    /** Used for blink effect during invuln */
    private blinkTimer = 0;
    /** Whether the moth is dead (awaiting respawn) */
    private _dead = false;

    /** ms remaining in the coyote-time window */
    private coyoteTimer = 0;
    /** ms remaining in the jump-buffer window */
    private jumpBufferTimer = 0;
    /** true while ascending from a jump (for variable height cut) */
    private isJumping = false;
    /** edge-detection: was jump held last frame? */
    private jumpWasDown = false;

    /** The melee attack hitbox zone — invisible, used for overlap checks */
    private attackHitbox!: Phaser.GameObjects.Zone;
    /** ms remaining while the attack hitbox is active */
    private attackTimer = 0;
    /** ms remaining before the next attack is allowed */
    private attackCooldown = 0;
    /** Whether an attack is currently active (hitbox is live) */
    private _isAttacking = false;
    /** Slash sprite visual */
    private slashSprite!: Phaser.GameObjects.Sprite;

    /** Public read-only: is the moth currently mid-swing? */
    get isAttacking(): boolean { return this._isAttacking; }

    /** Public read-only: current HP */
    get hp(): number { return this._hp; }

    /** Public read-only: is the moth dead? */
    get dead(): boolean { return this._dead; }

    /** Public read-only: is the moth in invuln frames? */
    get invulnerable(): boolean { return this.invulnTimer > 0; }

    /** The attack hitbox zone — use for overlap checks in the scene */
    get meleeZone(): Phaser.GameObjects.Zone { return this.attackHitbox; }

    /** The slash arc graphics — for cleanup on room switch */
    get slashGraphics(): Phaser.GameObjects.Sprite { return this.slashSprite; }

    constructor(scene: Phaser.Scene, x: number, y: number) {
        super(scene, x, y, 'tiles', MOTH_IDLE);


        scene.add.existing(this);
        scene.physics.add.existing(this);

        // ─── Physics body ───
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setMaxVelocityX(MOVE.MAX_RUN);
        body.setDragX(MOVE.DRAG);

        // Slightly smaller hitbox for forgiving collisions (16×16 tile → 12×14 box)
        body.setSize(12, 14);
        body.setOffset(2, 2);

        // ─── Input (arrows + WASD) ───
        if (scene.input.keyboard) {
            this.cursors = scene.input.keyboard.createCursorKeys();
            this.jumpKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
            this.attackKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J);
            this.wasd = {
                W: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
                A: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
                S: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
                D: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
            };
        }

        // ─── Mouse attack (left click) ───
        scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (pointer.leftButtonDown()) {
                this.mouseAttackJustPressed = true;
            }
        });

        // ─── Walk animation ───
        if (!scene.anims.exists('moth-walk')) {
            scene.anims.create({
                key: 'moth-walk',
                frames: MOTH_WALK_FRAMES.map(f => ({ key: 'tiles', frame: f })),
                frameRate: 8,
                repeat: -1,
            });
        }

        // ─── Melee hitbox (invisible zone, physics-enabled for overlaps) ───
        this.attackHitbox = scene.add.zone(x, y, ATTACK.WIDTH, ATTACK.HEIGHT);
        scene.physics.add.existing(this.attackHitbox, false);
        const hitBody = this.attackHitbox.body as Phaser.Physics.Arcade.Body;
        hitBody.setAllowGravity(false);
        hitBody.enable = false; // starts disabled
        hitBody.debugShowBody = false; // hide from debug draw when inactive

        // ─── Slash sprite visual (starts invisible) ───
        this.slashSprite = scene.add.sprite(x, y, 'slash-vfx');
        this.slashSprite.setVisible(false);
        this.slashSprite.setDepth(10); // render above everything
    }

    /**
     * Per-frame update — call from `Scene.update(time, delta)`.
     */
    tick(_time: number, delta: number): void {
        if (this._dead) return;

        const body = this.body as Phaser.Physics.Arcade.Body;
        const onGround = body.blocked.down;

        // ─── Invulnerability blink ───
        if (this.invulnTimer > 0) {
            this.invulnTimer -= delta;
            this.blinkTimer -= delta;
            if (this.blinkTimer <= 0) {
                this.setAlpha(this.alpha === 1 ? 0.3 : 1);
                this.blinkTimer = PLAYER_HP.BLINK_MS;
            }
            if (this.invulnTimer <= 0) {
                this.setAlpha(1);
            }
        }

        // ─── Horizontal movement (arrows + WASD) ───
        const left = this.cursors.left.isDown || this.wasd.A.isDown;
        const right = this.cursors.right.isDown || this.wasd.D.isDown;

        if (left) {
            body.setAccelerationX(-MOVE.ACCEL);
            this.setFlipX(true);
        } else if (right) {
            body.setAccelerationX(MOVE.ACCEL);
            this.setFlipX(false);
        } else {
            body.setAccelerationX(0);
        }

        // ─── Animation ───
        const moving = left || right;
        if (onGround && moving) {
            if (!this.anims.isPlaying || this.anims.currentAnim?.key !== 'moth-walk') {
                this.play('moth-walk');
            }
        } else {
            this.stop();
            this.setFrame(MOTH_IDLE);
        }

        // ─── Coyote time ───
        if (onGround) {
            this.coyoteTimer = MOVE.COYOTE_MS;
            this.isJumping = false;
        } else {
            this.coyoteTimer -= delta;
        }

        // ─── Jump buffer ───
        const jumpHeld = this.cursors.up.isDown || this.jumpKey.isDown || this.wasd.W.isDown;
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

        // ─── Melee attack ───
        this.attackCooldown -= delta;

        const attackRequested = this.attackKey?.isDown || this.mouseAttackJustPressed;
        this.mouseAttackJustPressed = false; // consume the click

        if (attackRequested && this.attackCooldown <= 0 && !this._isAttacking) {
            this.startAttack();
        }

        if (this._isAttacking) {
            this.attackTimer -= delta;
            this.positionAttackHitbox();
            if (this.attackTimer <= 0) {
                this.endAttack();
            }
        }
    }

    /** Activate the attack hitbox. */
    private startAttack(): void {
        this._isAttacking = true;
        this.attackTimer = ATTACK.DURATION_MS;
        this.attackCooldown = ATTACK.COOLDOWN_MS;

        const hitBody = this.attackHitbox.body as Phaser.Physics.Arcade.Body;
        hitBody.enable = true;
        hitBody.debugShowBody = true;
        this.positionAttackHitbox();

        // ── Slash arc visual ──
        this.drawSlashArc();

        // ── Moth lunge: squash toward attack direction ──
        const dir = this.flipX ? -1 : 1;
        this.scene.tweens.add({
            targets: this,
            scaleX: 1.3,
            scaleY: 0.8,
            x: this.x + 3 * dir,
            duration: ATTACK.DURATION_MS * 0.4,
            ease: 'Power2',
            yoyo: true,
        });
    }

    /** Deactivate the attack hitbox. */
    private endAttack(): void {
        this._isAttacking = false;
        const hitBody = this.attackHitbox.body as Phaser.Physics.Arcade.Body;
        hitBody.enable = false;
        hitBody.debugShowBody = false;
        // Shove offscreen so debug draw doesn't leave a ghost
        this.attackHitbox.setPosition(-100, -100);
        // Hide slash sprite
        this.slashSprite.setVisible(false);
    }

    /** Keep the hitbox glued to the moth's facing direction. */
    private positionAttackHitbox(): void {
        const dir = this.flipX ? -1 : 1;
        this.attackHitbox.setPosition(
            this.x + ATTACK.RANGE_X * dir,
            this.y + ATTACK.RANGE_Y,
        );
    }

    /** Draw the slash visual — show the straight-slash sprite in the attack direction. */
    private drawSlashArc(): void {
        const dir = this.flipX ? -1 : 1;

        // Position at the hitbox location
        this.slashSprite.setPosition(
            this.x + ATTACK.RANGE_X * dir,
            this.y + ATTACK.RANGE_Y,
        );
        this.slashSprite.setFlipX(this.flipX);
        this.slashSprite.setVisible(true);
        this.slashSprite.setAlpha(1);
        this.slashSprite.setScale(1);

        // Fade + scale out over the attack duration
        this.scene.tweens.add({
            targets: this.slashSprite,
            alpha: 0,
            scaleX: 1.5,
            scaleY: 1.5,
            duration: ATTACK.DURATION_MS,
            ease: 'Power2',
            onComplete: () => {
                this.slashSprite.setVisible(false);
            },
        });
    }

    /**
     * Take damage from an external source (enemy contact, spikes, etc.)
     * Returns true if the hit connected (false if invuln or dead).
     */
    takeDamage(amount: number, sourceX: number): boolean {
        if (this._dead || this.invulnTimer > 0) return false;

        this._hp -= amount;
        this.invulnTimer = PLAYER_HP.INVULN_MS;
        this.blinkTimer = PLAYER_HP.BLINK_MS;

        // ── Knockback: away from damage source ──
        const dir = this.x < sourceX ? -1 : 1;
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(
            PLAYER_HP.KNOCKBACK_X * dir,
            PLAYER_HP.KNOCKBACK_Y,
        );

        // ── Screen flash: brief white overlay ──
        this.scene.cameras.main.flash(100, 255, 255, 255, false, undefined, 0.3);

        // ── Death check ──
        if (this._hp <= 0) {
            this.die();
        }

        return true;
    }

    /** The moth is dead — stop everything, play death effect. */
    private die(): void {
        this._dead = true;
        this.setAlpha(1);
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setAcceleration(0, 0);
        body.setVelocity(0, PLAYER_HP.KNOCKBACK_Y); // little upward pop

        // Shrink + fade, then emit 'player-dead' for the scene to handle respawn
        this.scene.tweens.add({
            targets: this,
            scaleX: 0,
            scaleY: 0,
            alpha: 0,
            duration: 400,
            ease: 'Power2',
            onComplete: () => {
                this.scene.events.emit('player-dead');
            },
        });
    }
}
