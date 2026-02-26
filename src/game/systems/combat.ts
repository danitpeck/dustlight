/**
 * Pure combat state machine — no Phaser dependency.
 *
 * Handles attack timing (duration + cooldown) and hit detection
 * (invuln windows, HP, death). Player.ts feeds inputs in,
 * gets back state + commands to execute on the Phaser side.
 */

import { ATTACK, PLAYER_HP } from '../data/constants';

// ─── Attack State ───

export interface AttackState {
    /** Whether an attack is currently active */
    isAttacking: boolean;
    /** ms remaining while the hitbox is live */
    attackTimer: number;
    /** ms remaining before the next attack is allowed */
    cooldown: number;
}

export interface AttackInput {
    /** Whether the player pressed attack this frame */
    attackRequested: boolean;
    /** Frame delta in ms */
    delta: number;
}

export interface AttackResult {
    state: AttackState;
    /** True the frame an attack starts (trigger VFX/hitbox) */
    startedAttack: boolean;
    /** True the frame an attack ends (disable hitbox) */
    endedAttack: boolean;
}

/** Create a fresh attack state. */
export function createAttackState(): AttackState {
    return { isAttacking: false, attackTimer: 0, cooldown: 0 };
}

/** Advance the attack state machine by one frame. Pure function. */
export function updateAttack(state: AttackState, input: AttackInput): AttackResult {
    let { isAttacking, attackTimer, cooldown } = state;
    let startedAttack = false;
    let endedAttack = false;

    cooldown -= input.delta;

    // Start a new attack?
    if (input.attackRequested && cooldown <= 0 && !isAttacking) {
        isAttacking = true;
        attackTimer = ATTACK.DURATION_MS;
        cooldown = ATTACK.COOLDOWN_MS;
        startedAttack = true;
    }

    // Tick active attack
    if (isAttacking) {
        attackTimer -= input.delta;
        if (attackTimer <= 0) {
            isAttacking = false;
            endedAttack = true;
        }
    }

    return {
        state: { isAttacking, attackTimer, cooldown },
        startedAttack,
        endedAttack,
    };
}

// ─── HP / Damage State ───

export interface HPState {
    /** Current hit points */
    hp: number;
    /** ms remaining of post-hit invulnerability */
    invulnTimer: number;
    /** ms remaining in the current blink phase */
    blinkTimer: number;
    /** Whether sprite should be visible this frame (for blink) */
    visible: boolean;
    /** Whether the entity is dead */
    dead: boolean;
}

export interface DamageInput {
    /** Damage amount */
    amount: number;
}

export interface DamageResult {
    state: HPState;
    /** True if the hit connected (wasn't blocked by invuln/death) */
    hit: boolean;
    /** True if this hit killed the entity */
    died: boolean;
}

/** Create a fresh HP state. */
export function createHPState(maxHP: number = PLAYER_HP.MAX): HPState {
    return {
        hp: maxHP,
        invulnTimer: 0,
        blinkTimer: 0,
        visible: true,
        dead: false,
    };
}

/** Try to apply damage. Pure function — returns new state + whether the hit connected. */
export function applyDamage(state: HPState, input: DamageInput): DamageResult {
    if (state.dead || state.invulnTimer > 0) {
        return { state, hit: false, died: false };
    }

    const hp = state.hp - input.amount;
    const dead = hp <= 0;

    return {
        state: {
            hp,
            invulnTimer: PLAYER_HP.INVULN_MS,
            blinkTimer: PLAYER_HP.BLINK_MS,
            visible: false, // start blinking
            dead,
        },
        hit: true,
        died: dead,
    };
}

/** Tick the invuln/blink timer. Pure function. */
export function tickHP(state: HPState, delta: number): HPState {
    if (state.dead || state.invulnTimer <= 0) return state;

    let { invulnTimer, blinkTimer, visible } = state;

    invulnTimer -= delta;
    blinkTimer -= delta;

    if (blinkTimer <= 0) {
        visible = !visible;
        blinkTimer = PLAYER_HP.BLINK_MS;
    }

    if (invulnTimer <= 0) {
        visible = true;
    }

    return { ...state, invulnTimer, blinkTimer, visible };
}
