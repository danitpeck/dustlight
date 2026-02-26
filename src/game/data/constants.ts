/**
 * Tuning constants for the Moth player.
 *
 * Extracted into their own file so pure systems (combat, jump)
 * can import them without pulling in Phaser via Player.ts.
 */

/** Movement tuning constants. */
export const MOVE = {
    MAX_RUN:      130,   // px/s — max horizontal speed
    ACCEL:        900,   // px/s² — run acceleration (snappy!)
    DRAG:         700,   // px/s² — deceleration when no input
    JUMP_VEL:    -285,   // px/s — initial upward impulse (negative = up)
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
