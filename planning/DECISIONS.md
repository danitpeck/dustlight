# Dustlight — Conversation Log & Design Decisions

Captured from the initial brainstorming session (Feb 24, 2026).

## Project Name
**Dustlight** — verified clear on Steam (0 results as of Feb 2026). "Mote" was also considered but has SEO concerns (common word, adjacent titles like MoteMancer, Lumote).

## Genre & Inspirations
Decided on **1-bit metroidvania**. Key influences cited by Danny:
- **Cave Story** — tight platforming, simple-but-emotional story, solo-dev energy, "cute but sad" tone
- **Momodora** — small melancholy world, determined protagonist, atmospheric
- **Aquaria** — movement-as-identity, the world as extension of the protagonist
- **Void Stranger** — minimalist surface hiding labyrinthine depth, the game lies about what it is, rewards replaying with new eyes
- **Hollow Knight** — dense interconnected world, ability-gated exploration
- **Minit** — proof that 1-bit can carry a full adventure
- **Celeste** — movement metaphor IS the story

## Art Direction Decision
- **Kenney 1-bit Platformer Pack** (https://kenney.nl/assets/1-bit-platformer-pack) as the tile/sprite source.
- Danny explicitly wanted minimalist design so that **code drives the feel** — squash/stretch, screen shake, particles, palette swaps, hitstop. No dependency on hand-drawn art for juice.
- This was chosen over the Squishroom render-skin approach which required more visual polish.

## Protagonist Evolution
The protagonist went through several iterations:

### Rejected/Absorbed Ideas
1. **The Ghost** — spirit learning to inhabit the physical world. Folded into Phase Shift mechanic.
2. **The Escaped Experiment** — lab creature with dormant augmentations. Too generic.
3. **The Courier** — small creature delivering something through a ruin. Low stakes.
4. **The Last Signal** — robot responding to distress beacon. Most practical but least original.
5. **The Mold/Growth** — organism spreading through a structure. Weird, memorable, carries Squishroom DNA. Shelved but could inspire enemy design.
6. **The Witch's Familiar** — cat/crow/wisp cursed into animal form. Cozy-creepy. Twist absorbed into final concept.
7. **The Mechanic** — human engineer, ship crashed. Grounded, dry humor. Too generic alone.
8. **The Dancer** — spirit of movement, feminine silhouette. Abstract. Movement metaphor absorbed into final concept.
9. **The Cartographer** — human woman mapping an unmapped ruin. Grounded motivation. Danny liked it but said "too generic" alone.
10. **The Echo** — a copy/memory of someone who explored before and died. Dark, existential. Strongest standalone high-concept.

### Final Concept: The Moth Who Maps Herself (Direction H)
Combined the best of D (Cartographer), G (Moth), and E (Echo):
- **Surface layer:** A moth drawn to a light in a ruined world. Wordless, charming, accessible.
- **Hidden layer:** The moth is a woman who built this ruin from her own memories and forgot. The ruin is her house. Each zone is a room in that house.
- **Phase Shift** flickers the silhouette — moth becomes woman for frames.
- **Room architecture** contains domestic wrongness — kitchen tiles in the caves, a bedroom in the depths.
- **Bosses are emotions:** Fear, Momentum, Hope, Grief, Memory.
- **Final boss is a mirror moth** — another version of her.
- **First playthrough:** cute moth adventure, satisfying platformer, bittersweet ending.
- **Second playthrough:** recontextualizes everything. Void Stranger principle.

Danny's key constraint: **female protagonist, human or non-human.** The moth satisfies both (non-human surface, human underneath).

## Map Editor Decision
Danny has had friction with Tiled in the past. Three options were discussed:

- **Option A: In-browser tile painter** — most fun, most work
- **Option B: Tiled integration** — least work, but external dependency + annoying ASCII roundtrip
- **Option C: In-game debug editor** — fastest iteration loop, medium effort

**Decision: Start with C, iterate toward A.** The editor is a first-class tool. Phase 1 is an in-game debug toggle (hotkey, grid overlay, click-to-paint, ASCII export). Phase 2 evolves into a standalone browser editor with room list, door linking, undo/redo, etc. ASCII stays source of truth throughout.

## Room Design
- **Single-screen rooms** (20×15 tiles at 16px = 320×240). No scrolling. Carried from Squishroom DNA.
- Room transitions via doors at screen edges.
- 33 rooms across 5 zones + 1 ending room.
- ASCII grid authoring with extended glyph set.

## Zone Theming (Surface → Hidden)
| Zone | Surface Name | Hidden (the house) |
|------|--------------|--------------------|
| Hub | The Clearing | The front yard |
| Caves | The Roots | The basement |
| Factory | The Works | The kitchen |
| Spire | The Updraft | The attic |
| Depths | The Still | The bedroom |
| Ending | The Light | The porch |

## Ability Dual Readings
Each ability reads differently on the surface vs. hidden layer:
- **Wall Cling:** moth claws / desperate grip
- **Dash:** flutter burst / running from something
- **Double Jump:** wingbeat / refusing to fall
- **Ground Pound:** dive-bomb / breaking through denial
- **Phase Shift:** becoming dust / dissociating, remembering

## Tech Stack
- Phaser 3
- Vite
- Vitest
- Kenney 1-Bit Platformer Pack
- ASCII room format (evolved from Squishroom)

## Build Order (agreed)
1. Download & integrate Kenney 1-bit tileset
2. Prototype: player movement (run + jump) with a single test room
3. In-game debug editor (Phase 1)
4. Implement melee attack
5. Build hub + one zone with first ability pickup (Wall Cling)
6. Iterate feel: squash/stretch, particles, screen shake
7. Evolve editor toward Phase 2

## Vibes & Tone
- Momodora's quiet determination
- Cave Story's "cute but sad"
- Void Stranger's hidden depth
- Aquaria's "the world IS the protagonist"
- Wordless — zero dialogue, zero text boxes on first playthrough
- Bittersweet and ambiguous ending
- "The moth is the armor. The cartographer is underneath."

## Level Design Learnings (Feb 25, 2026)
Discovered through playtesting H1–H3 with actual jump physics:

- **Max jump height is ~3 tiles** with a perfect hold (JUMP_VEL=-280, gravity=800). That's the CEILING — don't design for it as the base case.
- **Comfortable jump: 2 tiles up, 4 tiles across.** That's what feels good.
- **Platform-to-platform must account for starting surface.** Jumping from a thin platform (~~) is different from jumping off the floor — the moth's feet position matters.
- **Floating hazards look wrong.** Spikes should grow from walls/floors, not hover in air. Ground them.
- **H1 is the welcome mat, not the obstacle course.** Keep starter rooms flat and safe. Tricky platforming belongs in rooms 2+.
- **Geometry teaches direction.** Stepping ledges toward a door naturally guide the player without words — very on-brand for wordless narrative.
- **Doors are invisible.** Player walks into void and transitions. No visible door tile — the D glyph maps to -1 (air).
