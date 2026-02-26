/**
 * Pure jump state machine — no Phaser dependency.
 *
 * Handles coyote time, jump buffering, variable-height jump cuts.
 * Player.ts feeds physics state in, gets back velocity commands.
 */

import { MOVE } from '../data/constants';

// ─── Jump State ───

export interface JumpState {
    /** ms remaining in the coyote-time window */
    coyoteTimer: number;
    /** ms remaining in the jump-buffer window */
    jumpBufferTimer: number;
    /** true while ascending from a jump (for variable height cut) */
    isJumping: boolean;
    /** edge-detection: was jump held last frame? */
    jumpWasDown: boolean;
}

export interface JumpInput {
    /** Is the player on solid ground? */
    onGround: boolean;
    /** Is the jump button currently held? */
    jumpHeld: boolean;
    /** Current vertical velocity (px/s, negative = up) */
    velocityY: number;
    /** Frame delta in ms */
    delta: number;
}

export interface JumpResult {
    state: JumpState;
    /** New Y velocity to apply (null = don't change) */
    newVelocityY: number | null;
}

/** Create a fresh jump state. */
export function createJumpState(): JumpState {
    return {
        coyoteTimer: 0,
        jumpBufferTimer: 0,
        isJumping: false,
        jumpWasDown: false,
    };
}

/** Advance the jump state machine by one frame. Pure function. */
export function updateJump(state: JumpState, input: JumpInput): JumpResult {
    let { coyoteTimer, jumpBufferTimer, isJumping, jumpWasDown } = state;
    let newVelocityY: number | null = null;

    // ─── Coyote time ───
    if (input.onGround) {
        coyoteTimer = MOVE.COYOTE_MS;
        isJumping = false;
    } else {
        coyoteTimer -= input.delta;
    }

    // ─── Jump buffer ───
    const jumpJustPressed = input.jumpHeld && !jumpWasDown;
    if (jumpJustPressed) {
        jumpBufferTimer = MOVE.BUFFER_MS;
    } else {
        jumpBufferTimer -= input.delta;
    }

    // ─── Execute jump ───
    if (coyoteTimer > 0 && jumpBufferTimer > 0) {
        newVelocityY = MOVE.JUMP_VEL;
        isJumping = true;
        coyoteTimer = 0;
        jumpBufferTimer = 0;
    }

    // ─── Variable jump height (cut on early release) ───
    if (isJumping && !input.jumpHeld && input.velocityY < 0) {
        newVelocityY = input.velocityY * MOVE.JUMP_CUT;
        isJumping = false;
    }

    jumpWasDown = input.jumpHeld;

    return {
        state: { coyoteTimer, jumpBufferTimer, isJumping, jumpWasDown },
        newVelocityY,
    };
}
