# Unarmed STOCK match simulation — Design

Date: 2026-08-15  
Status: approved (pending user review of this written spec)

prefer effect native modules  
do not use vanilla js functions, use Effect.gen or Effect.fn  
make each module in the sim package an Effect Layer

Follow `.repos/effect/LLMS.md` and shipped `effect` / `@effect/*` `AGENTS.md`.

## Goal

Add `@gimped/sim` (`packages/sim`): a Brawlhalla **match simulation** library in Effect, ported from `brawlhalla-src/dump` (not invented physics).

First slice that can load a replay and be tested against recorded **results**:

- Scoring: **STOCK only**
- Roster: **1v1 and 2v2 only** (2 or 4 players, exactly two teams)
- Combat: **unarmed only** (no weapon pickups, no gadgets, no world item spawns)
- Pass/fail vs a replay: `results.duration` and `results.scores` match. Per-frame positions are not required.
- Rendering: a **stub** `Renderer` layer (`present` is a no-op). Real rendering is a later layer with the same interface.

The engine shape is the full match loop (clock, collision, fighters, combat, stock, items, renderer). Weapons and other modes are **stubs or `UnsupportedMatch`**, not omitted from the graph.

## Context (from `brawlhalla-src/dump`)

| Role | Dump |
| --- | --- |
| Game / match | `class_139` (`[Game.hx]`) |
| Entity interface | `class_122` (includes `OnHit`) |
| Entity | `class_123` |
| Fighter physics | `class_717` |
| Collision lines | `class_71` |
| Collision manager | `class_72` |
| Collision from Flash graphics | `class_73` (`[CollisionObject.hx]`) — **SWF path; out of scope** |
| LevelDesc / collision type names | `class_244` |
| Map load | `class_240` |
| Moving platforms | `MovingPlatform.as` |
| Volumes | `Volume.as` |
| Hurtboxes | `class_206` (`[HurtboxType.hx]`) |
| Powers | `PowerType.as` |
| Heroes | `HeroType.as` |
| Scoring | `ScoringType.as` (`STOCK`) |
| Replay write / 14-bit inputs | `class_314` (`method_4003(14, …)`, times in ms, 16ms frames) |
| Replay read | `class_313.method_2634` |
| Well512 | `@gimped/swz` `Well512` (same algorithm the game uses) |

Replay files do **not** contain physics state. `@gimped/replay` already decompiles setup, timed inputs, and results. Playback was out of scope there; this package is that playback, as simulation.

Input `time` is milliseconds. A row at `16` is the first 60 Hz frame. The 14-bit field is a **held mask**, recorded on change. A row with no `input` clears that entity’s mask.

## Packages

```
packages/
  sim/    # @gimped/sim
```

Library only — **no CLI**. Scaffold like `@gimped/replay`: Vite+, `vp test` / `vp build` / `vp check`, `effect` from catalog. Root `tsconfig.json` gets a reference.

Depends on: `effect`, `@gimped/common`, `@gimped/replay`, `@gimped/swz`.

Service ids: `"@gimped/sim/<Module>"`.

## Match eligibility

`Simulation.create` / `runReplay` succeed only when **all** of:

1. Rules resolve to **STOCK** via injected `Tables` (ScoringType name `Stock`). Synthetic tests inject that row (`scoringTypeId: 1` in current replay fixtures). Any other type is `UnsupportedMatch`. Do not hardcode the numeric id in `Simulation` beyond what `Tables` says.
2. Player count is **2** (1v1) or **4** (2v2).
3. Exactly **two** distinct `team` values. 2v2 is two players per team. 3v1, FFA, or one team is `UnsupportedMatch`.
4. `heroSlotCount === 1` (no strikeout).
5. Weapon and gadget world spawns are **off**. Treat `weaponSpawnRateId === 0` and `gadgetSpawnRateId === 0` as off (matches current replay JSON fixtures). If the dump uses a different “off” id, follow the dump and still reject anything that would spawn weapons or gadgets.

Callers who want weapons later replace `Items` and extend `Combat` / `Fighter`. They do not change the tick graph.

## Architecture

**State:** one mutable match owned by `Match` (Effect `Ref` or equivalent). Services read/write that match through small APIs. Do not copy an immutable world every tick. This tracks AS3 object mutation (`class_717`, `class_123`, collision lists).

