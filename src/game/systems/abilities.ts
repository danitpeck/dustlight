/**
 * Pure ability registry — no Phaser dependency.
 *
 * Tracks which abilities the moth has unlocked.
 * Dead simple: a Set of ability IDs. Player.ts checks this
 * before allowing ability-specific actions.
 *
 * Each ability maps to exactly one room pickup location
 * (see ROOM_ABILITY_MAP for the room → ability mapping).
 */

// ─── Types ───

/** All unlockable abilities in acquisition order. */
export type AbilityId = 'wallCling' | 'dash' | 'doubleJump' | 'groundPound' | 'phaseShift';

/** Which ability each room's `*` pickup grants. */
export const ROOM_ABILITY_MAP: Record<string, AbilityId> = {
    // These room IDs will be populated as zones are built.
    // For now, we support debug-unlocking and future pickup rooms.
    'C6': 'wallCling',    // The Roots — Wall Cling Shrine
    // 'F?': 'dash',      // The Works — TBD
    // 'S?': 'doubleJump', // The Updraft — TBD
    // 'D?': 'groundPound', // The Still — TBD
    // 'D?': 'phaseShift',  // The Still — TBD
};

/** Immutable ability state. */
export interface AbilityState {
    /** Set of unlocked ability IDs */
    readonly unlocked: ReadonlySet<AbilityId>;
}

// ─── Factory ───

/** Create a fresh ability state (nothing unlocked). */
export function createAbilityState(): AbilityState {
    return { unlocked: new Set() };
}

// ─── Queries ───

/** Check if a specific ability is unlocked. */
export function hasAbility(state: AbilityState, id: AbilityId): boolean {
    return state.unlocked.has(id);
}

/** Get all unlocked abilities as an array (for debug display). */
export function getUnlockedAbilities(state: AbilityState): AbilityId[] {
    return [...state.unlocked];
}

// ─── Mutations (return new state) ───

/** Unlock an ability. Returns new state (original unchanged). */
export function unlockAbility(state: AbilityState, id: AbilityId): AbilityState {
    if (state.unlocked.has(id)) return state; // already unlocked, no-op
    const next = new Set(state.unlocked);
    next.add(id);
    return { unlocked: next };
}

/** Unlock all abilities (debug / testing). */
export function unlockAll(): AbilityState {
    return {
        unlocked: new Set<AbilityId>([
            'wallCling', 'dash', 'doubleJump', 'groundPound', 'phaseShift',
        ]),
    };
}
