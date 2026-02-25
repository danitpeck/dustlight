# Ability Gate Graph

How abilities interconnect with zone access. This is the critical path — if this graph is solvable, the game is completable.

## Dependency Chain

```
START (Hub — "The Clearing")
  ├── Caves — "The Roots" (no ability needed to enter)
  │     └── ACQUIRE: Wall Cling  [guarded by The Clinger]
  │
  ├── Factory — "The Works" (no ability needed to enter)
  │     └── ACQUIRE: Dash  [requires Wall Cling to reach The Current]
  │
  ├── Spire — "The Updraft" (requires Dash to cross entry gap)
  │     └── ACQUIRE: Double Jump  [guarded by The Updraft boss]
  │
  └── Depths — "The Still" (requires Wall Cling + Double Jump to enter)
        ├── ACQUIRE: Ground Pound  [guarded by The Weight]
        └── ACQUIRE: Phase Shift   [requires Ground Pound, guarded by The Flicker]
              └── FINAL AREA: "The Light" (requires Phase Shift)
```

## Critical Path (Minimum Abilities)
1. The Clearing → The Roots → defeat The Clinger → get **Wall Cling**
2. The Clearing → The Works → use Wall Cling → defeat The Current → get **Dash**
3. The Clearing → The Updraft → use Dash → defeat The Updraft boss → get **Double Jump**
4. The Clearing → The Still → use Wall Cling + Double Jump → defeat The Weight → get **Ground Pound**
5. The Still → use Ground Pound → defeat The Flicker (mirror moth) → get **Phase Shift**
6. The Still → use Phase Shift → **The Light** (ending)

## Sequence Breaks (Designed)
Optional shortcuts for skilled players:
- The Works is *enterable* without Wall Cling, but the Dash pickup room requires it. A skilled player could explore early but can't finish it.
- The Updraft's lower rooms are reachable with Wall Cling + careful play. Double Jump opens the upper half.

## Backtrack Rewards
Each ability reveals secrets in previously visited zones — AND reveals hidden-layer details:

| Ability | Clearing Secrets | Roots Secrets | Works Secrets | Updraft Secrets |
|---------|-----------------|---------------|---------------|-----------------|
| Wall Cling | Upper ledge (moth wing) | — | Vent shortcut | Lower platform |
| Dash | Hidden room (wrong tiles — kitchen?) | Speed tunnel | — | Gap shortcut |
| Double Jump | Ceiling alcove (moth wing) | High cavern (garden tiles?) | Rooftop area | — |
| Ground Pound | Cracked basement (bedroom below?) | Deep cave (moth wing) | Machine room | — |
| Phase Shift | Ghost room (the porch) | Hidden grotto (moth wing) | Secret lab (moth wing) | Cloud room (the sky she remembers) |

*Moth wings are collectibles. Each is pinned to a wall — another moth that didn't make it. Or another version of her.*

---

# Room Map Sketch

## Zone Naming (Surface → Hidden)

| Zone ID | Surface Name | Hidden Reading |
|---------|-------------|----------------|
| H | The Clearing | The front yard. Where she started. |
| C | The Roots | The basement. Where things are buried. |
| F | The Works | The kitchen. Routine, mechanical, never stopping. |
| S | The Updraft | The attic. Open, airy, full of forgotten things. |
| D | The Still | The bedroom. The deepest room. Where she sleeps. |
| L | The Light | The porch. The light left on. |

## Room Count Budget

| Zone | Rooms | Notes |
|------|-------|-------|
| The Clearing (H) | 5 | Central, safe, tutorial-ish |
| The Roots (C) | 6 | Vertical focus, tight, organic |
| The Works (F) | 7 | Horizontal, mechanical hazards |
| The Updraft (S) | 6 | Open, floaty, tall rooms |
| The Still (D) | 8 | Dense, late-game, two pickups + final boss |
| The Light (L) | 1 | Ending room |
| **Total** | **33** | |

## The Clearing Layout (5 rooms)

```
       [H2: Canopy]
            |
[H3: West Path]--[H1: The Clearing]--[H4: East Path]
                       |
                  [H5: Below]
```

- H1: The Clearing — Spawn point. The moth arrives. Doors to all cardinal directions. Surface: a ruin entrance. Hidden: a front door.
- H2: Canopy — leads to The Updraft (Dash-gated gap). Surface: crumbling tower base. Hidden: stairs to the attic.
- H3: West Path — leads to The Roots. Surface: cave mouth. Hidden: basement stairs.
- H4: East Path — leads to The Works. Surface: metal doorway. Hidden: kitchen door.
- H5: Below — leads to The Still (Wall Cling + Double Jump gate). Contains cracked floor secret. Surface: deep shaft. Hidden: the hallway to the bedroom.

## Room Naming Convention
`{Zone Letter}{Number}` — e.g., `C1` = Roots room 1, `F3` = Works room 3.

Map screen displays a "proper" name for each room. These names seem functional on first playthrough but form a hidden message when read in critical-path order. (Message TBD — design this after rooms are built.)

## Room Size
Target: **20×15 tiles** per room (320×240 pixels at 16px tiles). Single screen, no scrolling within a room. Transitions between rooms via doors at edges.

This keeps the Squishroom single-screen DNA while building a connected world.