**Numbers:** IEEE-754 `Number`, same as AS3 `Number`. `Rng` is Well512 so a later items layer can share the stream. Unarmed STOCK still seeds it at match start. Seed procedure is copied from the dump at implementation time; tests that do not need RNG may `initState` a fixed value.

### Services

| Service | Responsibility | Default dependencies |
| --- | --- | --- |
| `Match` | Mutable match: fighters, collision geometry, clock, scores, snapshot | — |
| `Clock` | Tick index; advance 16ms per step at `gameSpeed` 100. Other `gameSpeed` values follow the dump. | `Match` |
| `Rng` | Well512 `initState` / `next`. Default layer uses `@gimped/swz` `Well512`. | — |
| `Collision` | Line/volume queries (hard, soft, ice, …). Geometry comes from `Match` / `LevelCollision`. | `Match` |
| `World` | Blastzones, respawns, moving platforms, volumes, stage step | `Match`, `Collision` |
| `Fighter` | Unarmed kinematics: walk, jump, dodge, gravity, ground/wall | `Match`, `Collision`, `Input` |
| `Input` | Apply replay rows with `time <= now`; hold 14-bit masks | `Match` |
| `Combat` | Unarmed powers, hurt/hitboxes, damage, stun, impulse (`OnHit`) | `Match`, `Fighter`, `Rng`, `Tables` |
| `Stock` | Lives, blastzone KO, respawn, KO score, match end | `Match`, `World` |
| `Items` | **Stub:** no weapons, no gadgets, no spawns | `Match` |
| `Renderer` | **Stub:** `present(snapshot)` succeeds and does nothing | — |
| `Tables` | Injected hero / hurtbox / unarmed power / level / scoring tables | — |
| `LevelCollision` | Injected stage lines, volumes, spawns, blastzones | — |
| `GameData` | Optional: SWZ + LevelDesc **XML** → `Tables` + `LevelCollision` | `FileSystem`, `Path`, `@gimped/swz` |
| `ReplayLoader` | Path or bytes → `Replay` via `@gimped/replay` | `FileSystem`, `@gimped/replay` Envelope/Codec |
| `Simulation` | `create`, `step`, `runToEnd`, `runReplay` → `{ duration, scores }` | physics services below |

`Simulation.Default` provides: `Match`, `Clock`, `Rng`, `Collision`, `World`, `Fighter`, `Input`, `Combat`, `Stock`, `Items` stub, `Renderer` stub. It does **not** require `FileSystem`. Tests `Layer.succeed` synthetic `Tables` and `LevelCollision` (a box stage).

`GameData` and `ReplayLoader` are extra layers for disk. They never leak into `Collision` / `World` / tick.

Chunk 5/7 `events` and `otherEvents` are **ignored** in this slice.

### Public API (shape)

```ts
Simulation.create(setup)      // Replay-like setup + injected tables/collision
Simulation.step()             // one frame
Simulation.runToEnd()         // step until Stock ends the match
Simulation.runReplay(replay)  // create + runToEnd → { duration, scores }
Simulation.snapshot()         // renderer/tests
```

`runReplay` does **not** fail when results differ from the file. It returns simulated `{ duration, scores }`. Tests assert equality. `results.endValue` is filled when the dump mapping is known; it is not the pass/fail bar.

`results.duration` uses the same millisecond unit as input `time`. `rules.duration` is the configured limit from chunk 4. STOCK end conditions follow the dump: last team with lives; plus a time limit if the client applies `rules.duration` to STOCK.

## Data flow and tick

**Load**

1. `ReplayLoader` → `Replay` (or caller already has one).
2. Eligibility checks → `UnsupportedMatch` or continue.
3. `Tables` + `LevelCollision` from caller, or `GameData.load`.
4. Missing hero / DEFAULT hurtbox / unarmed powers / level → `MissingTables`. No usable collision for `level.id` → `MissingCollision`.
5. `Match` created: seed `Rng`, clock 0, spawn fighters unarmed on respawns, stocks from `startingLives` / handicap.

**`Simulation.step` order**

1. `Clock.advance` one frame
2. `Input.apply`
3. `Items.step` (no-op stub)
4. `World.step` (moving platforms, volumes)
5. `Fighter.step` (unarmed movement + `Collision`)
6. `Combat.step` (unarmed powers, boxes, `OnHit`)
7. `Stock.step` (blastzone KO, lives, respawn, KO score, match end)
8. `Renderer.present(snapshot)` (stub)

