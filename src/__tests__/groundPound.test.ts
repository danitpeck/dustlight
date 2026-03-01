import { describe, it, expect } from 'vitest';
import { createGroundPoundState, updateGroundPound, GroundPoundInput } from '../game/systems/groundPound';
import { GROUND_POUND } from '../game/data/constants';

/** Helper to build a default ground pound input. */
function input(overrides: Partial<GroundPoundInput> = {}): GroundPoundInput {
    return {
        poundRequested: false,
        onGround: false,
        delta: 16,
        ...overrides,
    };
}

describe('Ground pound state machine', () => {
    it('starts idle', () => {
        const state = createGroundPoundState();
        expect(state.phase).toBe('idle');
        expect(state.phaseTimer).toBe(0);
    });

    it('starts pound when requested while airborne', () => {
        const state = createGroundPoundState();
        const result = updateGroundPound(state, input({ poundRequested: true }));

        expect(result.state.phase).toBe('windup');
        expect(result.startedPound).toBe(true);
        expect(result.velocityY).toBe(0); // frozen during windup
        expect(result.velocityX).toBe(0);
        expect(result.suppressGravity).toBe(true);
    });

    it('does NOT start when on ground', () => {
        const state = createGroundPoundState();
        const result = updateGroundPound(state, input({ poundRequested: true, onGround: true }));

        expect(result.state.phase).toBe('idle');
        expect(result.startedPound).toBe(false);
    });

    it('transitions from windup to falling after windup timer', () => {
        let state = createGroundPoundState();
        state = updateGroundPound(state, input({ poundRequested: true })).state;

        // Tick past windup
        const result = updateGroundPound(state, input({ delta: 100 }));

        expect(result.state.phase).toBe('falling');
        expect(result.velocityY).toBe(GROUND_POUND.FALL_SPEED);
        expect(result.velocityX).toBe(0);
    });

    it('maintains fall speed while falling', () => {
        let state = createGroundPoundState();
        state = updateGroundPound(state, input({ poundRequested: true })).state;
        state = updateGroundPound(state, input({ delta: 100 })).state; // past windup

        const result = updateGroundPound(state, input({ delta: 16 }));
        expect(result.state.phase).toBe('falling');
        expect(result.velocityY).toBe(GROUND_POUND.FALL_SPEED);
        expect(result.isPounding).toBe(true);
    });

    it('impacts when hitting the ground while falling', () => {
        let state = createGroundPoundState();
        state = updateGroundPound(state, input({ poundRequested: true })).state;
        state = updateGroundPound(state, input({ delta: 100 })).state; // past windup

        const result = updateGroundPound(state, input({ onGround: true }));

        expect(result.state.phase).toBe('impact');
        expect(result.impacted).toBe(true);
        expect(result.velocityY).toBe(0);
    });

    it('returns to idle after impact freeze expires', () => {
        let state = createGroundPoundState();
        state = updateGroundPound(state, input({ poundRequested: true })).state;
        state = updateGroundPound(state, input({ delta: 100 })).state; // past windup
        state = updateGroundPound(state, input({ onGround: true })).state; // impact

        const result = updateGroundPound(state, input({
            onGround: true,
            delta: GROUND_POUND.IMPACT_FREEZE_MS + 1,
        }));

        expect(result.state.phase).toBe('idle');
    });

    it('reports isPounding during windup and falling, not impact or idle', () => {
        let state = createGroundPoundState();

        // Idle
        let result = updateGroundPound(state, input());
        expect(result.isPounding).toBe(false);

        // Windup
        result = updateGroundPound(state, input({ poundRequested: true }));
        expect(result.isPounding).toBe(true);
        state = result.state;

        // Falling
        result = updateGroundPound(state, input({ delta: 100 }));
        expect(result.isPounding).toBe(true);
        state = result.state;

        // Impact
        result = updateGroundPound(state, input({ onGround: true }));
        expect(result.isPounding).toBe(false);
    });

    it('freezes X velocity during all active phases', () => {
        let state = createGroundPoundState();

        // Windup
        let result = updateGroundPound(state, input({ poundRequested: true }));
        expect(result.velocityX).toBe(0);
        state = result.state;

        // Falling
        result = updateGroundPound(state, input({ delta: 100 }));
        expect(result.velocityX).toBe(0);
        state = result.state;

        // Impact
        result = updateGroundPound(state, input({ onGround: true }));
        expect(result.velocityX).toBe(0);
    });
});
