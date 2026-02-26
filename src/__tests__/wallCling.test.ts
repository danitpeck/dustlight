import { describe, it, expect } from 'vitest';
import {
    createWallClingState,
    updateWallCling,
    WallClingInput,
    WallClingState,
} from '../game/systems/wallCling';
import { WALL } from '../game/data/constants';

/** Helper: build a default input (airborne, no walls, no input). */
function baseInput(overrides: Partial<WallClingInput> = {}): WallClingInput {
    return {
        onGround: false,
        blockedLeft: false,
        blockedRight: false,
        holdingLeft: false,
        holdingRight: false,
        jumpJustPressed: false,
        velocityY: 100,
        delta: 16,
        ...overrides,
    };
}

/** Helper: run multiple frames and return final result. */
function runFrames(
    state: WallClingState,
    input: WallClingInput,
    frames: number,
) {
    let result = updateWallCling(state, input);
    for (let i = 1; i < frames; i++) {
        result = updateWallCling(result.state, input);
    }
    return result;
}

describe('Wall Cling System', () => {
    // ─── Clinging ───

    it('should cling when airborne, touching left wall, holding left', () => {
        const state = createWallClingState();
        const result = updateWallCling(state, baseInput({
            blockedLeft: true,
            holdingLeft: true,
        }));
        expect(result.isClinging).toBe(true);
        expect(result.state.clingSide).toBe('left');
    });

    it('should cling when airborne, touching right wall, holding right', () => {
        const state = createWallClingState();
        const result = updateWallCling(state, baseInput({
            blockedRight: true,
            holdingRight: true,
        }));
        expect(result.isClinging).toBe(true);
        expect(result.state.clingSide).toBe('right');
    });

    it('should NOT cling when on ground', () => {
        const state = createWallClingState();
        const result = updateWallCling(state, baseInput({
            onGround: true,
            blockedLeft: true,
            holdingLeft: true,
        }));
        expect(result.isClinging).toBe(false);
        expect(result.state.clingSide).toBeNull();
    });

    it('should NOT cling when touching wall but not holding toward it', () => {
        const state = createWallClingState();
        const result = updateWallCling(state, baseInput({
            blockedLeft: true,
            holdingLeft: false,
        }));
        expect(result.isClinging).toBe(false);
    });

    // ─── Wall slide ───

    it('should cap downward velocity to SLIDE_VEL while clinging', () => {
        const state = createWallClingState();
        const result = updateWallCling(state, baseInput({
            blockedLeft: true,
            holdingLeft: true,
            velocityY: 300,
        }));
        expect(result.newVelocityY).toBe(WALL.SLIDE_VEL);
    });

    it('should NOT cap velocity when falling slower than SLIDE_VEL', () => {
        const state = createWallClingState();
        const result = updateWallCling(state, baseInput({
            blockedLeft: true,
            holdingLeft: true,
            velocityY: 20,
        }));
        expect(result.newVelocityY).toBeNull();
    });

    it('should NOT cap upward velocity while clinging', () => {
        const state = createWallClingState();
        const result = updateWallCling(state, baseInput({
            blockedLeft: true,
            holdingLeft: true,
            velocityY: -100,
        }));
        expect(result.newVelocityY).toBeNull();
    });

    // ─── Wall jump ───

    it('should wall jump away from left wall', () => {
        // First frame: establish cling
        const state = createWallClingState();
        const cling = updateWallCling(state, baseInput({
            blockedLeft: true,
            holdingLeft: true,
        }));
        // Second frame: jump
        const result = updateWallCling(cling.state, baseInput({
            blockedLeft: true,
            holdingLeft: true,
            jumpJustPressed: true,
        }));
        expect(result.didWallJump).toBe(true);
        expect(result.newVelocityX).toBe(WALL.JUMP_VEL_X); // positive = right (away from left wall)
        expect(result.newVelocityY).toBe(WALL.JUMP_VEL_Y);
    });

    it('should wall jump away from right wall', () => {
        const state = createWallClingState();
        const cling = updateWallCling(state, baseInput({
            blockedRight: true,
            holdingRight: true,
        }));
        const result = updateWallCling(cling.state, baseInput({
            blockedRight: true,
            holdingRight: true,
            jumpJustPressed: true,
        }));
        expect(result.didWallJump).toBe(true);
        expect(result.newVelocityX).toBe(-WALL.JUMP_VEL_X); // negative = left (away from right wall)
        expect(result.newVelocityY).toBe(WALL.JUMP_VEL_Y);
    });

    it('should NOT wall jump when not clinging', () => {
        const state = createWallClingState();
        const result = updateWallCling(state, baseInput({
            jumpJustPressed: true,
        }));
        expect(result.didWallJump).toBe(false);
        expect(result.newVelocityX).toBeNull();
    });

    // ─── Grace period ───

    it('should allow wall jump during grace period after releasing wall', () => {
        const state = createWallClingState();
        // Cling to left wall
        const cling = updateWallCling(state, baseInput({
            blockedLeft: true,
            holdingLeft: true,
        }));
        // Release wall (no longer touching or holding)
        const released = updateWallCling(cling.state, baseInput({
            blockedLeft: false,
            holdingLeft: false,
            delta: 16,
        }));
        // clingSide should still be set (grace period)
        expect(released.state.clingSide).toBe('left');
        // Jump during grace
        const jumped = updateWallCling(released.state, baseInput({
            jumpJustPressed: true,
            delta: 16,
        }));
        expect(jumped.didWallJump).toBe(true);
    });

    it('should expire grace period and prevent wall jump', () => {
        const state = createWallClingState();
        const cling = updateWallCling(state, baseInput({
            blockedLeft: true,
            holdingLeft: true,
        }));
        // Wait longer than grace period
        const expired = runFrames(cling.state, baseInput({
            blockedLeft: false,
            holdingLeft: false,
            delta: WALL.CLING_GRACE_MS + 16,
        }), 1);
        expect(expired.state.clingSide).toBeNull();
        const jumped = updateWallCling(expired.state, baseInput({
            jumpJustPressed: true,
        }));
        expect(jumped.didWallJump).toBe(false);
    });

    // ─── Input lock ───

    it('should lock horizontal input after wall jump', () => {
        const state = createWallClingState();
        const cling = updateWallCling(state, baseInput({
            blockedLeft: true,
            holdingLeft: true,
        }));
        const jumped = updateWallCling(cling.state, baseInput({
            blockedLeft: true,
            holdingLeft: true,
            jumpJustPressed: true,
        }));
        expect(jumped.inputLocked).toBe(true);
        expect(jumped.state.inputLockTimer).toBeGreaterThan(0);
    });

    it('should expire input lock after INPUT_LOCK_MS', () => {
        const state = createWallClingState();
        const cling = updateWallCling(state, baseInput({
            blockedLeft: true,
            holdingLeft: true,
        }));
        const jumped = updateWallCling(cling.state, baseInput({
            blockedLeft: true,
            holdingLeft: true,
            jumpJustPressed: true,
        }));
        // Advance past lock
        const unlocked = runFrames(jumped.state, baseInput({
            delta: WALL.INPUT_LOCK_MS + 16,
        }), 1);
        expect(unlocked.inputLocked).toBe(false);
    });

    it('should prevent re-cling during input lock', () => {
        const state = createWallClingState();
        const cling = updateWallCling(state, baseInput({
            blockedLeft: true,
            holdingLeft: true,
        }));
        const jumped = updateWallCling(cling.state, baseInput({
            blockedLeft: true,
            holdingLeft: true,
            jumpJustPressed: true,
        }));
        // Immediately try to cling same wall
        const reCling = updateWallCling(jumped.state, baseInput({
            blockedLeft: true,
            holdingLeft: true,
            delta: 16,
        }));
        expect(reCling.isClinging).toBe(false);
    });

    // ─── Ground reset ───

    it('should reset cling state on ground', () => {
        const state = createWallClingState();
        const cling = updateWallCling(state, baseInput({
            blockedLeft: true,
            holdingLeft: true,
        }));
        expect(cling.state.clingSide).toBe('left');
        const grounded = updateWallCling(cling.state, baseInput({
            onGround: true,
        }));
        expect(grounded.state.clingSide).toBeNull();
        expect(grounded.isClinging).toBe(false);
    });
});
