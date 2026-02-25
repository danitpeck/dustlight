/**
 * Room registry — maps room IDs to their ASCII definitions.
 * Import room strings here and register them.
 */

import { H1 } from './definitions/H1';

export const ROOMS: Record<string, string> = {
    H1,
};

/** The room the player starts in */
export const STARTING_ROOM = 'H1';
