/**
 * Pure dash state machine — no Phaser dependency.
 *
 * The dash is a horizontal speed burst in the moth's facing direction.
 * During the dash:
 * - Horizontal velocity is overridden to DASH.SPEED
 * - Gravity is suppressed (moth holds altitude)
 * - Vertical velocity is zeroed
 *
 * Player.ts feeds input in, gets back velocity overrides.
 * "A flutter burst — or running from something."
 */

import { DASH } from '../data/constants';

// ─── Types ───

export interface DashState {
    /** Is the moth currently dashing? */
    isDashing: boolean;
    /** ms remaining in the current dash */
    dashTimer: number;
    /** ms remaining before next dash is allowed */
    cooldownTimer: number;
    /** Direction of the current dash: 1 = right, -1 = left */
    dashDir: number;
}

export interface DashInput {
    /** Was dash requested this frame (edge-detected)? */
    dashRequested: boolean;
    /** Is the moth facing right? */
    facingRight: boolean;
    /** Frame delta in ms */
    delta: number;
}

export interface DashResult {
    state: DashState;
    /** Whether a dash just started this frame */
    startedDash: boolean;
    /** Whether a dash just ended this frame */
    endedDash: boolean;
    /** X velocity override during dash (null = don't override) */
    velocityX: number | null;
    /** Y velocity override during dash (null = don't override) */
    velocityY: number | null;
    /** Whether gravity should be disabled this frame */
    suppressGravity: boolean;
}

// ─── Factory ───

/** Create a fresh dash state. */
export function createDashState(): DashState {
    return {
        isDashing: false,
        dashTimer: 0,
        cooldownTimer: 0,
        dashDir: 1,
    };
}

// ─── Update ───

/** Advance the dash state machine by one frame. Pure function. */
export function updateDash(state: DashState, input: DashInput): DashResult {
    let { isDashing, dashTimer, cooldownTimer, dashDir } = state;
    let startedDash = false;
    let endedDash = false;
    let velocityX: number | null = null;
    let velocityY: number | null = null;
    let suppressGravity = false;

    // ─── Tick cooldown ───
    if (cooldownTimer > 0) {
        cooldownTimer = Math.max(0, cooldownTimer - input.delta);
    }

    // ─── Start a new dash? ───
    if (input.dashRequested && !isDashing && cooldownTimer <= 0) {
        isDashing = true;
        dashTimer = DASH.DURATION_MS;
        cooldownTimer = DASH.COOLDOWN_MS;
        dashDir = input.facingRight ? 1 : -1;
        startedDash = true;
        // Set velocity on the start frame
        velocityX = DASH.SPEED * dashDir;
        velocityY = 0;
        suppressGravity = true;
    }

    // ─── During dash (skip tick on start frame — velocity already set above) ───
    if (isDashing && !startedDash) {
        dashTimer -= input.delta;
        velocityX = DASH.SPEED * dashDir;
        velocityY = 0; // hold altitude
        suppressGravity = true;

        // Dash ended?
        if (dashTimer <= 0) {
            isDashing = false;
            dashTimer = 0;
            endedDash = true;
            // Don't override velocity on the ending frame — let normal physics resume
            velocityX = null;
            velocityY = null;
            suppressGravity = false;
        }
    }

    return {
        state: { isDashing, dashTimer, cooldownTimer, dashDir },
        startedDash,
        endedDash,
        velocityX,
        velocityY,
        suppressGravity,
    };
}
