import { describe, it, expect } from 'vitest';
import { createPhaseShiftState, updatePhaseShift, PhaseShiftInput } from '../game/systems/phaseShift';
import { PHASE } from '../game/data/constants';

/** Helper to build a default phase input. */
function input(overrides: Partial<PhaseShiftInput> = {}): PhaseShiftInput {
    return {
        phaseRequested: false,
        delta: 16,
        ...overrides,
    };
}

describe('Phase shift state machine', () => {
    it('starts inactive with no cooldown', () => {
        const state = createPhaseShiftState();
        expect(state.isPhased).toBe(false);
        expect(state.phaseTimer).toBe(0);
        expect(state.cooldownTimer).toBe(0);
    });

    it('starts phase on request', () => {
        const state = createPhaseShiftState();
        const result = updatePhaseShift(state, input({ phaseRequested: true }));

        expect(result.state.isPhased).toBe(true);
        expect(result.startedPhase).toBe(true);
        expect(result.isPhased).toBe(true);
        expect(result.state.phaseTimer).toBe(PHASE.DURATION_MS);
    });

    it('phase ends after duration', () => {
        let state = createPhaseShiftState();
        state = updatePhaseShift(state, input({ phaseRequested: true })).state;

        // Tick past duration
        const result = updatePhaseShift(state, input({ delta: PHASE.DURATION_MS + 1 }));

        expect(result.state.isPhased).toBe(false);
        expect(result.endedPhase).toBe(true);
        expect(result.isPhased).toBe(false);
    });

    it('cannot phase during cooldown', () => {
        let state = createPhaseShiftState();

        // Activate and complete a phase
        state = updatePhaseShift(state, input({ phaseRequested: true })).state;
        state = updatePhaseShift(state, input({ delta: PHASE.DURATION_MS + 1 })).state;

        // Try to phase again immediately
        const result = updatePhaseShift(state, input({ phaseRequested: true }));
        expect(result.startedPhase).toBe(false);
        expect(result.state.isPhased).toBe(false);
    });

    it('can phase again after cooldown expires', () => {
        let state = createPhaseShiftState();

        // Complete a phase
        state = updatePhaseShift(state, input({ phaseRequested: true })).state;
        state = updatePhaseShift(state, input({ delta: PHASE.DURATION_MS + 1 })).state;

        // Wait out cooldown
        state = updatePhaseShift(state, input({ delta: PHASE.COOLDOWN_MS + 1 })).state;

        // Should work now
        const result = updatePhaseShift(state, input({ phaseRequested: true }));
        expect(result.startedPhase).toBe(true);
        expect(result.state.isPhased).toBe(true);
    });

    it('cannot double-phase while already phased', () => {
        let state = createPhaseShiftState();
        state = updatePhaseShift(state, input({ phaseRequested: true })).state;

        const result = updatePhaseShift(state, input({ phaseRequested: true }));
        expect(result.startedPhase).toBe(false);
    });

    it('isPhased stays true during active phase', () => {
        let state = createPhaseShiftState();
        state = updatePhaseShift(state, input({ phaseRequested: true })).state;

        // Tick partway through
        const result = updatePhaseShift(state, input({ delta: PHASE.DURATION_MS / 2 }));
        expect(result.isPhased).toBe(true);
        expect(result.state.isPhased).toBe(true);
        expect(result.endedPhase).toBe(false);
    });

    it('cooldown ticks down over time', () => {
        let state = createPhaseShiftState();

        // Complete a phase
        state = updatePhaseShift(state, input({ phaseRequested: true })).state;
        state = updatePhaseShift(state, input({ delta: PHASE.DURATION_MS + 1 })).state;

        const before = state.cooldownTimer;
        state = updatePhaseShift(state, input({ delta: 100 })).state;

        expect(state.cooldownTimer).toBe(Math.max(0, before - 100));
    });
});
