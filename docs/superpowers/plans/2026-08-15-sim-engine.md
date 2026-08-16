# Unarmed STOCK Match Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `@gimped/sim` that simulates unarmed STOCK 1v1/2v2 matches as Effect layers, can load a replay, and returns `{ duration, scores }` for tests to compare against recorded results.

**Architecture:** Mutable `Match` state (Ref) plus one `Context.Service` per engine piece. `Simulation.step` runs Clock → Input → Items → World → Fighter → Combat → Stock → Renderer. Core tick is injectable (synthetic `Tables` + `LevelCollision`). `GameData` / `ReplayLoader` are extra file layers. Physics is ported from `brawlhalla-src/dump`, not invented.

**Tech Stack:** Effect `4.0.0-rc.109` (catalog), `@effect/vitest`, `@effect/platform-node`, Vite+ (`vp test` / `vp check` / `vp build`), `@gimped/common`, `@gimped/replay`, `@gimped/swz`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-15-sim-engine-design.md`
- Follow `.repos/effect/LLMS.md` and shipped `effect` `AGENTS.md`: `Effect.fn("Name")` + `Effect.gen`; services via `Context.Service` + `static layer`; errors via `Schema.TaggedError`
- Service ids: `"@gimped/sim/<Module>"`
- No `node:fs` (use `FileSystem` / `Path`)
- No CLI
- STOCK 1v1/2v2 unarmed only; other modes → `UnsupportedMatch`
- `weaponSpawnRateId === 0` and `gadgetSpawnRateId === 0` means spawns off
- STOCK identity comes from `Tables` (`name === "Stock"`), not a hardcoded id in `Simulation`
- Y axis is Flash / dump: **y increases downward** (`class_71.Top` = min y)
- Frame length: **16 ms** at `gameSpeed` 100 (`class_50.var_5907`)
- Input lower nibble from `class_288` (`param2 & 15`): `up=1`, `down=2`, `left=4`, `right=8`
- HardCollision type id `1`, SoftCollision type id `2` (`class_42` `method_2436`)
- Results mismatch is a test failure, never a tagged error
- No copyrighted `.replay` files; synthetic only
- Prefer TDD: failing test → implement → pass → commit per task
- After code changes: `vp check --fix` and `vp test` in `packages/sim`
- Do not invent gravity, walk speed, or impulse formulas: copy numbers from `brawlhalla-src/dump` (`class_123`, `class_717`, `class_72`, `PowerType.as`). Tests assert qualitative behavior (lands, walks +x, KO) so they stay valid if the copied constant is exact.

## File structure

| File | Role |
| --- | --- |
| `packages/sim/package.json` | `@gimped/sim` |
| `packages/sim/tsconfig.json` | Same as `packages/replay/tsconfig.json` |
| `packages/sim/vite.config.ts` | Same as `packages/replay/vite.config.ts` |
| `packages/sim/src/errors.ts` | `UnsupportedMatch`, `MissingTables`, `MissingCollision`, `SimulationFault` |
| `packages/sim/src/domain.ts` | Lines, volumes, fighters, match state, snapshot, results, input bits |
| `packages/sim/src/fixtures.ts` | Synthetic STOCK tables, box stage, 1v1/2v2 replays |
| `packages/sim/src/Tables.ts` | Injected game tables service |
| `packages/sim/src/LevelCollision.ts` | Injected stage geometry service |
| `packages/sim/src/MatchRules.ts` | Eligibility |
| `packages/sim/src/Match.ts` | Mutable match Ref |
| `packages/sim/src/Clock.ts` | 16 ms ticks |
| `packages/sim/src/Rng.ts` | Well512 wrapper |
| `packages/sim/src/Collision.ts` | Line queries |
| `packages/sim/src/World.ts` | Blastzones, spawns, platform step |
| `packages/sim/src/Input.ts` | Held 14-bit masks vs time |
| `packages/sim/src/Fighter.ts` | Unarmed kinematics |
| `packages/sim/src/Combat.ts` | Unarmed hit/hurt, OnHit |
| `packages/sim/src/Stock.ts` | Lives, KO, scores, match end |
| `packages/sim/src/Items.ts` | Stub no-op |
| `packages/sim/src/Renderer.ts` | Stub `present` |
| `packages/sim/src/Simulation.ts` | `create` / `step` / `runToEnd` / `runReplay` |
| `packages/sim/src/GameData.ts` | SWZ / XML → tables + LevelDesc |
| `packages/sim/src/ReplayLoader.ts` | Bytes/path → `Replay` |
| `packages/sim/src/layers.ts` | `Simulation.Default`, `TestLive` |
| `packages/sim/src/index.ts` | Re-exports |
| `tsconfig.json` | Add `packages/sim` reference |

---

### Task 1: Scaffold `@gimped/sim`

**Files:**

- Create: `packages/sim/package.json`
- Create: `packages/sim/tsconfig.json`
- Create: `packages/sim/vite.config.ts`
- Create: `packages/sim/src/errors.ts`
- Create: `packages/sim/src/errors.test.ts`
- Create: `packages/sim/src/index.ts`
- Modify: `tsconfig.json` — add `{ "path": "./packages/sim" }` to `references`

**Interfaces:**

- Produces: tagged errors `UnsupportedMatch`, `MissingTables`, `MissingCollision`, `SimulationFault`

- [ ] **Step 1: Write package files and the failing test**

`packages/sim/package.json`:

```json
{
  "name": "@gimped/sim",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vp test",
    "build": "vp build",
    "check": "vp check"
  },
  "dependencies": {
    "@gimped/common": "workspace:*",
    "@gimped/replay": "workspace:*",
    "@gimped/swz": "workspace:*",
    "effect": "catalog:"
  },
  "devDependencies": {
    "@effect/platform-node": "catalog:",
    "@effect/vitest": "catalog:",
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vite-plus": "catalog:",
    "vitest": "catalog:"
  }
}
```

Copy `packages/replay/tsconfig.json` → `packages/sim/tsconfig.json`.

Copy `packages/replay/vite.config.ts` → `packages/sim/vite.config.ts`.

`packages/sim/src/errors.test.ts`:

```ts
import { expect, it } from "@effect/vitest";
import { MissingCollision, MissingTables, SimulationFault, UnsupportedMatch } from "./errors.ts";

