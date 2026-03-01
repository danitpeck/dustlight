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

/** Wall cling & wall jump tuning. */
export const WALL = {
    SLIDE_VEL:      40,  // px/s — max downward speed while clinging
    JUMP_VEL_X:    160,  // px/s — horizontal kick-off from wall
    JUMP_VEL_Y:   -260,  // px/s — vertical impulse on wall jump
    CLING_GRACE_MS: 80,  // ms after leaving wall where wall-jump still works
    INPUT_LOCK_MS: 150,  // ms of forced horizontal velocity after wall jump
} as const;

/** Dash tuning — flutter burst. */
export const DASH = {
    SPEED:        480,   // px/s — horizontal burst velocity
    DURATION_MS:  160,   // ms the dash lasts
    COOLDOWN_MS:  350,   // ms before next dash
} as const;

/** Double jump tuning. */
export const DOUBLE_JUMP = {
    VEL:         -260,   // px/s — second jump impulse (slightly weaker than ground jump)
    MAX_AIR_JUMPS:  1,   // extra jumps allowed while airborne
} as const;

/** Ground pound tuning — dive-bomb. */
export const GROUND_POUND = {
    FALL_SPEED:    450,  // px/s — downward velocity during pound
    IMPACT_FREEZE_MS: 80, // hitstop on landing
    IMPACT_SHAKE: 0.015, // camera shake intensity
    IMPACT_SHAKE_MS: 120, // camera shake duration
    AOE_WIDTH:      32,  // impact damage zone width (px)
    AOE_HEIGHT:     16,  // impact damage zone height (px)
} as const;

/** Phase shift tuning — becoming dust. */
export const PHASE = {
    DURATION_MS:   400,  // ms the phase state lasts
    COOLDOWN_MS:   800,  // ms before next phase shift
} as const;
