/**
 * Glyph-to-tile-index mapping for the Kenney 1-Bit Platformer Pack.
 *
 * The spritesheet is a 20×20 grid of 16×16 tiles (400 total).
 * Index = row * 20 + col (0-based).
 *
 * -1 means "no visible tile" — used for air and for spawn markers
 * that are only positional data (not rendered as tiles).
 *
 * This file is the single source of truth for all glyph → tile mappings.
 */

import { terrainSetFrom, type TerrainSet } from '../rooms/autotile';

/** Tile indices from the Kenney 1-bit spritesheet */
export const TileIndex = {
    /**
     * Placeholder value for solid walls in the raw parse pass.
     * Gets replaced by autotiling with the correct 3×3 piece.
     * Using -99 so it's obviously wrong if it leaks through.
     */
    SOLID:          -99,
    THIN_PLATFORM:  63,    // Pass-through platform from below (placeholder — tune later)
    CRACKED_FLOOR:  3,    // Ground Pound breakable (placeholder)
    PHASE_WALL:     4,    // Phase Shift passable (placeholder)
    SPIKES:         337,  // Spike hazard (row 16, col 17 — placeholder)
    DOOR:           56,  // Door / room transition marker (placeholder)
    ABILITY_PICKUP: 168,  // Star/gem for ability pickups (placeholder)
    SECRET_ITEM:    169,  // Hidden collectible (placeholder)
} as const;

/**
 * 3×3 terrain sets from the Kenney 1-bit spritesheet.
 * Each set has 9 tiles: corners, edges, and center fill.
 * Top-left index → the rest computed from spritesheet layout (20 cols).
 *
 * We can swap these per zone later (Roots = organic, Works = metal, etc.)
 */
export const TERRAIN_SETS = {
    /** Default ruin/stone set — good all-purpose walls. Center is blank (tile 0). */
    DEFAULT: terrainSetFrom(195, 20, { center: 0 }),  // (col 15, row 9) → 9*20+15 = 195
} as const satisfies Record<string, TerrainSet>;

/**
 * Maps an ASCII glyph to a Kenney tile index.
 * Returns -1 for air/empty and for entity spawn markers
 * (those are handled by the entity system, not the tilemap).
 */
export const GLYPH_TO_TILE: Record<string, number> = {
    '#': TileIndex.SOLID,
    '.': -1,                       // Air / empty
    'S': -1,                       // Player spawn (position marker only)
    'D': TileIndex.DOOR,
    '~': TileIndex.THIN_PLATFORM,
    '^': TileIndex.SPIKES,
    '=': TileIndex.CRACKED_FLOOR,
    '%': TileIndex.PHASE_WALL,
    '*': TileIndex.ABILITY_PICKUP,
    'E': -1,                       // Enemy spawn (entity system)
    'B': -1,                       // Boss spawn (entity system)
    '?': TileIndex.SECRET_ITEM,
};

/**
 * Glyphs that represent solid/collidable tiles.
 * Used by the Game scene to set collision after creating the tilemap layer.
 * Includes all 9 pieces of each terrain set + other solid glyphs.
 */
export function getSolidTileIndices(terrainSet: TerrainSet = TERRAIN_SETS.DEFAULT): number[] {
    return [
        terrainSet.topLeft,
        terrainSet.top,
        terrainSet.topRight,
        terrainSet.left,
        terrainSet.center,
        terrainSet.right,
        terrainSet.bottomLeft,
        terrainSet.bottom,
        terrainSet.bottomRight,
        TileIndex.CRACKED_FLOOR,
        TileIndex.PHASE_WALL,
    ];
}

/**
 * Glyphs that mark entity spawn positions (not rendered as tiles).
 * The parser extracts these positions separately for the entity system.
 */
export const ENTITY_GLYPHS = ['S', 'E', 'B'] as const;
