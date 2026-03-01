/**
 * Room registry — maps room IDs to their ASCII definitions.
 * Import room strings here and register them.
 */

import { H1 } from './definitions/H1';
import { H2 } from './definitions/H2';
import { H3 } from './definitions/H3';
import { H4 } from './definitions/H4';
import { H5 } from './definitions/H5';
import { C1 } from './definitions/C1';
import { C2 } from './definitions/C2';
import { C3 } from './definitions/C3';
import { C4 } from './definitions/C4';
import { C5 } from './definitions/C5';
import { C6 } from './definitions/C6';

export const ROOMS: Record<string, string> = {
    H1,
    H2,
    H3,
    H4,
    H5,
    C1,
    C2,
    C3,
    C4,
    C5,
    C6,
};

/** The room the player starts in */
export const STARTING_ROOM = 'H1';
