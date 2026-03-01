/**
 * Pure phase shift state machine — no Phaser dependency.
 *
 * Phase shift makes the moth incorporeal for a brief window:
 * - Phase walls (`%`) become passable
 * - Brief invulnerability
 * - Visual: palette invert, ghost trail, silhouette flicker
 *
 * Player.ts feeds input in, gets state flags.
 * "Becoming dust — or dissociating. Remembering."
 */

import { PHASE } from '../data/constants';

// ─── Types ───

export interface PhaseShiftState {
    /** Is the moth currently phased? */
    isPhased: boolean;
    /** ms remaining in the current phase shift */
    phaseTimer: number;
    /** ms remaining before next phase shift is allowed */
    cooldownTimer: number;
}

export interface PhaseShiftInput {
    /** Was phase shift requested this frame (edge-detected)? */
    phaseRequested: boolean;
    /** Frame delta in ms */
    delta: number;
}

export interface PhaseShiftResult {
    state: PhaseShiftState;
    /** Whether a phase shift just started this frame */
    startedPhase: boolean;
    /** Whether the phase shift just ended this frame */
    endedPhase: boolean;
    /** Is the moth currently phased? (for collision toggling + VFX) */
    isPhased: boolean;
}

// ─── Factory ───

/** Create a fresh phase shift state. */
export function createPhaseShiftState(): PhaseShiftState {
    return {
        isPhased: false,
        phaseTimer: 0,
        cooldownTimer: 0,
    };
}

// ─── Update ───

/** Advance the phase shift state machine by one frame. Pure function. */
export function updatePhaseShift(state: PhaseShiftState, input: PhaseShiftInput): PhaseShiftResult {
    let { isPhased, phaseTimer, cooldownTimer } = state;
    let startedPhase = false;
    let endedPhase = false;

    // ─── Tick cooldown ───
    if (cooldownTimer > 0) {
        cooldownTimer = Math.max(0, cooldownTimer - input.delta);
    }

    // ─── Start a new phase shift? ───
    if (input.phaseRequested && !isPhased && cooldownTimer <= 0) {
        isPhased = true;
        phaseTimer = PHASE.DURATION_MS;
        cooldownTimer = PHASE.COOLDOWN_MS;
        startedPhase = true;
    }

    // ─── During phase (skip tick on start frame) ───
    if (isPhased && !startedPhase) {
        phaseTimer -= input.delta;

        if (phaseTimer <= 0) {
            isPhased = false;
            phaseTimer = 0;
            endedPhase = true;
        }
    }

    return {
        state: { isPhased, phaseTimer, cooldownTimer },
        startedPhase,
        endedPhase,
        isPhased,
    };
}