it("constructs tagged sim errors", () => {
  expect(new UnsupportedMatch({ reason: "not stock" })._tag).toBe("UnsupportedMatch");
  expect(new MissingTables({ reason: "hero 3" })._tag).toBe("MissingTables");
  expect(new MissingCollision({ levelId: 12 })._tag).toBe("MissingCollision");
  expect(new SimulationFault({ reason: "NaN" })._tag).toBe("SimulationFault");
});
```

`packages/sim/src/index.ts`:

```ts
export * from "./errors.ts";
```

Add the root tsconfig reference for `./packages/sim`.

- [ ] **Step 2: Run test to verify it fails**

From repo root:

```bash
vp i
cd packages/sim
vp test
```

Expected: FAIL — `./errors.ts` cannot be resolved or exports are missing.

- [ ] **Step 3: Write `errors.ts`**

```ts
import { Schema } from "effect";

export class UnsupportedMatch extends Schema.TaggedError<UnsupportedMatch>()("UnsupportedMatch", {
  reason: Schema.String,
}) {}

export class MissingTables extends Schema.TaggedError<MissingTables>()("MissingTables", {
  reason: Schema.String,
}) {}

export class MissingCollision extends Schema.TaggedError<MissingCollision>()("MissingCollision", {
  levelId: Schema.Number,
}) {}

export class SimulationFault extends Schema.TaggedError<SimulationFault>()("SimulationFault", {
  reason: Schema.String,
}) {}
```

- [ ] **Step 4: Run tests and check**

```bash
vp test
vp check --fix
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sim tsconfig.json
git commit -m "feat(sim): scaffold package and tagged errors"
```

---

### Task 2: Domain, fixtures, Tables, LevelCollision

**Files:**

- Create: `packages/sim/src/domain.ts`
- Create: `packages/sim/src/fixtures.ts`
- Create: `packages/sim/src/Tables.ts`
- Create: `packages/sim/src/LevelCollision.ts`
- Create: `packages/sim/src/Tables.test.ts`
- Modify: `packages/sim/src/index.ts`

**Interfaces:**

- Produces:
  - `InputBits = { up: 1, down: 2, left: 4, right: 8 }`
  - `CollisionLine { startX, startY, endX, endY, type }` (`type`: 1 hard, 2 soft)
  - `Spawn { x, y, team?: number }`
  - `CameraBounds { x, y, w, h }`
  - `FighterState` mutable: `entityId`, `team`, `x`, `y`, `vx`, `vy`, `grounded`, `facingLeft`, `lives`, `damage`, `score`, `input`, `hurtW`, `hurtH`, `stun`, `ko`, `lastHitBy`
  - `MatchState` mutable: `timeMs`, `gameSpeed`, `ended`, `fighters`, `lines`, `spawns`, `bounds`, `startingLives`
  - `SimResults { duration, scores, endValue }`
  - `ScoringRow { id, name }`, `HeroRow { id, name }`, `HurtboxRow { name, width, height }`, `PowerRow { id, name }`
  - `TablesData { scoring, heroes, hurtboxes, powers, levels }` maps by numeric id (hurtboxes by name)
  - `LevelCollisionData { levelId, lines, spawns, bounds }`
  - `Tables.make(data)` / `LevelCollision.make(data)` layers
  - `stockTables()`, `boxStage()`, `player()`, `replay1v1()`, `replay2v2()` in fixtures

- [ ] **Step 1: Write the failing test**

`packages/sim/src/Tables.test.ts`:

```ts
import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import { boxStage, stockTables } from "./fixtures.ts";
import { LevelCollision } from "./LevelCollision.ts";
import { Tables } from "./Tables.ts";

const Live = Tables.make(stockTables()).pipe(Layer.provideMerge(LevelCollision.make(boxStage())));

