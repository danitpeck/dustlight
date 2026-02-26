import { describe, it, expect } from 'vitest';
import {
    createAttackState,
    updateAttack,
    createHPState,
    applyDamage,
    tickHP,
} from '../game/systems/combat';
import { ATTACK, PLAYER_HP } from '../game/data/constants';

describe('Attack state machine', () => {
    it('starts idle with no active attack', () => {
        const state = createAttackState();
        expect(state.isAttacking).toBe(false);
        expect(state.attackTimer).toBe(0);
        expect(state.cooldown).toBe(0);
    });

    it('starts an attack when requested and off cooldown', () => {
        const state = createAttackState();
        const result = updateAttack(state, { attackRequested: true, delta: 16 });

        expect(result.startedAttack).toBe(true);
        expect(result.state.isAttacking).toBe(true);
        expect(result.state.attackTimer).toBeGreaterThan(0);
        expect(result.state.cooldown).toBe(ATTACK.COOLDOWN_MS);
    });

    it('does not start an attack when on cooldown', () => {
        let state = createAttackState();
        // First attack
        const r1 = updateAttack(state, { attackRequested: true, delta: 16 });
        state = r1.state;

        // Tick past attack duration but NOT past cooldown
        const r2 = updateAttack(state, { attackRequested: false, delta: ATTACK.DURATION_MS });
        state = r2.state;

        // Try again — should fail (still on cooldown)
        const r3 = updateAttack(state, { attackRequested: true, delta: 16 });
        expect(r3.startedAttack).toBe(false);
        expect(r3.state.isAttacking).toBe(false);
    });

    it('ends the attack after duration expires', () => {
        const state = createAttackState();
        const r1 = updateAttack(state, { attackRequested: true, delta: 16 });

        // Tick past the full duration
        const r2 = updateAttack(r1.state, { attackRequested: false, delta: ATTACK.DURATION_MS });
        expect(r2.endedAttack).toBe(true);
        expect(r2.state.isAttacking).toBe(false);
    });

    it('allows a second attack after cooldown expires', () => {
        let state = createAttackState();

        // First attack
        const r1 = updateAttack(state, { attackRequested: true, delta: 16 });
        state = r1.state;

        // Tick past both duration and cooldown
        const r2 = updateAttack(state, { attackRequested: false, delta: ATTACK.COOLDOWN_MS + 100 });
        state = r2.state;

        // Second attack should work
        const r3 = updateAttack(state, { attackRequested: true, delta: 16 });
        expect(r3.startedAttack).toBe(true);
        expect(r3.state.isAttacking).toBe(true);
    });

    it('does nothing when not requested and idle', () => {
        const state = createAttackState();
        const result = updateAttack(state, { attackRequested: false, delta: 16 });

        expect(result.startedAttack).toBe(false);
        expect(result.endedAttack).toBe(false);
        expect(result.state.isAttacking).toBe(false);
    });

    it('does not re-trigger while already attacking', () => {
        const state = createAttackState();
        const r1 = updateAttack(state, { attackRequested: true, delta: 16 });

        // Mash attack again mid-swing
        const r2 = updateAttack(r1.state, { attackRequested: true, delta: 16 });
        expect(r2.startedAttack).toBe(false); // already active
        expect(r2.state.isAttacking).toBe(true); // still going
    });
});

describe('HP / Damage state machine', () => {
    it('starts at full HP, not invuln, not dead', () => {
        const state = createHPState(3);
        expect(state.hp).toBe(3);
        expect(state.invulnTimer).toBe(0);
        expect(state.dead).toBe(false);
        expect(state.visible).toBe(true);
    });

    it('takes damage and enters invuln', () => {
        const state = createHPState(3);
        const result = applyDamage(state, { amount: 1 });

        expect(result.hit).toBe(true);
        expect(result.died).toBe(false);
        expect(result.state.hp).toBe(2);
        expect(result.state.invulnTimer).toBe(PLAYER_HP.INVULN_MS);
    });

    it('blocks damage during invuln window', () => {
        const state = createHPState(3);
        const r1 = applyDamage(state, { amount: 1 });

        // Try to hit again during invuln
        const r2 = applyDamage(r1.state, { amount: 1 });
        expect(r2.hit).toBe(false);
        expect(r2.state.hp).toBe(2); // unchanged
    });

    it('dies at 0 HP', () => {
        const state = createHPState(1);
        const result = applyDamage(state, { amount: 1 });

        expect(result.hit).toBe(true);
        expect(result.died).toBe(true);
        expect(result.state.dead).toBe(true);
        expect(result.state.hp).toBe(0);
    });

    it('blocks damage when already dead', () => {
        const state = createHPState(1);
        const r1 = applyDamage(state, { amount: 1 });

        const r2 = applyDamage(r1.state, { amount: 1 });
        expect(r2.hit).toBe(false);
    });

    it('overkill still results in death', () => {
        const state = createHPState(2);
        const result = applyDamage(state, { amount: 5 });

        expect(result.died).toBe(true);
        expect(result.state.hp).toBe(-3);
    });

    it('blinks during invuln and restores visibility after', () => {
        const state = createHPState(3);
        const damaged = applyDamage(state, { amount: 1 }).state;

        // Tick through a few blink cycles
        let s = damaged;
        const visibilities: boolean[] = [];
        for (let i = 0; i < 5; i++) {
            s = tickHP(s, PLAYER_HP.BLINK_MS);
            visibilities.push(s.visible);
        }

        // Should alternate
        expect(visibilities).toContain(true);
        expect(visibilities).toContain(false);

        // Tick past full invuln — should be visible
        s = tickHP(s, PLAYER_HP.INVULN_MS);
        expect(s.visible).toBe(true);
    });

    it('tickHP is a no-op when not in invuln', () => {
        const state = createHPState(3);
        const ticked = tickHP(state, 100);
        expect(ticked).toBe(state); // same reference, no change
    });
});
