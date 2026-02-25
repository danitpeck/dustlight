# Dustlight - Design Doc (v0.2)

## Elevator Pitch
A 1-bit metroidvania about a moth drawn to a light in a ruined world. Tight platforming, code-driven juice, and a hidden narrative that recontextualizes everything on a second playthrough. On the surface: charming wordless moth adventure. Underneath: something much sadder and stranger.

## Protagonist: The Moth

### Surface Layer (First Playthrough)
You are a small moth. You are drawn to a light deep inside a vast ruin. You don't speak. You don't have a name (yet). You just move forward.

Moth logic:
- Wings up / wings down = idle animation (two frames, perfect for 1-bit).
- Wall cling = moth claws, natural.
- Dash = flutter burst.
- Phase shift = becoming dust, passing through cracks.
- She's expressive through movement alone — squash on landing, stretch on jumping, frantic flutter when damaged.

### Hidden Layer (Second Playthrough / Attentive Players)
- She's too purposeful. Moths don't solve puzzles. Moths don't fight.
- Rooms crack the metaphor: a kitchen tile layout in the Caves. A garden pattern in the Spire. A child's bedroom in the Depths. The moth doesn't react. The player notices.
- On damage or Phase Shift, the silhouette **flickers** — for a frame or two, the shape isn't a moth. It's a woman. A girl. Then it's gone.
- The light she's chasing isn't at the top of a tower. It's a porch light. Left on.
- The bosses aren't creatures. They're emotions shaped like creatures. Grief with claws. Guilt with wings.
- The moth is the armor. The cartographer is underneath — a woman who mapped this place once, who built it from her own memories, and forgot.

### Narrative Delivery
- **Zero dialogue, zero text boxes** on first playthrough. The world tells the story through architecture and visual details.
- Room names (visible on the map screen) seem descriptive at first ("East Corridor", "Deep Shaft") but on second reading form a message.
- Collectible moth wings on walls = other explorers who didn't make it. Or: other versions of her.
- The ending is bittersweet and ambiguous. The light goes out. Was she real? Was any of it?
- **Void Stranger principle:** The game has a true layer underneath that rewards replaying with new eyes.

## Art Direction
- **Kenney 1-bit Platformer Pack** as tile/sprite source.
- Two-color palette per zone (foreground + background). Palette swaps sell mood shifts cheaply.
- Moth sprite: tiny, expressive silhouette. Wings are the readable shape. All animation is code-driven scale/rotation.
- On Phase Shift: palette **inverts**. For a few frames, the world looks wrong. The player sees the hidden layer.
- Rooms in the hidden layer have subtle wrongness — a tile that doesn't belong, a shape that's too familiar.
- Post-processing optional stretch goal (CRT scanlines, chromatic aberration, slight vignette).

## Core Player Fantasy
You are small and fragile, drawn forward by something you don't understand. Each ability makes you more capable, but also peels back a layer of what this place really is. By endgame you're fast and fluid and powerful — and you're starting to suspect the ruin knows you.

## Core Loop
1. **Explore** → discover rooms, find dead ends gated by missing abilities.
2. **Acquire** → find a new ability that changes your moveset.
3. **Backtrack** → revisit old areas; the ability reveals new paths + secrets.
4. **Fight** → enemies and optional bosses test mastery of your current kit.

## Locked Mechanics (Day 1 Moveset)
These are always available:
1. **Horizontal movement** — run left/right with acceleration/deceleration curves.
2. **Variable jump** — hold for higher, tap for short hop. Coyote time. Jump buffering.
3. **Basic melee** — short-range attack. Simple hitbox, brief hitstop on connect.

## Unlockable Abilities (Ordered by Acquisition)
Each gates exploration, changes combat feel, AND has a dual reading (moth / hidden):

| # | Ability | Movement Gate | Combat Use | Feel Hook | Moth Reading | Hidden Reading |
|---|---------|--------------|------------|-----------|-------------|----------------|
| 1 | **Wall Cling & Jump** | Vertical shafts, chimneys | Attack while clinging | Sticky pause on contact | Moth claws, natural | Desperate grip, holding on |
| 2 | **Dash** | Cross gaps, thin barriers | Dash-cancel for burst dmg | Speed blur, chromatic stretch | Flutter burst | Running from something |
| 3 | **Double Jump** | High platforms, open caverns | Air combo potential | Hang time squash, dust burst | Wingbeat | Refusing to fall |
| 4 | **Ground Pound** | Break cracked floors | AOE slam damage | Big shake, freeze frame, radial particles | Dive-bomb | Breaking through denial |
| 5 | **Phase Shift** | Pass through phase walls | Brief invuln frames | Palette invert, ghost trail, silhouette flicker | Becoming dust | Dissociating / remembering |

## Map Structure (5-Zone Sketch)
Small, dense, interconnected. Think Minit meets Hollow Knight.

```
        [SPIRE]
           |
[CAVES]--[HUB]--[FACTORY]
           |
        [DEPTHS]
```

