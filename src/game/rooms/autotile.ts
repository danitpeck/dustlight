/**
 * Autotile System
 *
 * Given a 2D grid of "is this tile solid?" booleans, picks the correct
 * piece from a 3×3 tileset for each solid tile based on its neighbors.
 *
 * The 3×3 tileset layout:
 *   TL  T  TR     (top-left corner, top edge, top-right corner)
 *   L   C   R     (left edge, center fill, right edge)
 *   BL  B  BR     (bottom-left corner, bottom edge, bottom-right corner)
 *
 * Selection logic uses two independent axes:
 *   Vertical:   top (nothing above) | middle (solid above & below) | bottom (nothing below)
 *   Horizontal: left (nothing left) | center (solid left & right) | right (nothing right)
 *
 * Pure function — no Phaser dependency.
 */

/** A 3×3 terrain tileset: 9 tile indices arranged as a grid */
export interface TerrainSet {
    topLeft: number;
    top: number;
    topRight: number;
    left: number;
    center: number;
    right: number;
    bottomLeft: number;
    bottom: number;
    bottomRight: number;
}

/** Create a TerrainSet from a top-left tile index, assuming a 20-column spritesheet */
export function terrainSetFrom(
    topLeftIndex: number,
    sheetColumns = 20,
    overrides: Partial<TerrainSet> = {},
): TerrainSet {
    const tl = topLeftIndex;
    return {
        topLeft:     tl,
        top:         tl + 1,
        topRight:    tl + 2,
        left:        tl + sheetColumns,
        center:      tl + sheetColumns + 1,
        right:       tl + sheetColumns + 2,
        bottomLeft:  tl + sheetColumns * 2,
        bottom:      tl + sheetColumns * 2 + 1,
        bottomRight: tl + sheetColumns * 2 + 2,
        ...overrides,
    };
}

/**
 * Pick the correct tile from a TerrainSet based on neighbor presence.
 *
 * @param hasUp    - Is there a solid tile above?
 * @param hasDown  - Is there a solid tile below?
 * @param hasLeft  - Is there a solid tile to the left?
 * @param hasRight - Is there a solid tile to the right?
 * @param set      - The 3×3 terrain tileset to pick from
 */
export function pickAutotile(
    hasUp: boolean,
    hasDown: boolean,
    hasLeft: boolean,
    hasRight: boolean,
    set: TerrainSet,
): number {
    // Vertical axis: top / middle / bottom
    // Horizontal axis: left / center / right
    const vertical = !hasUp ? 'top' : !hasDown ? 'bottom' : 'middle';
    const horizontal = !hasLeft ? 'left' : !hasRight ? 'right' : 'center';

    // Combine into the 9 possible pieces
    if (vertical === 'top' && horizontal === 'left') return set.topLeft;
    if (vertical === 'top' && horizontal === 'center') return set.top;
    if (vertical === 'top' && horizontal === 'right') return set.topRight;
    if (vertical === 'middle' && horizontal === 'left') return set.left;
    if (vertical === 'middle' && horizontal === 'center') return set.center;
    if (vertical === 'middle' && horizontal === 'right') return set.right;
    if (vertical === 'bottom' && horizontal === 'left') return set.bottomLeft;
    if (vertical === 'bottom' && horizontal === 'center') return set.bottom;
    // bottom + right
    return set.bottomRight;
}

/**
 * Apply autotiling to a 2D tile grid.
 *
 * Scans each cell — if it's flagged as autotileable, checks its 4 cardinal
 * neighbors and replaces the tile index with the correct piece from the set.
 *
 * @param tiles          - The 2D tile index array (mutated in place)
 * @param autoTileIndex  - The placeholder tile index that should be autotiled (e.g., the SOLID index)
 * @param set            - The TerrainSet to use
 * @param alsoSolid      - Additional tile indices that count as "solid neighbor" (e.g., cracked floors blend with walls)
 * @returns The mutated tiles array
 */
export function applyAutotile(
    tiles: number[][],
    autoTileIndex: number,
    set: TerrainSet,
    alsoSolid: number[] = [],
): number[][] {
    const height = tiles.length;
    const width = tiles[0]?.length ?? 0;

    const solidSet = new Set([autoTileIndex, ...alsoSolid]);

    const isSolid = (row: number, col: number): boolean => {
        // Out-of-bounds = solid → outermost wall tiles become center (blank),
        // inner wall tiles become proper left/right edge pieces facing the room.
        if (row < 0 || row >= height || col < 0 || col >= width) return true;
        return solidSet.has(tiles[row][col]);
    };

    // We need to read the original grid while writing, so snapshot first
    const snapshot = tiles.map(row => [...row]);
    const isSolidOriginal = (row: number, col: number): boolean => {
        if (row < 0 || row >= height || col < 0 || col >= width) return true;
        return solidSet.has(snapshot[row][col]);
    };

    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            if (snapshot[row][col] !== autoTileIndex) continue;

            const hasUp = isSolidOriginal(row - 1, col);
            const hasDown = isSolidOriginal(row + 1, col);
            const hasLeft = isSolidOriginal(row, col - 1);
            const hasRight = isSolidOriginal(row, col + 1);

            tiles[row][col] = pickAutotile(hasUp, hasDown, hasLeft, hasRight, set);
        }
    }

    return tiles;
}