layer(Live)("injected tables and stage", (it) => {
  it.effect("exposes STOCK and a hard floor", () =>
    Effect.gen(function* () {
      const tables = yield* Tables;
      const level = yield* LevelCollision;
      expect(tables.scoring.get(1)?.name).toBe("Stock");
      expect(level.lines.some((line) => line.type === 1 && line.startY === 0)).toBe(true);
    }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
vp test
```

Expected: FAIL — modules missing.

- [ ] **Step 3: Write domain, fixtures, services**

`domain.ts` — export the types listed above. `FighterState.input` is `number | undefined` (held 14-bit mask). `hurtW`/`hurtH` default 50×80 (DEFAULT hurtbox placeholder until GameData). `facingLeft` default false.

`fixtures.ts`:

```ts
import type { Replay } from "@gimped/replay";
import type { LevelCollisionData, TablesData } from "./domain.ts";

export const stockTables = (): TablesData => ({
  scoring: new Map([[1, { id: 1, name: "Stock" }]]),
  heroes: new Map([[3, { id: 3, name: "Bodvar" }]]),
  hurtboxes: new Map([["DEFAULT", { name: "DEFAULT", width: 50, height: 80 }]]),
  powers: new Map(),
  levels: new Map([[12, { id: 12, name: "Box" }]]),
});

export const boxStage = (): LevelCollisionData => ({
  levelId: 12,
  lines: [{ startX: -200, startY: 0, endX: 200, endY: 0, type: 1 }],
  spawns: [
    { x: -80, y: -50, team: 1 },
    { x: 80, y: -50, team: 2 },
    { x: -40, y: -50, team: 1 },
    { x: 40, y: -50, team: 2 },
  ],
  bounds: { x: -400, y: -200, w: 800, h: 600 },
});

export const cosmetics = () => ({
  spawnBotId: 0,
  companionId: 0,
  field2463: 0,
  field8849: 0,
  field11747: 0,
  tauntIds: [0, 0, 0, 0, 0, 0, 0, 0] as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ],
  field2378: 0,
  field15047: 0,
  bitfield: [] as number[],
  field4335: 0,
  field3535: 0,
  field6575: 0,
});

export const player = (entityId: number, team: number, name: string): Replay["players"][number] => ({
  entityId,
  team,
  name,
  colorSchemeId: 0,
  heroes: [{ heroId: 3, costumeId: 0, field3172: 0, weaponSkinId: 0 }],
  cosmetics: cosmetics(),
  hidden: false,
});

const rules = () => ({
  flags: 0,
  maxPlayers: 4,
  duration: 480,
  roundDuration: 0,
  startingLives: 3,
  scoringTypeId: 1,
  scoreToWin: 0,
  gameSpeed: 100,
  damageRatio: 100,
  levelSetId: 0,
  itemSpawnRuleSetId: 0,
  weaponSpawnRateId: 0,
  gadgetSpawnRateId: 0,
  unknown12964: 0,
  variation: 0,
});

export const replay1v1 = (): Replay => ({
  replayVersion: 268,
  game: { id: 1, nameId: 0, customOnline: false },
  rules: rules(),
  level: { id: 12 },
  heroSlotCount: 1,
  players: [player(1, 1, "A"), player(2, 2, "B")],
  results: { duration: 0, scores: [], endValue: 1 },
  inputs: [],
  events: [],
  otherEvents: [],
});

export const replay2v2 = (): Replay => ({
  ...replay1v1(),
  players: [player(1, 1, "A"), player(2, 1, "B"), player(3, 2, "C"), player(4, 2, "D")],
});
```

`Tables.ts`:

```ts
import { Context, Layer } from "effect";
import type { TablesData } from "./domain.ts";

export class Tables extends Context.Service<Tables, TablesData>()("@gimped/sim/Tables") {
  static readonly make = (data: TablesData) => Layer.succeed(Tables, Tables.of(data));
}
```

`LevelCollision.ts` — same pattern with `LevelCollisionData` and id `"@gimped/sim/LevelCollision"`.

Export new modules from `index.ts`.

- [ ] **Step 4: Run test to verify it passes**

```bash
vp test
vp check --fix
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src
git commit -m "feat(sim): inject tables and level collision"
```

---

### Task 3: MatchRules eligibility

**Files:**

- Create: `packages/sim/src/MatchRules.ts`
- Create: `packages/sim/src/MatchRules.test.ts`
- Modify: `packages/sim/src/index.ts`

**Interfaces:**

- Consumes: `Tables`, `Replay` from `@gimped/replay`, fixtures
- Produces: `MatchRules.check(replay: Replay): Effect<void, UnsupportedMatch>`

- [ ] **Step 1: Write the failing test**

Use `layer(Tables.make(stockTables()))`. Cases:

- `replay1v1()` succeeds
- `replay2v2()` succeeds
- `scoringTypeId: 2` → `UnsupportedMatch` (tables have no Stock at 2)
- 3 players → `UnsupportedMatch`
- `heroSlotCount: 2` → `UnsupportedMatch`
- `weaponSpawnRateId: 1` → `UnsupportedMatch`
- `gadgetSpawnRateId: 1` → `UnsupportedMatch`
- four players all `team: 1` → `UnsupportedMatch`
- four players teams 1,1,1,2 (3v1) → `UnsupportedMatch`

```ts
import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import { UnsupportedMatch } from "./errors.ts";
import { player, replay1v1, replay2v2, stockTables } from "./fixtures.ts";
import { MatchRules } from "./MatchRules.ts";
import { Tables } from "./Tables.ts";

const Live = MatchRules.layer.pipe(Layer.provide(Tables.make(stockTables())));

layer(Live)("MatchRules", (it) => {
  it.effect("accepts STOCK 1v1 and 2v2", () =>
    Effect.gen(function* () {
      const rules = yield* MatchRules;
      yield* rules.check(replay1v1());
      yield* rules.check(replay2v2());
    }),
  );

  it.effect("rejects timed, odd rosters, strikeout, and spawns", () =>
    Effect.gen(function* () {
      const rules = yield* MatchRules;
      const fail = (replay: ReturnType<typeof replay1v1>) =>
        rules.check(replay).pipe(Effect.flip, Effect.map((e) => e._tag));

      expect(yield* fail({ ...replay1v1(), rules: { ...replay1v1().rules, scoringTypeId: 2 } })).toBe(
        "UnsupportedMatch",
      );
      expect(
        yield* fail({ ...replay1v1(), players: [...replay1v1().players, player(3, 1, "C")] }),
      ).toBe("UnsupportedMatch");
      expect(yield* fail({ ...replay1v1(), heroSlotCount: 2 })).toBe("UnsupportedMatch");
      expect(
        yield* fail({ ...replay1v1(), rules: { ...replay1v1().rules, weaponSpawnRateId: 1 } }),
      ).toBe("UnsupportedMatch");
      expect(
        yield* fail({ ...replay1v1(), rules: { ...replay1v1().rules, gadgetSpawnRateId: 1 } }),
      ).toBe("UnsupportedMatch");
      expect(
        yield* fail({
          ...replay2v2(),
          players: replay2v2().players.map((p) => ({ ...p, team: 1 })),
        }),
      ).toBe("UnsupportedMatch");
    }),
  );
});
```

Fix imports (`Layer`, `UnsupportedMatch` unused if using `_tag`). Do not import `UnsupportedMatch` if unused.

- [ ] **Step 2: Run test to verify it fails**

```bash
vp test
```

Expected: FAIL — `MatchRules` missing.

- [ ] **Step 3: Implement MatchRules**

```ts
import type { Replay } from "@gimped/replay";
import { Context, Effect, Layer } from "effect";
import { UnsupportedMatch } from "./errors.ts";
import { Tables } from "./Tables.ts";

const fail = (reason: string) => new UnsupportedMatch({ reason });

export class MatchRules extends Context.Service<
  MatchRules,
  {
    readonly check: (replay: Replay) => Effect.Effect<void, UnsupportedMatch>;
  }
>()("@gimped/sim/MatchRules") {
  static readonly layer = Layer.effect(
    MatchRules,
    Effect.gen(function* () {
      const tables = yield* Tables;
      const check = Effect.fn("MatchRules.check")(function* (replay: Replay) {
        const scoring = tables.scoring.get(replay.rules.scoringTypeId);
        if (scoring?.name !== "Stock") {
          return yield* fail(`scoring ${replay.rules.scoringTypeId} is not Stock`);
        }
        if (replay.heroSlotCount !== 1) {
          return yield* fail("heroSlotCount must be 1");
        }
        if (replay.rules.weaponSpawnRateId !== 0 || replay.rules.gadgetSpawnRateId !== 0) {
          return yield* fail("weapon/gadget spawns must be off");
        }
        const n = replay.players.length;
        if (n !== 2 && n !== 4) {
          return yield* fail(`player count ${n}`);
        }
        const teams = new Map<number, number>();
        for (const player of replay.players) {
          teams.set(player.team, (teams.get(player.team) ?? 0) + 1);
        }
        if (teams.size !== 2) {
          return yield* fail("need exactly two teams");
        }
        const counts = [...teams.values()];
        const expected = n === 2 ? 1 : 2;
        if (counts.some((c) => c !== expected)) {
          return yield* fail("uneven teams");
        }
      });
      return MatchRules.of({ check });
    }),
  );
}
```

- [ ] **Step 4: Run tests**

```bash
vp test
vp check --fix
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src
git commit -m "feat(sim): reject non-STOCK and invalid rosters"
```

---

### Task 4: Match + Clock

**Files:**

- Create: `packages/sim/src/Match.ts`
- Create: `packages/sim/src/Clock.ts`
- Create: `packages/sim/src/Clock.test.ts`
- Modify: `packages/sim/src/index.ts`

**Interfaces:**

- Produces:
  - `Match.get(): Effect<MatchState, SimulationFault>`
  - `Match.replace(state: MatchState): Effect<void>`
  - `Match.modify(f: (s: MatchState) => void): Effect<void, SimulationFault>`
  - `Clock.advance(): Effect<void, SimulationFault>` — at `gameSpeed` 100, `timeMs += 16`

- [ ] **Step 1: Write the failing test**

Provide `Match.layer` + `Clock.layer`. In the test, `replace` a `MatchState` with `timeMs: 0`, `gameSpeed: 100`, empty fighters, `boxStage` lines/spawns/bounds, `ended: false`, `startingLives: 3`. `advance` twice. Expect `timeMs === 32`.

- [ ] **Step 2: Run test to verify it fails**

```bash
vp test
```

Expected: FAIL — services missing.

- [ ] **Step 3: Implement**

`Match.ts`: `Ref.make<MatchState | undefined>(undefined)`. `get` fails with `SimulationFault({ reason: "no match" })` if empty. `modify` mutates in place.

`Clock.ts` depends on `Match`. `advance`: `timeMs += 16` when `gameSpeed === 100`. For other speeds, still add 16 to match clock (frame is 16 ms); physics rates later scale from dump. Tests only use 100.

- [ ] **Step 4: Run tests**

```bash
vp test
vp check --fix
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src
git commit -m "feat(sim): match state and 16ms clock"
```

---

### Task 5: Rng (Well512)

**Files:**

- Create: `packages/sim/src/Rng.ts`
- Create: `packages/sim/src/Rng.test.ts`
- Modify: `packages/sim/src/index.ts`

**Interfaces:**

- Consumes: `@gimped/swz` `Well512`
- Produces: `Rng.initState(seed: number)`, `Rng.next(): Effect<number>` wrapping one `Well512Instance`

- [ ] **Step 1: Write the failing test**

Layer: `Rng.layer.pipe(Layer.provide(Well512.layer))`.

```ts
it.effect("matches swz Well512 sequence", () =>
  Effect.gen(function* () {
    const rng = yield* Rng;
    yield* rng.initState(0x12345678);
    expect(yield* rng.next()).toBe(0x7f031c96);
    expect(yield* rng.next()).toBe(0xe5ec2c73);
  }),
);
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — `Rng` missing.

- [ ] **Step 3: Implement**

`Layer.effect`: `const instance = yield* well512.create()` then `initState` / `next` as `Effect.sync` around that instance.

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src
git commit -m "feat(sim): wrap Well512 as Rng layer"
```

---

### Task 6: Collision queries

**Files:**

- Create: `packages/sim/src/Collision.ts`
- Create: `packages/sim/src/Collision.test.ts`
- Modify: `packages/sim/src/index.ts`

**Interfaces:**

- Consumes: `Match` (reads `lines`)
- Produces:
  - `groundAt(x: number, y: number, vy: number): CollisionLine | undefined`
  - Hard (`type === 1`): collide from above (`vy >= 0`, previous y above line, x between Left/Right)
  - Soft (`type === 2`): same, but only when approaching from above (not from below). Miss from below: `vy < 0` or y already below the line → undefined

Port line bounds from `class_71`: Left=min(startX,endX), Right=max, Top=min(startY,endY). Treat a horizontal floor as `startY === endY`.

- [ ] **Step 1: Write the failing test**

Build a `MatchState` with three lines: hard floor `(-200,0)-(200,0)`, soft `(-100,-40)-(100,-40)`, hard far below. Cases:

- Point `(0, -1)` `vy=1` → hard floor
- Point `(0, -41)` `vy=1` → soft
- Point `(0, -30)` `vy=-1` (moving up into soft) → undefined
- Point `(500, -1)` `vy=1` → undefined (off the line)

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — `Collision` missing.

- [ ] **Step 3: Implement `Collision.layer`**

Read `Match.get()`. Implement `groundAt` as above. Use a small epsilon (dump `class_72.var_8795 = 0.01`) for “on the line”.

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src
git commit -m "feat(sim): hard and soft collision queries"
```

---

### Task 7: World (blastzones, spawns, step)

**Files:**

- Create: `packages/sim/src/World.ts`
- Create: `packages/sim/src/World.test.ts`
- Modify: `packages/sim/src/index.ts`

**Interfaces:**

- Consumes: `Match`, `Collision`
- Produces:
  - `spawnFor(team: number, index: number): Spawn` — nth spawn with that team, else nth overall
  - `inBlastzone(x, y): boolean` — outside `bounds` (x < bounds.x OR y < bounds.y OR x > x+w OR y > y+h)
  - `step(): Effect<void>` — moving platforms later; v1 no-op (no platforms in `LevelCollisionData` yet)

- [ ] **Step 1: Write the failing test**

Box stage bounds `{ x: -400, y: -200, w: 800, h: 600 }`. `(0,0)` not in blastzone. `(0, 500)` is (below floor, y-down). `spawnFor(1, 0)` is `(-80, -50)`.

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — `World` missing.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src
git commit -m "feat(sim): blastzones and respawn points"
```

---

### Task 8: Input (held 14-bit masks)

**Files:**

- Create: `packages/sim/src/Input.ts`
- Create: `packages/sim/src/Input.test.ts`
- Modify: `packages/sim/src/index.ts`

**Interfaces:**

- Consumes: `Match` (`timeMs`, `fighters`)
- Produces: `Input.load(rows: Replay["inputs"]): Effect<void>` stores rows on match; `Input.apply(): Effect<void, SimulationFault>` sets each fighter’s `input` to the latest row with `time <= timeMs`. Omitted `input` field → `undefined` (clear). Unknown `entityId` → `SimulationFault`.

- [ ] **Step 1: Write the failing test**

Two fighters ids 1 and 2. Rows: `{ entityId: 1, time: 16, input: 8 }`, `{ entityId: 1, time: 48 }` (clear), `{ entityId: 2, time: 16, input: 4 }`.

- After `timeMs = 0` apply: both `input` undefined
- `timeMs = 16` apply: fighter 1 mask `8`, fighter 2 mask `4`
- `timeMs = 48` apply: fighter 1 `undefined`, fighter 2 still `4`

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — `Input` missing.

- [ ] **Step 3: Implement**

Keep `inputs: Replay["inputs"]` on `MatchState` (add the field in `domain.ts`). `apply` walks rows in order; last matching row per entity wins.

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src
git commit -m "feat(sim): apply held replay input masks"
```

---

### Task 9: Fighter kinematics (unarmed)

**Files:**

- Create: `packages/sim/src/Fighter.ts`
- Create: `packages/sim/src/Fighter.test.ts`
- Modify: `packages/sim/src/index.ts`

**Interfaces:**

- Consumes: `Match`, `Collision`, `Input` (already applied this tick)
- Produces: `Fighter.step(): Effect<void, SimulationFault>`
  - Gravity: copy per-frame `vy` increment from dump entity integrate (`class_123` / physics store `class_126`). Y-down: falling **increases** `y`.
  - If `Collision.groundAt(x, y, vy)` and not jumping through: `y = line.Top()`, `vy = 0`, `grounded = true`; else `grounded = false`
  - Walk: if not stunned: `left` (bit 4) decreases `x`, `right` (bit 8) increases `x`. Walk speed copied from dump (`class_717` / HeroType). `facingLeft` follows last horizontal.
  - Never set a weapon. Ignore attack bits here (Combat owns those).

- [ ] **Step 1: Write the failing test**

Spawn fighter at `(0, -80)`, `vy = 0`, over hard floor at y=0. After 120 steps (no input), `grounded === true` and `y === 0` (or within 0.01).

Then set `input = InputBits.right`, 30 more steps: `x > 0`.

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — `Fighter` missing.

- [ ] **Step 3: Implement**

Search dump for the gravity add on the Y velocity channel (`var_9987` is Y, `var_13317` / `var_1656` are velocity channels — confirm which is `vy` by who is integrated into `var_9987`). Copy that increment. If walk speed is hero-stat based, use the Bodvar/unarmed ground speed from HeroType dump for fixture hero 3, or a dump constant shared by all legends for unarmed walk.

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src
git commit -m "feat(sim): unarmed gravity, land, and walk"
```

---

### Task 10: Items stub + Renderer stub

**Files:**

- Create: `packages/sim/src/Items.ts`
- Create: `packages/sim/src/Renderer.ts`
- Create: `packages/sim/src/Items.test.ts`
- Create: `packages/sim/src/Renderer.test.ts`
- Modify: `packages/sim/src/domain.ts` — `Snapshot` type (clock, fighters’ public fields)
- Modify: `packages/sim/src/Match.ts` — `snapshot(): Effect<Snapshot, SimulationFault>`
- Modify: `packages/sim/src/index.ts`

**Interfaces:**

- Produces:
  - `Items.step(): Effect<void>` — no-op; fighter count unchanged
  - `Renderer.present(snapshot: Snapshot): Effect<void>` — no-op success
  - `Match.snapshot()` copies `{ timeMs, ended, fighters: [{ entityId, team, x, y, lives, damage, score, ko }] }`

- [ ] **Step 1: Write the failing tests**

Items: replace match with one fighter, `Items.step`, still one fighter.

Renderer: `present` of a snapshot succeeds (use `Effect.as(true)` and expect true). Count calls with a test-only counter if you wrap; stub itself does not throw.

- [ ] **Step 2: Run tests to verify they fail**

Expected: FAIL — modules missing.

- [ ] **Step 3: Implement stubs + snapshot**

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src
git commit -m "feat(sim): stub items and renderer layers"
```

---

### Task 11: Stock (KO, lives, scores, match end)

**Files:**

- Create: `packages/sim/src/Stock.ts`
- Create: `packages/sim/src/Stock.test.ts`
- Modify: `packages/sim/src/index.ts`

**Interfaces:**

- Consumes: `Match`, `World`
- Produces: `Stock.step(): Effect<void, SimulationFault>`
  - If fighter not `ko` and `World.inBlastzone(x,y)`: `lives -= 1`; if an opponent exists, that opponent’s `score += 1` (KO credit: in 1v1 the other player; in 2v2 credit is deferred — for v1, if exactly one other team, add 1 to **each** living opponent on the other team? **No.** Dump credits the player who dealt the last hit. Without combat, blastzone self-KO: **do not increment anyone’s score** (self-destruct). Tests for walk-off: victim lives 0, scores stay 0 unless Combat set `lastHitBy`.
  - Add `lastHitBy: number | undefined` on `FighterState`. On blastzone KO, if `lastHitBy` is set, that entity’s `score += 1`.
  - If `lives > 0`: respawn at `World.spawnFor(team, index)`, reset `x,y,vx,vy,ko=false,damage=0`. If `lives === 0`: `ko = true`, park off-stage.
  - Match ends when every fighter on one of the two teams has `lives === 0`. Set `ended = true`. Ignore `rules.duration` unless dump shows STOCK uses it (do not add a time limit without a dump citation).

- [ ] **Step 1: Write the failing test**

1v1, 1 life each. Place fighter 1 at `(0, 500)` (in blastzone), `lastHitBy = 2`. One `Stock.step`: fighter 1 `lives === 0`, `ko === true`, fighter 2 `score === 1`, `ended === true`.

Second case: `lastHitBy` undefined → fighter 2 score stays 0, still `ended` (team 1 eliminated).

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — `Stock` missing.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src
git commit -m "feat(sim): stock KO, respawn, and match end"
```

---

### Task 12: Unarmed Combat

**Files:**

- Create: `packages/sim/src/Combat.ts`
- Create: `packages/sim/src/Combat.test.ts`
- Modify: `packages/sim/src/domain.ts` — `attackFrames`, `hitW`, `hitH`, `hitOffsetX` on fighter if needed
- Modify: `packages/sim/src/index.ts`

**Interfaces:**

- Consumes: `Match`, `Fighter` (positions), `Rng`, `Tables`
- Produces: `Combat.step(): Effect<void, SimulationFault>`
  - Hurtbox: axis-aligned rect centered on fighter `(x, y)` with `hurtW`/`hurtH` (y-down: top = y - hurtH, or follow dump HurtboxType offsets — DEFAULT from tables if present)
  - Attack: copy which replay bit starts an unarmed light from `class_288` (~line 1252, `param2 & 32` and `var_2268`). Until weapons exist, **only unarmed**. Startup/active/recover frames from `PowerType` when `Tables.powers` has a row; for synthetic tests with empty `powers`, use a dump-cited unarmed nlight (startup/active/recover, damage, fixed impulse) hardcoded as named constants from `PowerType.as` / unarmed XML names, not invented.
  - On overlap of attacker active hitbox vs victim hurtbox: `victim.damage += baseDamage`, apply impulse to `vx,vy` (dump OnHit on `class_122`), `victim.stun = stunFrames`, `victim.lastHitBy = attacker.entityId`. Same-team: no hit (2v2).

- [ ] **Step 1: Write the failing test**

Two grounded fighters overlapping hurtboxes. Attacker `input` includes the dump’s attack bit. After enough `Combat.step` calls to cover startup+active: victim `damage > 0` and `lastHitBy === attacker`. Teammate overlap does not hit.

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — `Combat` missing.

- [ ] **Step 3: Implement by reading dump**

Must open `PowerType.as`, `class_206` (HurtboxType), `class_123.OnHit` / `class_122.OnHit`, `class_288` input→power. Port the unarmed nlight path only. Do not port weapons.

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src
git commit -m "feat(sim): unarmed hitboxes and OnHit"
```

---

### Task 13: Simulation loop

**Files:**

- Create: `packages/sim/src/Simulation.ts`
- Create: `packages/sim/src/layers.ts`
- Create: `packages/sim/src/Simulation.test.ts`
- Modify: `packages/sim/src/index.ts`

**Interfaces:**

- Consumes: all physics services + `MatchRules` + `Tables` + `LevelCollision`
- Produces:
  - `create(replay: Replay): Effect<void, UnsupportedMatch | MissingTables | MissingCollision | SimulationFault>`
  - `step(): Effect<void, SimulationFault>`
  - `runToEnd(): Effect<SimResults, SimulationFault>`
  - `runReplay(replay: Replay): Effect<SimResults, UnsupportedMatch | MissingTables | MissingCollision | SimulationFault>`
  - `snapshot()` delegates to `Match`
  - Order: Clock.advance → Input.apply → Items.step → World.step → Fighter.step → Combat.step → Stock.step → Renderer.present(snapshot)
  - `create`: `MatchRules.check`; require `LevelCollision.levelId === replay.level.id` else `MissingCollision`; require each player `heroes[0].heroId` in `Tables.heroes` else `MissingTables`; seed `Rng` with `0` for synthetic (replace with dump match seed when found); spawn fighters at `World.spawnFor`; `lives = startingLives`; `Input.load(replay.inputs)`; clock 0
  - `runToEnd`: loop `step` while `!ended` and `timeMs < 600_000` (safety cap → `SimulationFault` if hit)
  - `SimResults.duration = timeMs`; `scores` from fighters `{ entityId, score }`; `endValue = 1`
  - `Simulation.Default` = provideMerge all live layers except `GameData`/`ReplayLoader`. Still requires `Tables` + `LevelCollision`.
  - `TestLive = Simulation.Default.pipe(Layer.provide(Tables.make(stockTables())), Layer.provide(LevelCollision.make(boxStage())))`

- [ ] **Step 1: Write the failing test**

`layer(TestLive)`:

- `create(replay1v1)` then one `step`: `timeMs === 16`, two fighters, `Renderer` did not throw
- `create` of timed (`scoringTypeId: 2`) fails `UnsupportedMatch`
- Walk-off: `replay1v1` with inputs `{ entityId: 1, time: 16, input: InputBits.right }` (and keep holding — one row is enough). `runReplay` → fighter 1 eventually in blastzone or still on stage. If walk speed × time is not enough to leave ±400, place spawn at `x=350` in a custom `LevelCollision` for this test **or** set input and `runToEnd` after `replace`ing fighter x. Prefer: after create, `Match.modify` set fighter 1 `x = 500`, `y = 0`, then `step` once through Stock. Expect `ended` and scores per Task 11 (self-KO if no lastHitBy).

Also assert `Items.step` did not add fighters (`fighters.length === 2`).

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — `Simulation` missing.

- [ ] **Step 3: Implement Simulation + layers**

`Rng.layer` must `Layer.provide(Well512.layer)` inside Default.

Export `create`, `step`, `runToEnd`, `runReplay`, `snapshot` as `Effect.fn` wrappers that `yield* Simulation` like `@gimped/replay` pipeline.

- [ ] **Step 4: Run tests**

```bash
vp test
vp check --fix
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src
git commit -m "feat(sim): compose tick loop and runReplay"
```

---

### Task 14: GameData (SWZ / LevelDesc XML)

**Files:**

- Create: `packages/sim/src/GameData.ts`
- Create: `packages/sim/src/GameData.test.ts`
- Modify: `packages/sim/src/index.ts`

**Interfaces:**

- Consumes: `FileSystem`, `Path`, `@gimped/swz` `XmlCodec`, `SwzCodec`, `VersionKeys` (same ingest split as `@gimped/replay` `GameData`: directory of XML vs `.swz`)
- Produces: `GameData.load(dataPath: string, levelId: number): Effect<{ tables: TablesData; level: LevelCollisionData }, IoError | MissingTables | MissingCollision | MalformedXml | …>`
  - Parse `ScoringType` nodes → `scoring` (need `Stock`)
  - Parse `HeroType` → `heroes`
  - Parse `HurtboxType` name DEFAULT width/height
  - Parse `PowerType` unarmed names if present (optional for this task)
  - Parse `LevelDesc` with `LevelName` / id matching `levelId`. Collision children: `HardCollision` / `SoftCollision` with attributes `X1` `Y1` `X2` `Y2` (`class_244`). `CameraBounds` `X` `Y` `W` `H`. `Respawn` `X` `Y` `Team`.
  - If XML has no lines for that level → `MissingCollision`
  - Map IO failures with `toIoError`

- [ ] **Step 1: Write the failing test**

`layer(GameData.layer.pipe(Layer.provideMerge(NodeServices.layer)))`.

Write a temp dir with:

`ScoringTypes.xml`:

```xml
<ScoringTypes>
  <ScoringType ScoringTypeID="1" ScoringTypeName="Stock"/>
</ScoringTypes>
```

`HeroTypes.xml`:

```xml
<HeroTypes>
  <HeroType HeroID="3" HeroName="Bodvar"/>
</HeroTypes>
```

`LevelDesc_Box.xml`:

```xml
<LevelDesc LevelName="Box" LevelID="12">
  <CameraBounds X="-400" Y="-200" W="800" H="600"/>
  <HardCollision X1="-200" Y1="0" X2="200" Y2="0"/>
  <Respawn X="0" Y="-50" Team="1"/>
</LevelDesc>
```

`load(dir, 12)` → hard line present, scoring 1 is Stock.

Missing dir → `IoError`. `load(dir, 99)` → `MissingCollision`.

Attribute names: if dump uses different XML field names, **follow the dump / existing SWZ fixtures**, not this sample. Adjust the test XML to match `class_244` / real `LevelDesc` tags after opening one decompiled SWZ entry if available; if not, use the `class_244` string constants (`X1`, `Y1`, `HardCollision`, `CameraBounds`, `Respawn`).

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — `GameData` missing.

- [ ] **Step 3: Implement**

Copy directory vs `.swz` branching from `packages/replay/src/GameData.ts`. Do not annotate names onto Replay; return `TablesData` + `LevelCollisionData`.

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src
git commit -m "feat(sim): load tables and LevelDesc XML"
```

---

### Task 15: ReplayLoader

**Files:**

- Create: `packages/sim/src/ReplayLoader.ts`
- Create: `packages/sim/src/ReplayLoader.test.ts`
- Modify: `packages/sim/src/index.ts`

**Interfaces:**

- Consumes: `FileSystem`, `@gimped/replay` `Envelope`, `ReplayCodec`
- Produces:
  - `fromBytes(bytes: Uint8Array): Effect<Replay, InvalidReplay | ChecksumMismatch>`
  - `fromPath(path: string): Effect<Replay, IoError | InvalidReplay | ChecksumMismatch>`

- [ ] **Step 1: Write the failing test**

Provide `ReplayLoader.layer` + `Envelope.layer` + `ReplayCodec.layer` + `NodeServices`.

Use `@gimped/replay` `encode` on `replay1v1()` then `fromBytes`. Expect `players.length === 2` and `rules.scoringTypeId === 1`.

`fromPath` missing file → `IoError`.

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — `ReplayLoader` missing.

- [ ] **Step 3: Implement**

```ts
fromBytes: envelope.open → codec.decode
fromPath: fs.readFile → mapError toIoError → fromBytes
```

- [ ] **Step 4: Run tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src
git commit -m "feat(sim): load replays via @gimped/replay"
```

---

### Task 16: Integration + public API

**Files:**

- Modify: `packages/sim/src/Simulation.test.ts` (or create `packages/sim/src/integration.test.ts`)
- Modify: `packages/sim/src/index.ts` — export all services, errors, domain types, fixtures, `TestLive`, `create`, `step`, `runToEnd`, `runReplay`
- Modify: `packages/sim/src/layers.ts` — export `TestLive`, `Simulation.Default`

**Interfaces:**

- Consumes: Task 13–15 APIs
- Produces: passing 1v1/2v2 `runReplay` tests; `vp check --fix` clean

- [ ] **Step 1: Write the failing integration tests**

1. `runReplay(replay1v1())` with TestLive: returns `scores` length 2, `duration` multiple of 16, `ended` (may need to force a KO via modify if they never leave the box — if create+runToEnd never ends, `SimulationFault` cap is wrong; for a stable 1v1 with no inputs they stand on the floor forever). **Do not wait for natural KO.** Instead: `create`, `modify` fighter 1 into blastzone with `lastHitBy: 2`, `step`, read snapshot: `ended`, scores `[ { entityId: 2, score: 1 }, … ]`.
2. Same for `replay2v2()`: KO both team-1 fighters (blastzone) → `ended`.
3. `runReplay` returns `{ duration, scores }` and does **not** fail if scores are zeros.
4. Optional: if `process.env.GIMPED_UNARMED_REPLAY` is set, `fromPath` + `GameData.load` + `runReplay` and `expect(sim.duration).toBe(replay.results.duration)` and scores equal. Skip when unset so CI has no install.

- [ ] **Step 2: Run tests to verify they fail**

Expected: FAIL until assertions are wired (or PASS if Task 13 already covers 1 — then add 2v2 / optional golden only).

- [ ] **Step 3: Implement remaining glue**

Ensure `index.ts` exports everything listed in the spec service table.

- [ ] **Step 4: Run full package verification**

```bash
vp test
vp check --fix
vp build
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sim src/index.ts packages/sim/src
git commit -m "feat(sim): 1v1/2v2 integration and public exports"
```

---

## Self-review (spec coverage)

| Spec requirement | Task |
| --- | --- |
| Package `@gimped/sim`, Vite+, tsconfig ref | 1 |
| Tagged errors | 1 |
| Tables + LevelCollision inject | 2 |
| STOCK / 1v1 / 2v2 / heroSlotCount / spawns off | 3 |
| Mutable Match, 16 ms Clock | 4 |
| Well512 Rng | 5 |
| Hard/soft collision | 6 |
| Blastzones, spawns, World.step | 7 |
| Held 14-bit inputs | 8 |
| Unarmed gravity/land/walk | 9 |
| Items stub, Renderer stub | 10 |
| Stock KO/score/end | 11 |
| Unarmed combat OnHit | 12 |
| Tick order, create, runReplay, Default, TestLive | 13 |
| GameData SWZ/XML | 14 |
| ReplayLoader | 15 |
| 1v1/2v2 tests, optional golden, vp check | 16 |
| No CLI, no SWF, no weapons, no other modes | 3, 10, 12 |
| Results mismatch is not an error | 13, 16 |
