/**
 * Pure ground pound state machine — no Phaser dependency.
 *
 * The ground pound is a powerful downward slam:
 * - Activated while airborne (Down + attack, or just Down while mid-air)
 * - Brief hang at apex, then FAST fall
 * - On impact: hitstop, screen shake, dust burst, AOE damage
 * - Breaks cracked floor tiles (`=`) underneath the moth
 *
 * Player.ts feeds input in, gets velocity + event flags.
 * "A dive-bomb — or breaking through denial."
 */

import { GROUND_POUND } from '../data/constants';

// ─── Types ───

export type PoundPhase = 'idle' | 'windup' | 'falling' | 'impact';

export interface GroundPoundState {
    /** Current phase of the ground pound */
    phase: PoundPhase;
    /** ms remaining in the current phase (windup or impact freeze) */
    phaseTimer: number;
}

export interface GroundPoundInput {
    /** Was ground pound requested this frame? (Down + attack while airborne) */
    poundRequested: boolean;
    /** Is the moth on the ground? */
    onGround: boolean;
    /** Frame delta in ms */
    delta: number;
}

export interface GroundPoundResult {
    state: GroundPoundState;
    /** Whether the pound just started (entered windup) */
    startedPound: boolean;
    /** Whether the moth just hit the ground from a pound */
    impacted: boolean;
    /** Y velocity override (null = don't change) */
    velocityY: number | null;
    /** X velocity override (null = don't change) */
    velocityX: number | null;
    /** Whether gravity should be disabled this frame (during windup) */
    suppressGravity: boolean;
    /** Whether the moth is in active pound state (windup or falling) */
    isPounding: boolean;
}

// ─── Constants ───

/** Brief hang time before the slam (ms) */
const WINDUP_MS = 80;

// ─── Factory ───

/** Create a fresh ground pound state. */
export function createGroundPoundState(): GroundPoundState {
    return {
        phase: 'idle',
        phaseTimer: 0,
    };
}

// ─── Update ───

/** Advance the ground pound state machine by one frame. Pure function. */
export function updateGroundPound(state: GroundPoundState, input: GroundPoundInput): GroundPoundResult {
    let { phase, phaseTimer } = state;
    let startedPound = false;
    let impacted = false;
    let velocityY: number | null = null;
    let velocityX: number | null = null;
    let suppressGravity = false;

    switch (phase) {
        case 'idle':
            // Can only start while airborne
            if (input.poundRequested && !input.onGround) {
                phase = 'windup';
                phaseTimer = WINDUP_MS;
                startedPound = true;
                // Freeze in place during windup
                velocityY = 0;
                velocityX = 0;
                suppressGravity = true;
            }
            break;

        case 'windup':
            phaseTimer -= input.delta;
            velocityY = 0;
            velocityX = 0;
            suppressGravity = true;

            if (phaseTimer <= 0) {
                // SLAM! Transition to falling
                phase = 'falling';
                phaseTimer = 0;
                velocityY = GROUND_POUND.FALL_SPEED;
                velocityX = 0;
                suppressGravity = false; // gravity adds to fall speed — even scarier
            }
            break;

        case 'falling':
            // Override to maintain slam speed (don't let drag slow us)
            velocityY = GROUND_POUND.FALL_SPEED;
            velocityX = 0;

            // Hit the ground?
            if (input.onGround) {
                phase = 'impact';
                phaseTimer = GROUND_POUND.IMPACT_FREEZE_MS;
                impacted = true;
                velocityY = 0;
            }
            break;

        case 'impact':
            // Freeze during impact frames
            phaseTimer -= input.delta;
            velocityY = 0;
            velocityX = 0;

            if (phaseTimer <= 0) {
                phase = 'idle';
                phaseTimer = 0;
            }
            break;
    }

    const isPounding = phase === 'windup' || phase === 'falling';

    return {
        state: { phase, phaseTimer },
        startedPound,
        impacted,
        velocityY,
        velocityX,
        suppressGravity,
        isPounding,
    };
}
