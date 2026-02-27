/**
 * Door Connections — defines which doors link between rooms.
 *
 * Each connection is bidirectional: if room A's east door leads to room B,
 * then room B's west door leads back to room A.
 *
 * Doors are identified by their edge position:
 * - 'north' = top row (row 0)
 * - 'south' = bottom row (row 14)
 * - 'east'  = right column (col 19)
 * - 'west'  = left column (col 0)
 *
 * When transitioning, the player spawns at the corresponding door
 * on the destination room's opposite edge.
 */

export type DoorEdge = 'north' | 'south' | 'east' | 'west';

export interface DoorConnection {
    /** Room ID this door leads to */
    targetRoom: string;
    /** Which edge the door is on in the current room */
    fromEdge: DoorEdge;
    /** Which edge the player arrives at in the target room */
    toEdge: DoorEdge;
}

/** Opposite edges for bidirectional door pairing */
export const OPPOSITE_EDGE: Record<DoorEdge, DoorEdge> = {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east',
};

/**
 * Door connection registry.
 * Key = room ID, value = array of door connections from that room.
 *
 * Only define one direction — the reverse is derived automatically.
 * (We store both for quick lookup.)
 */
export const DOOR_CONNECTIONS: Record<string, DoorConnection[]> = {};

/** Helper to wire a bidirectional door connection between two rooms. */
function connect(
    roomA: string, edgeA: DoorEdge,
    roomB: string, edgeB: DoorEdge,
): void {
    if (!DOOR_CONNECTIONS[roomA]) DOOR_CONNECTIONS[roomA] = [];
    if (!DOOR_CONNECTIONS[roomB]) DOOR_CONNECTIONS[roomB] = [];

    DOOR_CONNECTIONS[roomA].push({ targetRoom: roomB, fromEdge: edgeA, toEdge: edgeB });
    DOOR_CONNECTIONS[roomB].push({ targetRoom: roomA, fromEdge: edgeB, toEdge: edgeA });
}

// ─── The Clearing (Hub) connections ───
connect('H1', 'west',  'H3', 'east');   // H1 left → H3 right (West Path)
connect('H1', 'north', 'H2', 'south');  // H1 top → H2 bottom (Canopy)
connect('H1', 'east',  'H4', 'west');   // H1 right → H4 left (East Path)
connect('H1', 'south', 'H5', 'north');  // H1 bottom → H5 top (Below)
