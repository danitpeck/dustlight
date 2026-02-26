/**
 * Room registry — maps room IDs to their ASCII definitions.
 * Import room strings here and register them.
 */

import { H1 } from './definitions/H1';
import { H2 } from './definitions/H2';
import { H3 } from './definitions/H3';

export const ROOMS: Record<string, string> = {
    H1,
    H2,
    H3,
};

/** The room the player starts in */
export const STARTING_ROOM = 'H1';
