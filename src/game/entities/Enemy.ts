import Phaser from 'phaser';

/**
 * Shared tuning constants for all enemies.
 * Individual enemy types can override via their own constants.
 */
export const ENEMY_DEFAULTS = {
    KNOCKBACK_VEL:   200,   // px/s — impulse on hit
    KNOCKBACK_UP:   -100,   // py/s — slight upward pop on hit
    FLASH_DURATION:  100,   // ms — white flash on damage
    HITSTOP_MS:       50,   // ms — freeze frames on melee connect (juice!)
    INVULN_MS:       300,   // ms — post-hit invulnerability
} as const;

/**
 * Enemy — base class for all hostile entities.
 *
 * Provides:
 * - HP tracking + damage/death
 * - Knockback on hit
 * - White flash + hitstop juice
 * - Invulnerability window after being hit
 * - Contact damage flag (for player overlap)
 *
 * Subclasses override `behave(delta)` for AI (patrol, chase, etc.)
 * Call `enemy.tick(time, delta)` from the scene's update().
 */
export abstract class Enemy extends Phaser.Physics.Arcade.Sprite {
    /** Hit points remaining */
    protected hp: number;
    /** Maximum hit points (for potential health bars later) */
    protected maxHp: number;
    /** How much damage this enemy deals on contact */
    readonly contactDamage: number;
    /** ms remaining of post-hit invulnerability */
    private invulnTimer = 0;
    /** Whether this enemy is currently alive */
    private _alive = true;

    get alive(): boolean { return this._alive; }

    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        frame: number,
        config: { hp?: number; contactDamage?: number } = {},
    ) {
        super(scene, x, y, 'tiles', frame);

        scene.add.existing(this);
        scene.physics.add.existing(this);

        this.hp = config.hp ?? 2;
        this.maxHp = this.hp;
        this.contactDamage = config.contactDamage ?? 1;

        // Slightly smaller hitbox for forgiving collisions
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setSize(12, 14);
        body.setOffset(2, 2);
    }

    /**
     * Per-frame update — call from `Scene.update(time, delta)`.
     */
    tick(_time: number, delta: number): void {
        if (!this._alive) return;

        this.invulnTimer -= delta;
        this.behave(delta);
    }

    /**
     * Subclass AI hook — called every frame while alive.
     * Override this to implement patrol, chase, etc.
     */
    protected abstract behave(delta: number): void;

    /**
     * Deal damage to this enemy. Returns true if the hit connected
     * (false if still in invuln window or already dead).
     */
    takeDamage(amount: number, sourceX: number): boolean {
        if (!this._alive || this.invulnTimer > 0) return false;

        this.hp -= amount;
        this.invulnTimer = ENEMY_DEFAULTS.INVULN_MS;

        // ── Knockback ──
        const dir = this.x < sourceX ? -1 : 1;
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(
            ENEMY_DEFAULTS.KNOCKBACK_VEL * dir,
            ENEMY_DEFAULTS.KNOCKBACK_UP,
        );

        // ── White flash (tint trick) ──
        this.setTintFill(0xffffff);
        this.scene.time.delayedCall(ENEMY_DEFAULTS.FLASH_DURATION, () => {
            if (this._alive) this.clearTint();
        });

        // ── Death check ──
        if (this.hp <= 0) {
            this.die();
        }

        return true;
    }

    /**
     * Kill this enemy — disable physics, play death effect, destroy.
     * Override for custom death animations, but call super.die().
     */
    protected die(): void {
        this._alive = false;
        const body = this.body as Phaser.Physics.Arcade.Body;
        body.enable = false;

        // Quick death tween: shrink + fade out, then destroy
        this.scene.tweens.add({
            targets: this,
            scaleX: 0,
            scaleY: 0,
            alpha: 0,
            duration: 200,
            ease: 'Power2',
            onComplete: () => {
                this.destroy();
            },
        });
    }
}