- **Hub** — Central room cluster. Safe. Leads to all zones. Ability: none (starting area).
- **Caves** — Organic, vertical. Tight corridors. Ability: **Wall Cling** found here.
- **Factory** — Mechanical, horizontal. Conveyor hazards, gaps. Ability: **Dash** found here.
- **Spire** — Open, airy. Tall rooms, floating platforms. Ability: **Double Jump** found here.
- **Depths** — Dense, hostile. Cracked floors, phase walls. Abilities: **Ground Pound** + **Phase Shift** found here (late-game zone, two pickups).

## Room Authoring
ASCII grid format (carried from Squishroom). Extended glyph set:

| Glyph | Meaning |
|-------|---------|
| `#` | Solid wall |
| `.` | Empty / air |
| `S` | Player spawn |
| `D` | Door / room transition |
| `~` | Thin platform (pass-through from below) |
| `^` | Spikes / hazard |
| `=` | Cracked floor (Ground Pound breakable) |
| `%` | Phase wall (Phase Shift passable) |
| `*` | Ability pickup |
| `E` | Enemy spawn |
| `B` | Boss spawn |
| `?` | Secret / hidden item |

## Save System
- **Checkpoints** (benches / save terminals) in each zone.
- Serialize: player position, acquired abilities, broken walls, defeated bosses, discovered rooms.
- Death respawns at last checkpoint, enemies reset, breakable walls stay broken.

## Juice Budget (All Code-Driven)
| Event | Effects |
|-------|---------|
| Land | Squash sprite Y, dust particles, thud SFX |
| Jump | Stretch sprite Y, dust puff |
| Dash | Speed lines, motion blur scale, whoosh SFX |
| Melee hit | Hitstop (3-5 frames), screen shake, flash enemy white |
| Ground pound | Big shake, freeze frame, radial dust ring |
| Take damage | Screen flash, knockback, brief invuln blink |
| Ability pickup | Palette flash, zoom, triumphant SFX, freeze moment |
| Room transition | Quick fade or iris wipe |

## Bosses (Emotion Gates)
Each boss guards a zone's ability or a critical path. They're creatures on the surface, emotions underneath.

| Boss | Zone | Surface Reading | Hidden Reading |
|------|------|----------------|----------------|
| **The Clinger** | Caves | Giant spider-thing blocking the shaft | Fear — she clings to it because letting go means going deeper |
| **The Current** | Factory | Mechanical beast on a conveyor | Momentum — the feeling of being carried by routine, unable to stop |
| **The Updraft** | Spire | Winged predator in open air | Hope — terrifying because it might not last |
| **The Weight** | Depths (upper) | Armored thing that slams | Grief — heavy, immovable, must be broken through |
| **The Flicker** | Depths (final) | A moth. Another moth. You. | Memory — the final defense. The part of her that doesn't want to remember. |

The final boss is another moth, same size, same moveset. Mirror match. The hardest fight is against yourself.

## Scope Guardrails
In scope:
- 5 zones, ~25-35 rooms total
- 5 abilities
- 3-5 enemy types + 5 bosses
- Save/load
- Map screen (doubles as the cartographer's journal — room names visible)
- Hidden narrative layer (room names, visual tells, silhouette flicker)

Out of scope (for now):
- NPCs / dialogue / text boxes
- Currency / shops
- Multiple endings (one ending, two readings)
- Online features
- Controller rebinding UI (use defaults)

## Tech
- **Phaser 3** (already in use)
- **Vite** build
- **Vitest** for unit/integration tests
- **Kenney 1-Bit Platformer Pack** for art
- ASCII room format + room loader (evolved from Squishroom)

## Room Editor (Evolving)
The editor is a first-class tool, not an afterthought. It starts as an in-game debug mode and grows into a standalone browser editor.

### Phase 1: In-Game Debug Editor (build first)
- Toggle with a hotkey (e.g., backtick `` ` `` or `F1`).
- Pauses gameplay, shows grid overlay.
- **Glyph palette** — number keys or scrollwheel to select active glyph.
- **Paint** — click/drag to place tiles.
- **Erase** — right-click to clear to empty (`.`).
- **HUD** — shows current glyph, room ID, cursor coords.
- **Export** — press a key to dump ASCII to console + copy to clipboard.
- **Import** — paste ASCII from clipboard to load a room.
- Renders with actual Kenney tiles so you see what you get.

### Phase 2: Standalone Browser Editor (iterate toward)
- Dedicated route/scene (not inside gameplay).
- Full clickable glyph palette sidebar.
- Room list — create, rename, delete, reorder rooms.
- Door linking — click two doors to connect rooms.
- Visual mini-map of room connections.
- Export/import full world as JSON (array of ASCII rooms + door links).
- Undo/redo stack.
- Optional: playtest button that launches from the current room.

### Design Constraints
- ASCII is always the source of truth. The editor reads/writes ASCII.
- Room size is fixed at 20×15 tiles.
- Editor and game share the same tile renderer — no divergence.

## What's Next
1. Download & integrate Kenney 1-bit tileset.
2. Prototype: player movement (run + jump) with a single test room.
3. **In-game debug editor (Phase 1)** — get tile painting + ASCII export working early.
4. Implement melee attack.
5. Build hub + one zone with first ability pickup (Wall Cling).
6. Iterate feel: squash/stretch, particles, screen shake.
7. Evolve editor toward Phase 2 as room count grows.
