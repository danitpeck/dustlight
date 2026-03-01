import { describe, it, expect } from 'vitest';
import { createDashState, updateDash, DashInput } from '../game/systems/dash';
import { DASH } from '../game/data/constants';

/** Helper to build a default dash input. */
function input(overrides: Partial<DashInput> = {}): DashInput {
    return {
        dashRequested: false,
        facingRight: true,
        delta: 16,
        ...overrides,
    };
}

describe('Dash state machine', () => {
    it('starts idle with no cooldown', () => {
        const state = createDashState();
        expect(state.isDashing).toBe(false);
        expect(state.dashTimer).toBe(0);
        expect(state.cooldownTimer).toBe(0);
    });

    it('starts a dash on request', () => {
        const state = createDashState();
        const result = updateDash(state, input({ dashRequested: true }));

        expect(result.state.isDashing).toBe(true);
        expect(result.startedDash).toBe(true);
        expect(result.velocityX).toBe(DASH.SPEED); // facing right
        expect(result.velocityY).toBe(0);
        expect(result.suppressGravity).toBe(true);
    });

    it('dashes left when facing left', () => {
        const state = createDashState();
        const result = updateDash(state, input({ dashRequested: true, facingRight: false }));

        expect(result.velocityX).toBe(-DASH.SPEED);
        expect(result.state.dashDir).toBe(-1);
    });

    it('dash ends after duration expires', () => {
        let state = createDashState();

        // Start dash
        const start = updateDash(state, input({ dashRequested: true }));
        state = start.state;

        // Tick past the full duration
        const result = updateDash(state, input({ delta: DASH.DURATION_MS + 1 }));

        expect(result.state.isDashing).toBe(false);
        expect(result.endedDash).toBe(true);
        expect(result.velocityX).toBeNull(); // no override on ending frame
        expect(result.suppressGravity).toBe(false);
    });

    it('cannot dash during cooldown', () => {
        let state = createDashState();

        // Start and complete a dash
        state = updateDash(state, input({ dashRequested: true })).state;
        state = updateDash(state, input({ delta: DASH.DURATION_MS + 1 })).state;

        // Try to dash again immediately — should fail
        const result = updateDash(state, input({ dashRequested: true }));
        expect(result.state.isDashing).toBe(false);
        expect(result.startedDash).toBe(false);
    });

    it('can dash again after cooldown expires', () => {
        let state = createDashState();

        // Complete a dash
        state = updateDash(state, input({ dashRequested: true })).state;
        state = updateDash(state, input({ delta: DASH.DURATION_MS + 1 })).state;

        // Wait out cooldown
        state = updateDash(state, input({ delta: DASH.COOLDOWN_MS + 1 })).state;

        // Should be able to dash again
        const result = updateDash(state, input({ dashRequested: true }));
        expect(result.startedDash).toBe(true);
        expect(result.state.isDashing).toBe(true);
    });

    it('cannot dash while already dashing', () => {
        let state = createDashState();
        state = updateDash(state, input({ dashRequested: true })).state;

        // Try to dash again mid-dash
        const result = updateDash(state, input({ dashRequested: true }));
        expect(result.startedDash).toBe(false);
    });

    it('maintains dash velocity while active', () => {
        let state = createDashState();
        state = updateDash(state, input({ dashRequested: true })).state;

        // Tick partway through
        const result = updateDash(state, input({ delta: DASH.DURATION_MS / 2 }));
        expect(result.state.isDashing).toBe(true);
        expect(result.velocityX).toBe(DASH.SPEED);
        expect(result.suppressGravity).toBe(true);
    });
});
