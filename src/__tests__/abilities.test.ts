import { describe, it, expect } from 'vitest';
import {
    createAbilityState,
    hasAbility,
    unlockAbility,
    unlockAll,
    getUnlockedAbilities,
} from '../game/systems/abilities';

describe('Ability registry', () => {
    it('starts with nothing unlocked', () => {
        const state = createAbilityState();
        expect(hasAbility(state, 'wallCling')).toBe(false);
        expect(hasAbility(state, 'dash')).toBe(false);
        expect(hasAbility(state, 'doubleJump')).toBe(false);
        expect(hasAbility(state, 'groundPound')).toBe(false);
        expect(hasAbility(state, 'phaseShift')).toBe(false);
        expect(getUnlockedAbilities(state)).toHaveLength(0);
    });

    it('unlocks a single ability', () => {
        const state = createAbilityState();
        const next = unlockAbility(state, 'dash');
        expect(hasAbility(next, 'dash')).toBe(true);
        expect(hasAbility(next, 'wallCling')).toBe(false);
    });

    it('does not mutate original state', () => {
        const original = createAbilityState();
        unlockAbility(original, 'dash');
        expect(hasAbility(original, 'dash')).toBe(false);
    });

    it('is idempotent (unlocking twice returns same state)', () => {
        const state = createAbilityState();
        const once = unlockAbility(state, 'dash');
        const twice = unlockAbility(once, 'dash');
        expect(twice).toBe(once); // exact same reference
    });

    it('can unlock multiple abilities', () => {
        let state = createAbilityState();
        state = unlockAbility(state, 'wallCling');
        state = unlockAbility(state, 'dash');
        state = unlockAbility(state, 'doubleJump');
        expect(getUnlockedAbilities(state)).toHaveLength(3);
        expect(hasAbility(state, 'wallCling')).toBe(true);
        expect(hasAbility(state, 'dash')).toBe(true);
        expect(hasAbility(state, 'doubleJump')).toBe(true);
    });

    it('unlockAll gives every ability', () => {
        const state = unlockAll();
        expect(hasAbility(state, 'wallCling')).toBe(true);
        expect(hasAbility(state, 'dash')).toBe(true);
        expect(hasAbility(state, 'doubleJump')).toBe(true);
        expect(hasAbility(state, 'groundPound')).toBe(true);
        expect(hasAbility(state, 'phaseShift')).toBe(true);
        expect(getUnlockedAbilities(state)).toHaveLength(5);
    });
});
