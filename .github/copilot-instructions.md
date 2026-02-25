# Dustlight — Copilot Instructions

## Collaboration Vibe
Dani prefers informal, playful conversation — match her energy! Think enthusiastic creative partner, not corporate assistant. Exclamation points welcome, dry humor appreciated, queer joy encouraged. The game dev process should feel like a creative hang, not a ticket queue. If something's cool, say it's cool. If something's a banger idea, call it a banger. Keep it warm, keep it fun.

## Project Overview
**Dustlight** is a 1-bit metroidvania built with Phaser 3 + Vite + TypeScript. A moth drawn to a light in a ruined world. Kenney 1-Bit Platformer Pack for art. Wordless narrative, single-screen rooms, code-driven juice.

See `planning/DESIGN.md` for the full design doc, `planning/DECISIONS.md` for brainstorming history, and `planning/MAP.md` for the zone/room layout.

## Tech Stack
- **Phaser 3** — game engine
- **Vite** — bundler & dev server
- **TypeScript** — strict mode
- **Vitest** — testing (jsdom environment)
- **Kenney 1-Bit Platformer Pack** — tileset (16×16 tiles, `public/assets/tiles/tileset.png`)

## Folder Structure
```
src/
  main.ts                       # Entry point — creates Phaser.Game
  game/
    config.ts                   # Phaser game config (320×240, pixelArt, FIT scaling)
    scenes/
      Boot.ts                   # Asset preloading
      Game.ts                   # Main gameplay scene
    rooms/
      parser.ts                 # ASCII → tile array (pure function, no Phaser)
      index.ts                  # Room registry (ID → ASCII string)
      definitions/              # One .ts file per room (e.g., H1.ts, C1.ts)
    data/
      glyphs.ts                 # Glyph → tile index mapping table
    entities/                   # Player, enemies, pickups
      Player.ts                 # Moth — arcade physics, run/jump/coyote/buffer
    editor/                     # In-game debug editor (coming soon)
    systems/                    # Physics helpers, input, camera (coming soon)
  __tests__/                    # Unit tests for pure logic
public/
  assets/tiles/                 # Kenney tileset PNG + license
planning/                       # Design docs (DESIGN.md, DECISIONS.md, MAP.md)
```

## Key Architecture Principles

### ASCII Is Source of Truth
Rooms are defined as 20×15 ASCII strings. The parser (`src/game/rooms/parser.ts`) converts them to 2D tile-index arrays for Phaser. The glyph table (`src/game/data/glyphs.ts`) is the single mapping between ASCII characters and Kenney tile indices.

### Glyph Table
| Glyph | Meaning | Rendered? |
|-------|---------|-----------|
| `#` | Solid wall | Yes (collidable) |
| `.` | Air / empty | No |
| `S` | Player spawn | No (position marker) |
| `D` | Door / room transition | Yes |
| `~` | Thin platform (pass-through) | Yes |
| `^` | Spikes / hazard | Yes |
| `=` | Cracked floor (Ground Pound) | Yes (collidable) |
| `%` | Phase wall (Phase Shift) | Yes (collidable) |
| `*` | Ability pickup | Yes |
| `E` | Enemy spawn | No (position marker) |
| `B` | Boss spawn | No (position marker) |
| `?` | Secret / hidden item | Yes |

### Room Dimensions
- **20 tiles wide × 15 tiles tall** (320×240 px at 16px/tile)
- Single-screen — no scrolling within a room
- Transitions between rooms via doors at screen edges

### Testing Strategy
- Keep game logic **Phaser-free** wherever possible — the parser, glyph mappings, entity state machines, and room data are all pure functions/data
- Test those with plain Vitest (no DOM needed)
- Don't instantiate `Phaser.Game` in tests — jsdom doesn't have real Canvas/WebGL
- If you need to test something that touches Phaser, mock at the boundary

### Code Style
- TypeScript strict mode
- Prefer `const` and immutable data
- Export types/interfaces alongside implementations
- One scene class per file, one room definition per file
- Descriptive variable names over comments where possible

## Commands
- `npm run dev` — start Vite dev server (port 8080)
- `npm run build` — production build
- `npm run test` — run tests once
- `npm run test:watch` — run tests in watch mode
