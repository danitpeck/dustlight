import Phaser from 'phaser';
import { MOVE, ATTACK, PLAYER_HP, WALL } from '../data/constants';
import { WallClingState, createWallClingState, updateWallCling } from '../systems/wallCling';
import { JumpState, createJumpState, updateJump } from '../systems/jump';
import { AttackState, createAttackState, updateAttack, HPState, createHPState, applyDamage, tickHP } from '../systems/combat';

// Re-export so existing imports from Player still work
export { MOVE, ATTACK, PLAYER_HP };

/**
 * Moth sprite — row 14 on the Kenney 1-Bit spritesheet.
 * Col 0 = front-facing, col 1 = side idle, cols 1-3 = walk cycle, col 4 = jump/airborne.
 */
const MOTH_IDLE = 14 * 20 + 1;  // 281 (side-facing)
const MOTH_JUMP = 14 * 20 + 4;  // 284 (airborne)
const MOTH_WALK_FRAMES = [14 * 20 + 1, 14 * 20 + 2, 14 * 20 + 3, 14 * 20 + 2]; // 281, 282, 283, 282 — classic 1-2-3-2 cycle

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

    /** HP / invuln / blink state (pure state machine) */
    private hpState: HPState = createHPState();
    /** True while the moth is dropping through a thin platform */
    private _droppingThrough = false;
    /** Failsafe timer: auto-clear dropping flag after this many ms */
    private dropTimer = 0;
    /** Wall cling & wall jump state (pure state machine) */
    private wallClingState: WallClingState = createWallClingState();
    /** Jump state (pure state machine) */
    private jumpState: JumpState = createJumpState();

    /** Attack state (pure state machine) */
    private attackState: AttackState = createAttackState();

    /** The melee attack hitbox zone — invisible, used for overlap checks */
    private attackHitbox!: Phaser.GameObjects.Zone;
    /** Slash sprite visual */
    private slashSprite!: Phaser.GameObjects.Sprite;
    /** Dust particle emitter (land + jump puffs) */
    private dustEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

    /** Was the moth airborne last frame? (for landing detection) */
    private wasAirborne = false;
    /** Cooldown to prevent landing squash from re-triggering on physics micro-bounce */
    private landSquashCooldown = 0;

    /** Public read-only: is the moth currently mid-swing? */
    get isAttacking(): boolean { return this.attackState.isAttacking; }

    /** Public read-only: current HP */
    get hp(): number { return this.hpState.hp; }

    /** Public read-only: is the moth dead? */
    get dead(): boolean { return this.hpState.dead; }

    /** Public read-only: is the moth in invuln frames? */
    get invulnerable(): boolean { return this.hpState.invulnTimer > 0; }

    /** Public read-only: is the moth currently dropping through a thin platform? */
    get droppingThrough(): boolean { return this._droppingThrough; }

    /** Public read-only: is the moth clinging to a wall? */
    get isWallClinging(): boolean { return this.wallClingState.clingSide !== null && this.wallClingState.clingGraceTimer > 0; }

    /** The attack hitbox zone — use for overlap checks in the scene */
    get meleeZone(): Phaser.GameObjects.Zone { return this.attackHitbox; }

    /** The slash arc graphics — for cleanup on room switch */
    get slashGraphics(): Phaser.GameObjects.Sprite { return this.slashSprite; }

    /** The dust particle emitter — for cleanup on room switch */
    get dustParticles(): Phaser.GameObjects.Particles.ParticleEmitter { return this.dustEmitter; }

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

        // ─── Dust particle emitter (land + jump puffs) ───
        // Generate a tiny 2×2 white pixel texture if not already cached
        if (!scene.textures.exists('dust-pixel')) {
            const g = scene.add.graphics();
            g.fillStyle(0xffffff);
            g.fillRect(0, 0, 2, 2);
            g.generateTexture('dust-pixel', 2, 2);
            g.destroy();
        }
        this.dustEmitter = scene.add.particles(0, 0, 'dust-pixel', {
            speed: { min: 15, max: 40 },
            angle: { min: 220, max: 320 }, // spray downward-ish (fans out from feet)
            lifespan: { min: 150, max: 300 },
            scale: { start: 1, end: 0 },
            alpha: { start: 1, end: 0 },
            gravityY: 80,
            emitting: false,  // manual bursts only
        });
        this.dustEmitter.setDepth(5);
    }

    /**
     * Per-frame update — call from `Scene.update(time, delta)`.
     */
    tick(_time: number, delta: number): void {
        if (this.hpState.dead) return;

        const body = this.body as Phaser.Physics.Arcade.Body;
        const onGround = body.blocked.down;

        // ─── HP / invuln blink (pure system) ───
        this.hpState = tickHP(this.hpState, delta);
        this.setAlpha(this.hpState.visible ? 1 : 0.3);

        // ─── Horizontal movement (arrows + WASD) ───
        const left = this.cursors.left.isDown || this.wasd.A.isDown;
        const right = this.cursors.right.isDown || this.wasd.D.isDown;

        // Wall cling system may lock input after a wall jump
        const wallLocked = this.wallClingState.inputLockTimer > 0;

        if (wallLocked) {
            // During input lock, don't let the player override horizontal velocity
            body.setAccelerationX(0);
        } else if (left) {
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
        const clinging = this.wallClingState.clingSide !== null
            && this.wallClingState.clingGraceTimer > 0
            && ((this.wallClingState.clingSide === 'left' && left && body.blocked.left)
             || (this.wallClingState.clingSide === 'right' && right && body.blocked.right));

        if (clinging) {
            // Wall cling — jump frame, facing INTO the wall
            this.stop();
            this.setFrame(MOTH_JUMP);
            this.setFlipX(this.wallClingState.clingSide === 'right');
        } else if (!onGround) {
            // Airborne — jump frame
            this.stop();
            this.setFrame(MOTH_JUMP);
        } else if (moving) {
            if (!this.anims.isPlaying || this.anims.currentAnim?.key !== 'moth-walk') {
                this.play('moth-walk');
            }
        } else {
            this.stop();
            this.setFrame(MOTH_IDLE);
        }

        // ─── Land juice: squash + dust puff ───
        this.landSquashCooldown = Math.max(0, this.landSquashCooldown - delta);
        if (onGround && this.wasAirborne && this.landSquashCooldown <= 0 && !this.attackState.isAttacking) {
            this.landSquashCooldown = 200; // ms before squash can re-trigger
            this.scene.tweens.killTweensOf(this);
            this.setScale(1, 1);
            this.scene.tweens.add({
                targets: this,
                scaleX: 1.3,
                scaleY: 0.7,
                duration: 60,
                ease: 'Power2',
                yoyo: true,
                onComplete: () => this.setScale(1, 1),
            });
            this.dustEmitter.emitParticleAt(this.x, this.y + 7, 4);
        }

        // ─── Jump input ───
        const jumpHeld = this.cursors.up.isDown || this.jumpKey.isDown || this.wasd.W.isDown;
        const jumpJustPressed = jumpHeld && !this.jumpState.jumpWasDown;
        const downHeld = this.cursors.down.isDown || this.wasd.S.isDown;

        // ─── Drop-through: clear flag once moth lands or timer expires ───
        if (this._droppingThrough) {
            this.dropTimer -= delta;
            if ((onGround && !downHeld) || this.dropTimer <= 0) {
                this._droppingThrough = false;
            }
        }

        // ─── Drop-through: Down on a thin platform ───

        if (downHeld && onGround && !this._droppingThrough) {
            // Set the drop flag — the platform collider's process callback
            // in Game.ts will skip collision, letting the moth fall through.
            // If she's on solid ground (not a platform), this flag is harmless.
            this._droppingThrough = true;
            this.dropTimer = 500; // failsafe
            body.setVelocityY(20); // tiny nudge

            // Consume the jump so she doesn't also bounce upward
            this.jumpState = { ...this.jumpState, jumpBufferTimer: 0, jumpWasDown: jumpHeld };
            return;
        }

        // ─── Jump (pure system) ───
        const jumpResult = updateJump(this.jumpState, {
            onGround,
            jumpHeld,
            velocityY: body.velocity.y,
            delta,
        });
        this.jumpState = jumpResult.state;

        if (jumpResult.newVelocityY !== null) {
            body.setVelocityY(jumpResult.newVelocityY);

            // Jump stretch + dust puff (only when actually launching, not on cut)
            if (jumpResult.newVelocityY < 0) {
                this.scene.tweens.killTweensOf(this);
                this.setScale(1, 1);
                this.scene.tweens.add({
                    targets: this,
                    scaleX: 0.75,
                    scaleY: 1.3,
                    duration: 80,
                    ease: 'Power2',
                    yoyo: true,
                    onComplete: () => this.setScale(1, 1),
                });
                this.dustEmitter.emitParticleAt(this.x, this.y + 7, 3);
            }
        }

        // ─── Wall cling & wall jump ───
        const wallResult = updateWallCling(this.wallClingState, {
            onGround,
            blockedLeft: body.blocked.left,
            blockedRight: body.blocked.right,
            holdingLeft: left,
            holdingRight: right,
            jumpJustPressed,
            velocityY: body.velocity.y,
            delta,
        });
        this.wallClingState = wallResult.state;

        if (wallResult.didWallJump) {
            // Wall jump: apply velocity and cancel normal jump state
            body.setVelocityY(wallResult.newVelocityY!);
            body.setVelocityX(wallResult.newVelocityX!);
            this.jumpState = { ...this.jumpState, isJumping: true, coyoteTimer: 0, jumpBufferTimer: 0 };
            // Face away from wall
            this.setFlipX(wallResult.newVelocityX! < 0);
            // Wall jump stretch + dust
            this.scene.tweens.killTweensOf(this);
            this.setScale(1, 1);
            this.scene.tweens.add({
                targets: this,
                scaleX: 0.75,
                scaleY: 1.3,
                duration: 80,
                ease: 'Power2',
                yoyo: true,
                onComplete: () => this.setScale(1, 1),
            });
            this.dustEmitter.emitParticleAt(this.x, this.y, 3);
        } else {
            if (wallResult.newVelocityY !== null) {
                body.setVelocityY(wallResult.newVelocityY);
            }
            if (wallResult.newVelocityX !== null) {
                body.setVelocityX(wallResult.newVelocityX);
            }
        }

        // ─── Melee attack (pure system) ───
        const attackRequested = this.attackKey?.isDown || this.mouseAttackJustPressed;
        this.mouseAttackJustPressed = false; // consume the click

        const attackResult = updateAttack(this.attackState, {
            attackRequested: !!attackRequested,
            delta,
        });
        this.attackState = attackResult.state;

        if (attackResult.startedAttack) {
            this.onAttackStart();
        }
        if (attackResult.endedAttack) {
            this.onAttackEnd();
        }
        if (this.attackState.isAttacking) {
            this.positionAttackHitbox();
        }

        // ─── Track airborne state for next frame's landing detection ───
        this.wasAirborne = !onGround;
    }

    /** VFX callback: attack just started — enable hitbox & draw slash. */
    private onAttackStart(): void {
        const hitBody = this.attackHitbox.body as Phaser.Physics.Arcade.Body;
        hitBody.enable = true;
        hitBody.debugShowBody = true;
        this.positionAttackHitbox();

        // ── Slash arc visual ──
        this.drawSlashArc();

        // ── Moth lunge: squash toward attack direction ──
        const dir = this.flipX ? -1 : 1;
        this.scene.tweens.killTweensOf(this);
        this.setScale(1, 1);
        this.scene.tweens.add({
            targets: this,
            scaleX: 1.3,
            scaleY: 0.8,
            x: this.x + 3 * dir,
            duration: ATTACK.DURATION_MS * 0.4,
            ease: 'Power2',
            yoyo: true,
            onComplete: () => this.setScale(1, 1),
        });
    }

    /** VFX callback: attack just ended — disable hitbox. */
    private onAttackEnd(): void {
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
        const result = applyDamage(this.hpState, { amount });
        if (!result.hit) return false;

        this.hpState = result.state;

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
        if (result.died) {
            this.die();
        }

        return true;
    }

    /** The moth is dead — stop everything, play death effect. */
    private die(): void {
        // hpState.dead is already true from applyDamage
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