14-bit layout and `gameSpeed` scaling are copied from the dump at implementation time, not invented here.

**`GameData`**

Reads a native SWZ directory or `.swz` (same idea as `replay --data`). Parses XML tables needed for unarmed STOCK: HeroType, HurtboxType, PowerType (unarmed kit only), LevelType, ScoringType, LevelDesc.

Collision geometry is **XML only**. If a map’s lines exist only as Flash graphics (`CollisionObject.hx` / SWF), that level is `MissingCollision`. SWF extraction is a different project. Synthetic tests inject lines so CI needs no install.

## Errors

Replay/SWZ/IO tags stay in those packages. Sim adds:

| Tag | When |
| --- | --- |
| `UnsupportedMatch` | Not STOCK; player count not 2 or 4; not valid 1v1/2v2 teams; `heroSlotCount !== 1`; weapon/gadget spawns not off |
| `MissingTables` | Required table row missing (hero, hurtbox, unarmed power, level, scoring) |
| `MissingCollision` | No XML collision for `level.id` |
| `SimulationFault` | Tick invariant broken (NaN, input `entityId` with no fighter) |

`IoError` / `MalformedJson` / `InvalidReplay` / `ChecksumMismatch` / SWZ errors propagate unchanged from loaders.

## Style

- `Effect.fn("Service.method")` + `Effect.gen`; no vanilla Promise/fs helpers as the public style
- `Layer.effect` / `Layer.sync` returning `Service.of({ … })`
- IO only in `GameData` / `ReplayLoader` via Effect `FileSystem` / `Path` (no `node:fs`)
- Domain values: Effect `Schema` where they cross IO or tests (snapshot, results)
- Physics internals may be mutable classes/records behind the service API (port of AS3)

## Testing

`@effect/vitest` `it.effect`. `TestLive` = `Simulation.Default` plus synthetic `Tables` / `LevelCollision`. Node services only for `GameData` / `ReplayLoader` tests.

**Per layer**

- `UnsupportedMatch`: TIMED/soccer, 3 players, `heroSlotCount > 1`, weapon/gadget spawn on, FFA teams
- `Clock`: +16ms per step at `gameSpeed` 100
- `Collision`: hard floor; soft platform from above; miss from below
- `Fighter`: gravity, land, walk; never armed
- `Input`: mask at `time`, held until next row; omitted `input` clears
- `Stock`: blastzone KO → life −1, KO credited, respawn; last team alive ends
- `Items` stub: no entities added
- `Renderer` stub: `present` called, no throw
- `GameData`: tiny XML fixtures → tables + LevelDesc lines; bad path → `IoError` / `MissingTables` / `MissingCollision`

**Integration**

- Injected 1v1 box stage: walk off blastzone → deterministic `{ duration, scores }`
- Injected 2v2 (two entities per team) → same
- `runReplay` on an in-memory synthetic `Replay` (same style as `@gimped/replay` tests)

**Real `.replay` goldens** are optional. If an unarmed STOCK fixture exists, assert duration and scores. CI must pass without a live install or copyrighted replays. This spec does **not** add real `.replay` files.

## Out of scope

- Renderer beyond no-op `present`
- Weapons, gadgets, item spawns (`Items` stub only)
- TIMED and every other `ScoringType`
- FFA, 3 players, strikeout (`heroSlotCount > 1`)
- SWF / map-art collision extraction
- CLI
- Frame-perfect position goldens
- Byte-identical zlib/float vs Flash except as needed for STOCK results
- Using replay `events` / `otherEvents`

## Success criteria

1. `@gimped/sim` exists; every module in the service table is a `Context.Service` + `layer`
2. `Simulation.Default` runs STOCK 1v1/2v2 unarmed with injected tables and collision
3. Results mismatch is a test failure, not a tagged error
4. `vp check --fix` and `vp test` pass for the package; workspace `tsconfig` references it

## Implementation note

One spec, sequenced implementation (not separate products): scaffold + eligibility → clock/rng/match → collision/world → fighter kinematics → input → unarmed combat → stock → loaders → synthetic replay tests. Combat is required for real replay goldens; kinematics + stock KO is enough for the blastzone integration test.
