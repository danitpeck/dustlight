/**
 * Pure wall cling & wall jump state machine — no Phaser dependency.
 *
 * Handles:
 * - Wall clinging (slide slowly while holding toward wall in air)
 * - Wall jumping (launch away from wall at an angle)
 * - Cling grace period (brief window to wall-jump after releasing)
 * - Input lock (forced horizontal velocity after wall jump so player
 *   doesn't drift right back into the wall)
 *
 * Player.ts feeds physics state in, gets back velocity commands.
 */

import { WALL } from '../data/constants';

// ─── Types ───

export type WallSide = 'left' | 'right' | null;

export interface WallClingState {
    /** Which wall the moth is currently clinging to (null = not clinging) */
    clingSide: WallSide;
    /** ms remaining on cling grace period (can still wall-jump briefly after leaving wall) */
    clingGraceTimer: number;
    /** ms remaining on post-wall-jump input lock (forced horizontal velocity) */
    inputLockTimer: number;
    /** Direction of the input lock: 1 = right, -1 = left */
    inputLockDir: number;
}

export interface WallClingInput {
    /** Is the player on the ground? */
    onGround: boolean;
    /** Is the player's left side touching a wall? */
    blockedLeft: boolean;
    /** Is the player's right side touching a wall? */
    blockedRight: boolean;
    /** Is the player holding left? */
    holdingLeft: boolean;
    /** Is the player holding right? */
    holdingRight: boolean;
    /** Is jump being pressed this frame (edge-detected, just pressed)? */
    jumpJustPressed: boolean;
    /** Current vertical velocity (negative = up) */
    velocityY: number;
    /** Frame delta in ms */
    delta: number;
}

export interface WallClingResult {
    state: WallClingState;
    /** New Y velocity to apply (null = don't change) */
    newVelocityY: number | null;
    /** New X velocity to apply (null = don't change) */
    newVelocityX: number | null;
    /** Whether the moth is currently clinging (for animation) */
    isClinging: boolean;
    /** Whether a wall jump was triggered this frame */
    didWallJump: boolean;
    /** Whether horizontal input should be suppressed (input lock active) */
    inputLocked: boolean;
}

/** Create a fresh wall cling state. */
export function createWallClingState(): WallClingState {
    return {
        clingSide: null,
        clingGraceTimer: 0,
        inputLockTimer: 0,
        inputLockDir: 0,
    };
}

/** Advance the wall cling state machine by one frame. Pure function. */
export function updateWallCling(
    state: WallClingState,
    input: WallClingInput,
): WallClingResult {
    let { clingSide, clingGraceTimer, inputLockTimer, inputLockDir } = state;
    let newVelocityY: number | null = null;
    let newVelocityX: number | null = null;
    let didWallJump = false;

    // ─── Input lock countdown ───
    if (inputLockTimer > 0) {
        inputLockTimer -= input.delta;
        if (inputLockTimer > 0) {
            // Force horizontal velocity away from wall
            newVelocityX = WALL.JUMP_VEL_X * inputLockDir;
        }
    }

    // ─── On ground: reset cling ───
    if (input.onGround) {
        clingSide = null;
        clingGraceTimer = 0;
        return {
            state: { clingSide, clingGraceTimer, inputLockTimer, inputLockDir },
            newVelocityY,
            newVelocityX,
            isClinging: false,
            didWallJump,
            inputLocked: inputLockTimer > 0,
        };
    }

    // ─── Determine if touching + holding toward a wall ───
    const pushingLeft = input.blockedLeft && input.holdingLeft;
    const pushingRight = input.blockedRight && input.holdingRight;

    // Start or maintain cling
    if (pushingLeft && inputLockTimer <= 0) {
        clingSide = 'left';
        clingGraceTimer = WALL.CLING_GRACE_MS;
    } else if (pushingRight && inputLockTimer <= 0) {
        clingSide = 'right';
        clingGraceTimer = WALL.CLING_GRACE_MS;
    } else if (clingSide !== null) {
        // Released the wall or drifted away — start grace period
        clingGraceTimer -= input.delta;
        if (clingGraceTimer <= 0) {
            clingSide = null;
        }
    }

    const isClinging = clingSide !== null && clingGraceTimer > 0 &&
        ((clingSide === 'left' && pushingLeft) ||
         (clingSide === 'right' && pushingRight));

    // ─── Wall slide: cap downward velocity while clinging ───
    if (isClinging && input.velocityY > WALL.SLIDE_VEL) {
        newVelocityY = WALL.SLIDE_VEL;
    }

    // ─── Wall jump ───
    if (input.jumpJustPressed && clingSide !== null) {
        // Jump away from the wall
        const awayDir = clingSide === 'left' ? 1 : -1;
        newVelocityX = WALL.JUMP_VEL_X * awayDir;
        newVelocityY = WALL.JUMP_VEL_Y;
        inputLockTimer = WALL.INPUT_LOCK_MS;
        inputLockDir = awayDir;
        didWallJump = true;

        // Clear cling state
        clingSide = null;
        clingGraceTimer = 0;
    }

    return {
        state: { clingSide, clingGraceTimer, inputLockTimer, inputLockDir },
        newVelocityY,
        newVelocityX,
        isClinging,
        didWallJump,
        inputLocked: inputLockTimer > 0,
    };
}
