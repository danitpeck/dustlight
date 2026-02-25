import { describe, it, expect } from 'vitest';
import { parseRoom, ROOM_WIDTH, ROOM_HEIGHT } from '../game/rooms/parser';
import { GLYPH_TO_TILE, TileIndex, TERRAIN_SETS } from '../game/data/glyphs';
import { pickAutotile, terrainSetFrom } from '../game/rooms/autotile';

const DEFAULT = TERRAIN_SETS.DEFAULT;

const SIMPLE_ROOM = `\
####################
#..................#
#..................#
#..................#
#..................#
#..................#
#..................#
#..................#
#..................#
#..................#
#..................#
#..................#
#..................#
#.......S..........#
####################`;

describe('parseRoom', () => {
    it('returns correct dimensions', () => {
        const { tiles } = parseRoom(SIMPLE_ROOM);
        expect(tiles.length).toBe(ROOM_HEIGHT);
        for (const row of tiles) {
            expect(row.length).toBe(ROOM_WIDTH);
        }
    });

    it('outer wall tiles become center (blank) via OOB=solid', () => {
        const { tiles } = parseRoom(SIMPLE_ROOM);
        // Corner tiles: OOB on two sides + solid on other two → center (blank)
        expect(tiles[0][0]).toBe(DEFAULT.center);
        expect(tiles[0][ROOM_WIDTH - 1]).toBe(DEFAULT.center);
        expect(tiles[ROOM_HEIGHT - 1][0]).toBe(DEFAULT.center);
        expect(tiles[ROOM_HEIGHT - 1][ROOM_WIDTH - 1]).toBe(DEFAULT.center);
        // Top row mid (row 0, col 5): OOB above(solid), solid left+right, air below → bottom
        expect(tiles[0][5]).toBe(DEFAULT.bottom);
        // Bottom row mid (row 14, col 5): air above, OOB below(solid), solid left+right → top
        expect(tiles[ROOM_HEIGHT - 1][5]).toBe(DEFAULT.top);
    });

    it('inner wall tiles get proper edge pieces facing the room', () => {
        const { tiles } = parseRoom(SIMPLE_ROOM);
        // Left wall (col 0, mid): OOB left(solid), solid above+below, air right → right piece
        expect(tiles[5][0]).toBe(DEFAULT.right);
        // Right wall (col 19, mid): air left, solid above+below, OOB right(solid) → left piece
        expect(tiles[5][ROOM_WIDTH - 1]).toBe(DEFAULT.left);
    });

    it('maps air glyphs to -1', () => {
        const { tiles } = parseRoom(SIMPLE_ROOM);
        // Interior should be empty
        expect(tiles[1][1]).toBe(-1);
        expect(tiles[5][10]).toBe(-1);
    });

    it('maps spawn glyph to -1 (not a visible tile)', () => {
        const { tiles } = parseRoom(SIMPLE_ROOM);
        // S is at row 13, col 8
        expect(tiles[13][8]).toBe(-1);
    });

    it('extracts player spawn position', () => {
        const { spawns } = parseRoom(SIMPLE_ROOM);
        const playerSpawn = spawns.find(s => s.glyph === 'S');
        expect(playerSpawn).toBeDefined();
        expect(playerSpawn!.col).toBe(8);
        expect(playerSpawn!.row).toBe(13);
    });

    it('throws on wrong number of rows', () => {
        const bad = '#'.repeat(20) + '\n' + '#'.repeat(20);
        expect(() => parseRoom(bad)).toThrow(/15 lines/);
    });

    it('throws on wrong row width', () => {
        const lines = Array(15).fill('#'.repeat(20));
        lines[5] = '#'.repeat(10); // too short
        expect(() => parseRoom(lines.join('\n'))).toThrow(/20 chars wide/);
    });

    it('throws on unknown glyph', () => {
        const lines = Array(15).fill('#'.repeat(20));
        lines[7] = '#########@##########'; // @ is not a known glyph
        expect(() => parseRoom(lines.join('\n'))).toThrow(/Unknown glyph '@'/);
    });

    it('parses door glyphs correctly', () => {
        const room = `\
##########DD########
#..................#
#..................#
#..................#
#..................#
#..................#
D..................D
D..................D
#..................#
#..................#
#..................#
#..................#
#..................#
#.......S..........#
########DD##########`;

        const { tiles } = parseRoom(room);
        // Top doors
        expect(tiles[0][10]).toBe(TileIndex.DOOR);
        expect(tiles[0][11]).toBe(TileIndex.DOOR);
        // Left doors
        expect(tiles[6][0]).toBe(TileIndex.DOOR);
        expect(tiles[7][0]).toBe(TileIndex.DOOR);
        // Right doors
        expect(tiles[6][19]).toBe(TileIndex.DOOR);
        // Bottom doors
        expect(tiles[14][8]).toBe(TileIndex.DOOR);
    });

    it('handles all glyph types without throwing', () => {
        // Room using every glyph at least once
        const room = `\
####################
#.~^=%.............#
#.*?...............#
#..................#
#..................#
#..................#
D..................D
D..................D
#..................#
#..................#
#..................#
#..................#
#.E................#
#.B....S...........#
####################`;

        expect(() => parseRoom(room)).not.toThrow();
        const { spawns } = parseRoom(room);
        expect(spawns.find(s => s.glyph === 'S')).toBeDefined();
        expect(spawns.find(s => s.glyph === 'E')).toBeDefined();
        expect(spawns.find(s => s.glyph === 'B')).toBeDefined();
    });
});
