/**
 * ASCII Room Parser
 *
 * Pure function — no Phaser dependency. Fully testable.
 *
 * Takes a 20×15 ASCII room string and returns:
 * - A 2D tile index array for the Phaser tilemap (with autotiling applied)
 * - A list of entity spawn positions (player, enemies, bosses)
 */

import { GLYPH_TO_TILE, ENTITY_GLYPHS, TileIndex, TERRAIN_SETS } from '../data/glyphs';
import { applyAutotile, type TerrainSet } from './autotile';

/** Room dimensions in tiles */
export const ROOM_WIDTH = 20;
export const ROOM_HEIGHT = 15;

/** An entity spawn extracted from the ASCII map */
export interface EntitySpawn {
    glyph: string;
    col: number;
    row: number;
}

/** Result of parsing an ASCII room */
export interface ParsedRoom {
    /** 2D array of tile indices (ROOM_HEIGHT rows × ROOM_WIDTH cols). -1 = empty. */
    tiles: number[][];
    /** Entity spawn positions extracted from the map */
    spawns: EntitySpawn[];
}

/**
 * Parse an ASCII room string into tile data + entity spawns.
 *
 * @param ascii      - A string of 15 lines, each exactly 20 characters wide.
 *                     Lines are separated by '\n'. Leading/trailing whitespace is trimmed.
 * @param terrainSet - Which 3×3 terrain tileset to use for wall autotiling (defaults to DEFAULT)
 * @returns ParsedRoom with tiles and spawns
 * @throws Error if the room dimensions are wrong
 */
export function parseRoom(ascii: string, terrainSet: TerrainSet = TERRAIN_SETS.DEFAULT): ParsedRoom {
    const lines = ascii.trim().split('\n').map(line => line.trimEnd());

    if (lines.length !== ROOM_HEIGHT) {
        throw new Error(
            `Room must be ${ROOM_HEIGHT} lines tall, got ${lines.length}`
        );
    }

    const tiles: number[][] = [];
    const spawns: EntitySpawn[] = [];

    for (let row = 0; row < ROOM_HEIGHT; row++) {
        const line = lines[row];
        if (line.length !== ROOM_WIDTH) {
            throw new Error(
                `Row ${row} must be ${ROOM_WIDTH} chars wide, got ${line.length}: "${line}"`
            );
        }

        const tileRow: number[] = [];
        for (let col = 0; col < ROOM_WIDTH; col++) {
            const glyph = line[col];

            // Extract entity spawn positions
            if ((ENTITY_GLYPHS as readonly string[]).includes(glyph)) {
                spawns.push({ glyph, col, row });
            }

            // Map glyph to tile index (-1 for air and spawn markers)
            const tileIndex = GLYPH_TO_TILE[glyph];
            if (tileIndex === undefined) {
                throw new Error(
                    `Unknown glyph '${glyph}' at row ${row}, col ${col}`
                );
            }
            tileRow.push(tileIndex);
        }
        tiles.push(tileRow);
    }

    // Apply autotiling: replace the SOLID placeholder with correct 3×3 pieces
    applyAutotile(tiles, TileIndex.SOLID, terrainSet);

    return { tiles, spawns };
}
