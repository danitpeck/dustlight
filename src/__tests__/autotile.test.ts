import { describe, it, expect } from 'vitest';
import { pickAutotile, terrainSetFrom, applyAutotile, type TerrainSet } from '../game/rooms/autotile';

/** Simple test terrain set with easy-to-verify values */
const TEST_SET: TerrainSet = {
    topLeft: 10, top: 11, topRight: 12,
    left: 20, center: 21, right: 22,
    bottomLeft: 30, bottom: 31, bottomRight: 32,
};

describe('terrainSetFrom', () => {
    it('computes 9 indices from a top-left index', () => {
        const set = terrainSetFrom(195, 20);
        expect(set.topLeft).toBe(195);
        expect(set.top).toBe(196);
        expect(set.topRight).toBe(197);
        expect(set.left).toBe(215);
        expect(set.center).toBe(216);
        expect(set.right).toBe(217);
        expect(set.bottomLeft).toBe(235);
        expect(set.bottom).toBe(236);
        expect(set.bottomRight).toBe(237);
    });
});

describe('pickAutotile', () => {
    it('picks top-left corner when no neighbors above or left', () => {
        expect(pickAutotile(false, true, false, true, TEST_SET)).toBe(TEST_SET.topLeft);
    });

    it('picks top edge when no neighbor above, has left + right', () => {
        expect(pickAutotile(false, true, true, true, TEST_SET)).toBe(TEST_SET.top);
    });

    it('picks top-right corner when no neighbors above or right', () => {
        expect(pickAutotile(false, true, true, false, TEST_SET)).toBe(TEST_SET.topRight);
    });

    it('picks left edge when no neighbor left, has up + down', () => {
        expect(pickAutotile(true, true, false, true, TEST_SET)).toBe(TEST_SET.left);
    });

    it('picks center when surrounded on all sides', () => {
        expect(pickAutotile(true, true, true, true, TEST_SET)).toBe(TEST_SET.center);
    });

    it('picks right edge when no neighbor right, has up + down', () => {
        expect(pickAutotile(true, true, true, false, TEST_SET)).toBe(TEST_SET.right);
    });

    it('picks bottom-left when no neighbors below or left', () => {
        expect(pickAutotile(true, false, false, true, TEST_SET)).toBe(TEST_SET.bottomLeft);
    });

    it('picks bottom edge when no neighbor below, has left + right', () => {
        expect(pickAutotile(true, false, true, true, TEST_SET)).toBe(TEST_SET.bottom);
    });

    it('picks bottom-right when no neighbors below or right', () => {
        expect(pickAutotile(true, false, true, false, TEST_SET)).toBe(TEST_SET.bottomRight);
    });
});

describe('applyAutotile', () => {
    it('autotiles a 2-thick-walled box correctly (OOB=solid)', () => {
        // 6x6 box with 2-tile-thick walls on all sides
        const S = -99; // SOLID placeholder
        const _ = -1;  // empty
        const tiles = [
            [S, S, S, S, S, S],
            [S, S, S, S, S, S],
            [S, S, _, _, S, S],
            [S, S, _, _, S, S],
            [S, S, S, S, S, S],
            [S, S, S, S, S, S],
        ];

        applyAutotile(tiles, S, TEST_SET);

        // Outer rows/cols: fully surrounded (OOB=solid) → all center (blank)
        expect(tiles[0][0]).toBe(TEST_SET.center);
        expect(tiles[0][5]).toBe(TEST_SET.center);
        expect(tiles[5][0]).toBe(TEST_SET.center);
        expect(tiles[5][5]).toBe(TEST_SET.center);
        expect(tiles[0][2]).toBe(TEST_SET.center);  // outer top
        expect(tiles[5][2]).toBe(TEST_SET.center);  // outer bottom
        expect(tiles[2][0]).toBe(TEST_SET.center);  // outer left
        expect(tiles[2][5]).toBe(TEST_SET.center);  // outer right

        // Row 1 inner edges: solid above+left+right, air below at cols 2-3
        expect(tiles[1][1]).toBe(TEST_SET.center);  // solid all 4 sides
        expect(tiles[1][2]).toBe(TEST_SET.bottom);  // solid up+left+right, air down
        expect(tiles[1][3]).toBe(TEST_SET.bottom);  // same
        expect(tiles[1][4]).toBe(TEST_SET.center);  // solid all 4 sides

        // Mid rows inner edges
        expect(tiles[2][1]).toBe(TEST_SET.right);   // solid up+down+left, air right
        expect(tiles[2][4]).toBe(TEST_SET.left);    // air left, solid up+down+right

        // Row 4 inner edges: air above at cols 2-3, solid below+left+right
        expect(tiles[4][1]).toBe(TEST_SET.center);  // solid all 4
        expect(tiles[4][2]).toBe(TEST_SET.top);     // air up, solid down+left+right
        expect(tiles[4][3]).toBe(TEST_SET.top);     // same
        expect(tiles[4][4]).toBe(TEST_SET.center);  // solid all 4

        // Empty cells untouched
        expect(tiles[2][2]).toBe(-1);
        expect(tiles[3][3]).toBe(-1);
    });

    it('does not touch non-solid tiles', () => {
        const tiles = [
            [-1, -1, -1],
            [-1, 42, -1],
            [-1, -1, -1],
        ];

        applyAutotile(tiles, -99, TEST_SET);

        // Nothing should change — no -99 tiles to autotile
        expect(tiles[1][1]).toBe(42);
        expect(tiles[0][0]).toBe(-1);
    });

    it('handles a fully solid grid (all center due to OOB=solid)', () => {
        const SOLID = -99;
        const tiles = [
            [SOLID, SOLID, SOLID],
            [SOLID, SOLID, SOLID],
            [SOLID, SOLID, SOLID],
        ];

        applyAutotile(tiles, SOLID, TEST_SET);

        // Every tile surrounded on all 4 sides (real + OOB) → all center
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                expect(tiles[r][c]).toBe(TEST_SET.center);
            }
        }
    });
});
