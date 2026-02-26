import Phaser from 'phaser';
import { Enemy } from './Enemy';

/**
 * Crawler sprite — row 16 on the Kenney 1-Bit spritesheet.
 * Col 0 = front-facing idle, cols 1-3 = walk cycle.
 */
const CRAWLER_WALK_FRAMES = [16 * 20 + 1, 16 * 20 + 2, 16 * 20 + 3, 16 * 20 + 2]; // 321, 322, 323, 322 — classic 1-2-3-2 cycle
const CRAWLER_FRAME = 16 * 20 + 0; // 320 (idle)

/** Crawler-specific tuning. */
export const CRAWLER = {
    SPEED:       40,    // px/s — patrol speed (slow, non-threatening)
    HP:           2,    // hits to kill
    DAMAGE:       1,    // contact damage
    EDGE_PROBE:  4,     // px ahead to check for floor edges
} as const;

/**
 * Crawler — the simplest enemy type.
 *
 * Behaviour:
 * - Walks in one direction at a steady pace.
 * - Turns around when hitting a wall (blocked.left / blocked.right).
 * - Turns around at ledge edges (no floor tile ahead) — no blind cliff dives.
 * - Takes damage, gets knocked back, flashes white, dies.
 *
 * Surface reading: a small skittering bug in the ruins.
 * Hidden reading:  an anxious, repetitive thought that paces endlessly.
 */
export class Crawler extends Enemy {
    /** 1 = moving right, -1 = moving left */
    private direction: 1 | -1;
    /** Reference to the tilemap layer for edge detection */
    private groundLayer: Phaser.Tilemaps.TilemapLayer;

    constructor(
        scene: Phaser.Scene,
        x: number,
        y: number,
        groundLayer: Phaser.Tilemaps.TilemapLayer,
    ) {
        super(scene, x, y, CRAWLER_FRAME, {
            hp: CRAWLER.HP,
            contactDamage: CRAWLER.DAMAGE,
        });

        this.groundLayer = groundLayer;
        // Start facing left (toward player in most layouts)
        this.direction = -1;
        this.setFlipX(true);

        const body = this.body as Phaser.Physics.Arcade.Body;
        body.setMaxVelocityX(CRAWLER.SPEED);
        body.setDragX(0); // no drag — constant speed

        // ─── Walk animation ───
        const animKey = 'crawler-walk';
        if (!scene.anims.exists(animKey)) {
            scene.anims.create({
                key: animKey,
                frames: CRAWLER_WALK_FRAMES.map(f => ({ key: 'tiles', frame: f })),
                frameRate: 6,
                repeat: -1, // loop forever
            });
        }
        this.play(animKey);
    }

    protected behave(_delta: number): void {
        const body = this.body as Phaser.Physics.Arcade.Body;

        // Don't patrol while in hitstun — let the knockback play out!
        if (this.isHitstunned) return;

        // ── Turn at walls ──
        if (body.blocked.left) {
            this.direction = 1;
            this.setFlipX(false);
        } else if (body.blocked.right) {
            this.direction = -1;
            this.setFlipX(true);
        }

        // ── Turn at ledge edges (don't walk off platforms) ──
        if (body.blocked.down) {
            const probeX = this.x + (this.direction * (body.halfWidth + CRAWLER.EDGE_PROBE));
            const probeY = this.y + body.halfHeight + 4; // slightly below feet
            const tileBelow = this.groundLayer.getTileAtWorldXY(probeX, probeY);

            if (!tileBelow || tileBelow.index === -1) {
                // No ground ahead — turn around
                this.direction = (this.direction * -1) as 1 | -1;
                this.setFlipX(this.direction === -1);
            }
        }

        // ── Move ──
        body.setVelocityX(CRAWLER.SPEED * this.direction);
    }
}
