# Unarmed jumps, dodge, and kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `@gimped/sim` so unarmed STOCK fighters jump, dodge/dash, fast-fall, wall-jump, and use the full unarmed light/heavy/air kit from dump `class_123` / `class_288` / `ItemType`, then run the SmallBrawlhaven fixture to a legal STOCK end.

**Architecture:** Same tick graph (Clock → Input → Items stub → World → Fighter → Combat → Stock → Renderer). No new service. `Input` stores `prevInput` for edges. `Collision.wallAt` for vertical hard lines. `Fighter` owns jump/dodge/fast-fall. `Combat` selects Unarmed powers via `var_2268`. `GameData` ingests `itemTypes.csv` / `powerTypes.csv` through `@gimped/swz` `CsvCodec` (those tables are CSV in `Game.swz`, not XML).

**Tech Stack:** Effect (catalog), `@effect/vitest`, Vite+ (`vp test` / `vp check --fix` in `packages/sim`), `@gimped/swz` `CsvCodec` / `XmlCodec` / `SwzCodec`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-16-sim-jumps-unarmed-design.md` (parent: `2026-08-15-sim-engine-design.md`)
- Dump is source of truth: `brawlhalla-src/dump`. Search with `rg --no-ignore` (tree is gitignored). Do not invent impulses, durations, or slot maps.
- `Effect.fn("Name")` + `Effect.gen`; service ids `"@gimped/sim/<Module>"`
- Y-down; gravity `3.75`; `DT = 0.384`; 16 ms frames
- STOCK 1v1/2v2; weapon/gadget spawns still `UnsupportedMatch`
- TDD per task: fail → implement → pass → `vp check --fix` → commit
- After code: `vp test` and `vp check --fix` in `packages/sim` (PowerShell: `;` not `&&`)
- Tests assert qualitative dump behavior, not recorded replay `2–1` / `36208`
- Weapons / crates / gadgets / `class_288` 5–7 frame buffer are **out** (spec 2)

### Dump input bits (corrects the spec table)

`class_288` edge-detect + dispatch (not the brainstorm table):

| Bit | Dump | Sim `InputBits` |
| --- | --- | --- |
| 16 | `method_5226` jump | `jump` |
| 32 | used **inside** `method_8993` as neutral-vs-side on the snapshot mask | keep `attack: 32` for that inner check; **do not** start attacks on 32 |
| 64 | `method_8993(..., param4=6)` heavy | `heavy` |
| 128 | `method_8993(..., param4=0)` light | `light` |
| 256 | `method_84` dodge | `dodge` |
| 512 | throw / `method_4771` | `throw` |

Task 1 updates the spec file’s bit table to this mapping.

### Unarmed CSV kit (`itemTypes.csv` row `Unarmed`)

| Slot | XML/CSV column | PowerName |
| --- | --- | --- |
| 1 | `PowerType_Combo1` | `BaseNeutral` |
| 2 | `PowerType_Forward` | `BaseSide` |
| 3 | `PowerType_Down` | `BaseDown` |
| 4 | `PowerType_Aerial` | `BaseAir` |
| 5 | `PowerType_Aerial_Forward` | `BaseAirSide` |
| 6 | `PowerType_Aerial_Down` | `BaseAirDown` |
| 7 | `PowerType_Smash_Forward` | `BaseSmashSide` |
| 11 | `PowerType_Smash_Neutral` | `BaseSmashUp` |
| 8 | `PowerType_Smash_Down` | `BaseSmashDown` |
| 9 | `PowerType_Smash_Aerial_Up` | `BaseAirUpHeavy` |
| 10 | `PowerType_Smash_Aerial_Down` | `BaseGroundPound` |

`var_2268 = [3, 1, 2, 6, 4, 5, 8, 11, 7, 10, 9, 9]` (`class_288.as:37`).

## File structure

| File | Role this plan |
| --- | --- |
| `packages/sim/src/domain.ts` | `InputBits`, `prevInput`, jump/dodge fields, `ItemRow`, richer `PowerRow` |
| `packages/sim/src/Input.ts` | Copy current mask to `prevInput` before applying the new mask |
| `packages/sim/src/Input.test.ts` | Jump/light/heavy/dodge/throw bits + `prevInput` |
| `packages/sim/src/Collision.ts` | `wallAt` |
| `packages/sim/src/Collision.test.ts` | Vertical wall |
| `packages/sim/src/Fighter.ts` | Jump, dodge, fast-fall |
| `packages/sim/src/Fighter.test.ts` | Jump/dodge/fast-fall cases |
| `packages/sim/src/Combat.ts` | `var_2268` + tables; dodge invuln; throw no-op |
| `packages/sim/src/Combat.test.ts` | Kit select + throw |
| `packages/sim/src/GameData.ts` | CSV ingest; items + power combat fields |
| `packages/sim/src/GameData.test.ts` | Unarmed slots + CastTime |
| `packages/sim/src/fixtures.ts` | `stockTables` Unarmed + `BaseNeutral` |
| `packages/sim/src/fixtures.test.ts` | `runToEnd` legal STOCK |
| `docs/superpowers/specs/2026-08-16-sim-jumps-unarmed-design.md` | Bit table + CSV note |

---

### Task 1: InputBits, prevInput, spec bit table

**Files:**

- Modify: `packages/sim/src/domain.ts`
- Modify: `packages/sim/src/Input.ts`
- Modify: `packages/sim/src/Input.test.ts`
- Modify: `docs/superpowers/specs/2026-08-16-sim-jumps-unarmed-design.md` (Input bits table + one sentence that `itemTypes.csv` / `powerTypes.csv` are CSV)

**Interfaces:**

- Produces: `InputBits.jump === 16`, `.heavy === 64`, `.light === 128`, `.dodge === 256`, `.throw === 512`, `.attack === 32` (inner `method_8993` only)
- Produces: `FighterState.prevInput?: number` — mask from the **previous** `Input.apply`, so Fighter and Combat see the same edge on this frame

- [ ] **Step 1: Write the failing Input test**

Add to `packages/sim/src/Input.test.ts` inside the existing `layer(Live)("Input", …)`:

```ts
  it.effect("stores prevInput and applies jump/light/heavy/dodge/throw bits", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const input = yield* Input;
      const stage = boxStage();
      yield* match.replace({
        timeMs: 16,
        gameSpeed: 100,
        ended: false,
        fighters: [fighter(1)],
        lines: stage.lines,
        spawns: stage.spawns,
        bounds: stage.bounds,
        startingLives: 3,
        inputs: [],
      });
      yield* input.load([{ entityId: 1, time: 16, input: 16 | 128 }]);
      yield* input.apply();
      let state = yield* match.get();
      expect(state.fighters[0]?.input).toBe(16 | 128);
      expect(state.fighters[0]?.prevInput).toBeUndefined();

      yield* match.modify((s) => {
        s.timeMs = 32;
      });
      yield* input.load([{ entityId: 1, time: 16, input: 16 | 128 }, { entityId: 1, time: 32, input: 256 }]);
      yield* input.apply();
      state = yield* match.get();
      expect(state.fighters[0]?.prevInput).toBe(16 | 128);
      expect(state.fighters[0]?.input).toBe(256);
    }),
  );
```

Import `InputBits` and also `expect(InputBits.jump).toBe(16)` etc. in this test (or a one-liner at the top of the effect).

- [ ] **Step 2: Run the test — expect FAIL** (missing `prevInput` / bits)

Run: `vp test src/Input.test.ts`  
Working directory: `packages/sim`  
Expected: FAIL (`prevInput` undefined after second apply, or `InputBits.jump` undefined)

- [ ] **Step 3: Implement bits + prevInput**

`domain.ts` replace `InputBits`:

```ts
export const InputBits = {
  up: 1,
  down: 2,
  left: 4,
  right: 8,
  jump: 16,
  /** Inner `class_288.method_8993` `(param2 & 32)` — not the replay light button. */
  attack: 32,
  heavy: 64,
  light: 128,
  dodge: 256,
  throw: 512,
} as const;
```

Add `prevInput?: number` on `FighterState` next to `input`.

`Input.apply` when writing masks:

```ts
fighter.prevInput = fighter.input;
fighter.input = row?.input;
```

Update the spec **Input bits** table to the dump mapping above. Add under GameData: Unarmed kit and PowerType combat fields come from `itemTypes.csv` / `powerTypes.csv` in `Game.swz` via `CsvCodec`.

- [ ] **Step 4: Run the test — expect PASS**

Run: `vp test src/Input.test.ts`  
Expected: PASS

- [ ] **Step 5: Check and commit**

Run: `vp check --fix`  
Then:

```bash
git add packages/sim/src/domain.ts packages/sim/src/Input.ts packages/sim/src/Input.test.ts docs/superpowers/specs/2026-08-16-sim-jumps-unarmed-design.md
git commit -m "feat(sim): store prevInput and dump 14-bit action bits"
```

---

### Task 2: Vertical `Collision.wallAt`

**Files:**

- Modify: `packages/sim/src/Collision.ts`
- Modify: `packages/sim/src/Collision.test.ts`

**Interfaces:**

- Consumes: `CollisionLine` with `startX === endX` as a vertical wall
- Produces: `Collision.wallAt(x, y) => Effect<CollisionLine | undefined, SimulationFault>`

- [ ] **Step 1: Write the failing test**

In `Collision.test.ts`:

```ts
  it.effect("wallAt finds a vertical hard line and misses a floor", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const collision = yield* Collision;
      const stage = boxStage();
      const wall = { startX: 100, startY: -80, endX: 100, endY: 0, type: 1 as const };
      yield* match.replace({
        timeMs: 0,
        gameSpeed: 100,
        ended: false,
        fighters: [],
        lines: [hardFloor, wall],
        spawns: stage.spawns,
        bounds: stage.bounds,
        startingLives: 3,
        inputs: [],
      });
      const hit = yield* collision.wallAt(100, -40);
      expect(hit).toEqual(wall);
      const miss = yield* collision.wallAt(0, -1);
      expect(miss).toBeUndefined();
    }),
  );
```

- [ ] **Step 2: Run — expect FAIL** (`wallAt` not a function)

Run: `vp test src/Collision.test.ts`

- [ ] **Step 3: Implement `wallAt`**

Reuse `EPSILON`. Vertical = `line.startX === line.endX`. Hit when `Math.abs(x - line.startX) <= EPSILON` and `y` is between `min(startY,endY)` and `max(startY,endY)` (inclusive with EPSILON). Only `type === 1` hard walls. Return the first match (or nearest `x` if several).

Add `wallAt` to the `Collision` service type next to `groundAt`.

- [ ] **Step 4: Run — expect PASS**

Run: `vp test src/Collision.test.ts`

- [ ] **Step 5: Check and commit**

```bash
git add packages/sim/src/Collision.ts packages/sim/src/Collision.test.ts
git commit -m "feat(sim): query vertical hard walls"
```

---

### Task 3: Ground, air, and wall jump

**Files:**

- Modify: `packages/sim/src/domain.ts` (`airJumpsUsed?: number`, `wallSide?: -1 | 0 | 1`)
- Modify: `packages/sim/src/Fighter.ts`
- Modify: `packages/sim/src/Fighter.test.ts`

**Interfaces:**

- Consumes: `InputBits.jump`, `prevInput`, `Collision.wallAt`, `Collision.groundAt`
- Produces: jump on just-pressed 16; ground `vy -= 57`; air up to 2 jumps `vy -= 57`; wall `vy -= 53` and `vx = 48 * away`; landing resets `airJumpsUsed`

Dump: `class_123.method_5226`; ground 57 (`var_8735`); wall 53 (`var_14470` from `class_725`); wall X 48 (`var_8456`); air jumps `method_2869` returns 2.

Just pressed: `((input ?? 0) & jump) !== 0 && ((prevInput ?? 0) & jump) === 0`.

Stun `> 0` or `ko`: do not start a jump.

Order in `Fighter.step` (per fighter): apply gravity if airborne (existing) → jump start if just pressed → integrate / collide (existing). Jump must set `grounded = false` and `vy` **before** the land check so they leave the floor this frame.

Wall: if `wallAt(fighter.x, fighter.y)` defined, `wallSide = fighter.x >= wall.startX ? 1 : -1` (on/right of wall → push left = negative vx). If no wall, `wallSide = 0`. Prefer wall jump over air jump when `wallSide !== 0`.

- [ ] **Step 1: Write failing tests** in `Fighter.test.ts`

Use the existing `fighter()` helper and `boxStage()`. Seed `y: 0`, `grounded: true` for ground jump.

1. Ground jump: `input: InputBits.jump`, after one `kinematics.step()`, `vy < 0` and `grounded === false`.
2. Air jumps: start airborne `y: -80`, `grounded: false`, `airJumpsUsed: 0`, press jump three frames (set `prevInput` so each step is a new press: after each step set `prevInput = input` then keep `input = jump` only on press frames — easier: three separate replace/step with `prevInput: 0`, `input: jump`, incrementing `airJumpsUsed` by checking after each). After two jumps `airJumpsUsed === 2`; third press does not decrease `vy` further vs a control with `airJumpsUsed: 2` already (third jump: `vy` equals gravity-only).
3. Wall jump: lines include `{ startX: 0, startY: -80, endX: 0, endY: 0, type: 1 }`, fighter `x: 0`, `y: -40`, `grounded: false`, `input: jump`. After step, `vx` is non-zero (away from wall) and `vy < 0`.

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/Fighter.test.ts`

- [ ] **Step 3: Implement jumps in `Fighter.step`**

Constants (cite dump in comments):

```ts
const JUMP_GROUND = 57;
const JUMP_AIR = 57;
const JUMP_WALL_Y = 53;
const JUMP_WALL_X = 48;
const AIR_JUMPS = 2;
```

On land (`grounded` becomes true this frame): `airJumpsUsed = 0`.

- [ ] **Step 4: Run — expect PASS** (existing land/walk tests still pass)

Run: `vp test src/Fighter.test.ts`

- [ ] **Step 5: Check and commit**

```bash
git add packages/sim/src/domain.ts packages/sim/src/Fighter.ts packages/sim/src/Fighter.test.ts
git commit -m "feat(sim): ground, air, and wall jumps from dump"
```

---

### Task 4: Dodge, dash-jump, fast-fall

**Files:**

- Modify: `packages/sim/src/domain.ts` (`dodgeFrames?: number`, `dashing?: boolean`)
- Modify: `packages/sim/src/Fighter.ts`
- Modify: `packages/sim/src/Fighter.test.ts`
- Modify: `packages/sim/src/Combat.ts` (skip victim when `dodgeFrames > 0`)
- Modify: `packages/sim/src/Combat.test.ts` (nlight does not hit a dodging victim)

**Interfaces:**

- Dodge just-pressed `InputBits.dodge` (256), `class_123.method_84`
- Grounded + no left/right: spot dodge, duration **18** (`DodgeType` `StandardSpot`)
- Grounded + left/right: side dodge, duration **14** (`StandardSide`); set `dashing = true`
- Airborne + no side: duration **22** (`AerialSpot`)
- Airborne + side: duration **14** (`StandardSide`)
- On start: `vx = 0`, `vy = 0` (`class_123.as:8778-8780`); then side dodge may set `vx` toward the held side using walk `runSpeed` (do not invent DodgeType SpeedXFormula)
- `StartInvuln` is 2; treat `dodgeFrames > 0` as invulnerable (Combat skips that victim)
- Each Fighter step: if `dodgeFrames > 0`, decrement; when it hits 0, `dashing = false`
- Dash-jump: jump while `dashing && grounded` uses `vy -= 170` and clamp `|vx| <= 66` (`method_5226` dash branch)
- Fast-fall: dump `class_123.as:3656-3658` — max fall speed **70**, or **85** while `(input & down) !== 0` and airborne. After gravity, `if (vy > cap) vy = cap`. Y-down: positive `vy` is down.

Stun/ko: do not start dodge.

- [ ] **Step 1: Write failing tests**

Fighter:

- Grounded, `input: InputBits.dodge`, after 1 step `dodgeFrames === 18` (spot) and `vy === 0`.
- Grounded, `input: dodge | right`, `dodgeFrames === 14`, `dashing === true`.
- Dash-jump: `dashing: true`, `grounded: true`, `y: 0`, `input: jump`, after step `vy` more negative than a normal ground jump (170 vs 57).
- Fast-fall: two airborne fighters `y: -80`, same `vy: 50`; one `input: down`. After 20 steps the down fighter’s `vy` is greater (closer to 85) than the other (capped at 70). If both would exceed 70 without a cap, the test is valid.

Combat: seed attacker nlight as today, victim `dodgeFrames: 18`. After startup+active, victim `damage === 0`.

- [ ] **Step 2: Run — expect FAIL**

Run: `vp test src/Fighter.test.ts src/Combat.test.ts`

- [ ] **Step 3: Implement dodge / caps / Combat skip**

In Combat’s victim loop: `if ((victim.dodgeFrames ?? 0) > 0) continue;`

Apply fall cap after gravity, before jump (jump should still be able to set `vy` negative).

- [ ] **Step 4: Run — expect PASS**

Run: `vp test src/Fighter.test.ts src/Combat.test.ts`

- [ ] **Step 5: Check and commit**

```bash
git add packages/sim/src/domain.ts packages/sim/src/Fighter.ts packages/sim/src/Fighter.test.ts packages/sim/src/Combat.ts packages/sim/src/Combat.test.ts
git commit -m "feat(sim): dodge, dash-jump, and dump fall-speed cap"
```

---

### Task 5: GameData CSV items and PowerType fields

**Files:**

- Modify: `packages/sim/src/domain.ts` (`ItemRow`, expand `PowerRow`, `TablesData.items`)
- Modify: `packages/sim/src/fixtures.ts` (`items: new Map()` on `stockTables`)
- Modify: `packages/sim/src/GameData.ts`
- Modify: `packages/sim/src/GameData.test.ts`

**Interfaces:**

- Produces: `ItemRow = { name: string; slots: Map<number, string> }` with keys 1–11 as in the Unarmed table
- Produces: `PowerRow` also has `startup?`, `active?`, `recover?`, `damage?`, `fixedImpulse?`, `stun?`, `centerOffsetX?`, `centerOffsetY?`, `aoeX?`, `aoeY?`, `impulseOffsetX?`, `impulseOffsetY?`
- Produces: `TablesData.items: Map<string, ItemRow>` keyed by `ItemName`
- Produces: `powers` still keyed by `PowerID`; also fill `powersByName: Map<string, PowerRow>` **or** look up by scanning names — prefer `powersByName` on `TablesData`
- `GameData.layer` provides `CsvCodec.layer` in addition to `XmlCodec`

CastTime: dump `PowerType.as` `5:2@2-2` → startup `5`, active `2` (split on `:`, then `@`; first two integers). RecoverTime / BaseDamage / FixedImpulse / FixedStunTime / CenterOffset* / AoERadius* / ImpulseOffset* via existing `parseNum` / `firstCsvNum`.

CSV ingest in `ingestSwz` / directory: if content is not XML, `csv.csvToJson(content, path)` then for each `data.rows` call `ingestTables` with the row as an `XmlNode` (string values). Catch `MalformedCsv` like `MalformedXml` (skip entry). `looksLikeCsv`: first non-empty line does not start with `<`.

Item ingest: if `ItemName` is set, build `slots` from:

```ts
const SLOT_COLS: Array<[number, string]> = [
  [1, "PowerType_Combo1"],
  [2, "PowerType_Forward"],
  [3, "PowerType_Down"],
  [4, "PowerType_Aerial"],
  [5, "PowerType_Aerial_Forward"],
  [6, "PowerType_Aerial_Down"],
  [7, "PowerType_Smash_Forward"],
  [8, "PowerType_Smash_Down"],
  [9, "PowerType_Smash_Aerial_Up"],
  [10, "PowerType_Smash_Aerial_Down"],
  [11, "PowerType_Smash_Neutral"],
];
```

Skip empty / `--` slot values.

Power ingest: when `PowerName` + `PowerID` exist, merge combat fields onto the `PowerRow` (CSV rows have CastTime etc. on the same row).

`emptyTables()` must include `items: new Map()`, `powersByName: new Map()`.

- [ ] **Step 1: Write failing GameData tests**

Directory XML test already exists. Add a **temp CSV** test (not SWZ) by writing `itemTypes.csv` + `powerTypes.csv` + existing scoring/hero/level XML into a temp dir:

`itemTypes.csv`:

```
itemTypes
ItemName,PowerType_Combo1,PowerType_Forward
Unarmed,BaseNeutral,BaseSide
```

`powerTypes.csv`:

```
powerTypes
PowerName,PowerID,CastTime,RecoverTime,BaseDamage,FixedImpulse,FixedStunTime,CenterOffsetX,CenterOffsetY,AoERadiusX,AoERadiusY,ImpulseOffsetX,ImpulseOffsetY
BaseNeutral,1,5:2@2-2,3,3,25,17,76,4,45,33,100,-48
```

Plus existing `ScoringTypes.xml` / `HeroTypes.xml` / `LevelTypes.xml` / `LevelDesc_Box.xml`.

Assert:

```ts
expect(loaded.tables.items.get("Unarmed")?.slots.get(1)).toBe("BaseNeutral");
expect(loaded.tables.powersByName.get("BaseNeutral")?.startup).toBe(5);
expect(loaded.tables.powersByName.get("BaseNeutral")?.active).toBe(2);
```

Also extend the existing SWZ-dir SmallBrawlhaven test:

```ts
expect(loaded.tables.items.get("Unarmed")?.slots.get(1)).toBe("BaseNeutral");
expect(loaded.tables.powersByName.get("BaseNeutral")?.name).toBe("BaseNeutral");
```

- [ ] **Step 2: Run — expect FAIL** (`items` undefined / CSV skipped)

Run: `vp test src/GameData.test.ts`

- [ ] **Step 3: Implement CSV ingest + parsers**

`GameData.layer` `Effect.gen`: `const csv = yield* CsvCodec;` and `.pipe(Layer.provide(CsvCodec.layer))`.

Parse CastTime:

```ts
const parseCastTime = (raw: string | undefined): { startup?: number; active?: number } => {
  if (raw === undefined || raw === "" || raw.startsWith("time")) return {};
  const [head, rest] = raw.split(":");
  const startup = parseNum(head);
  const active = parseNum(rest?.split("@")[0]);
  return { startup, active };
};
```

- [ ] **Step 4: Run — expect PASS**

Run: `vp test src/GameData.test.ts`

- [ ] **Step 5: Check and commit**

```bash
git add packages/sim/src/domain.ts packages/sim/src/fixtures.ts packages/sim/src/GameData.ts packages/sim/src/GameData.test.ts
git commit -m "feat(sim): ingest Unarmed itemTypes and powerTypes CSV"
```

---

### Task 6: Combat `var_2268` unarmed kit

**Files:**

- Modify: `packages/sim/src/fixtures.ts` — `stockTables` Unarmed + `BaseNeutral` / `BaseSide` / `BaseDown` / `BaseAir` rows (minimal fields; nlight numbers stay the current Combat constants)
- Modify: `packages/sim/src/Combat.ts`
- Modify: `packages/sim/src/Combat.test.ts`

**Interfaces:**

- Consumes: `Tables.items.get("Unarmed")`, `tables.powersByName`, `InputBits.light` / `.heavy`, `grounded`, direction nibble
- Produces: power slot from dump:

```ts
const VAR_2268 = [3, 1, 2, 6, 4, 5, 8, 11, 7, 10, 9, 9];
const dir = (bits & InputBits.down) !== 0 ? 0 : (bits & (InputBits.left | InputBits.right)) !== 0 ? 2 : 1;
const air = fighter.grounded ? 0 : 3;
const param4 = heavy ? 6 : 0;
const slot = VAR_2268[dir + param4 + air]!;
const powerName = unarmed.slots.get(slot);
```

Start attack on **just pressed** light (128) or heavy (64), not held 32. Existing tests must set `input: InputBits.light` (update `ATTACK_BIT`).

If `stockTables` has Unarmed + BaseNeutral, nlight overlap test stays green.

Hitbox / damage / impulse / recover: use `PowerRow` fields when present; if missing, keep current BaseNeutral constants as fallback for that field only.

`attackFrames` still counts the current power. Recover length: `Math.floor((power.recover ?? 3) * (attacker.recoverMod ?? 1))`.

Need `Combat` to yield `Tables` and read Unarmed once per step (already yields Tables).

Slight vs nlight test: two attackers, one `input: light | right` (slight, slot 2 `BaseSide`), one `input: light` (nlight, slot 1). After create, they must have selected different `powerName` — store `attackPower?: string` on `FighterState` when the move starts so the test can read it.

- [ ] **Step 1: Write failing tests**

1. Change `ATTACK_BIT` to `InputBits.light`. Existing nlight hit test must still pass after implementation.
2. New: grounded `light|right` vs grounded `light` set different `attackPower` after 1 Combat step (`BaseSide` vs `BaseNeutral` with stockTables).
3. New: airborne (`grounded: false`) `light` → `attackPower === "BaseAir"`.
4. New: grounded `heavy` → `attackPower === "BaseSmashUp"`.

`stockTables` must define Unarmed slots and those PowerRows (`name` at least).

- [ ] **Step 2: Run — expect FAIL** (still nlight-only / `attackPower` undefined)

Run: `vp test src/Combat.test.ts`

- [ ] **Step 3: Implement selection + table-driven boxes**

Just pressed: `((input ?? 0) & bit) !== 0 && ((prevInput ?? 0) & bit) === 0`.

Do not start a new power if `attackFrames > 0`.

Facing: dump `method_6223` — if left/right held at start, set `facingLeft`.

- [ ] **Step 4: Run — expect PASS** including old nlight overlap

Run: `vp test src/Combat.test.ts`

- [ ] **Step 5: Check and commit**

```bash
git add packages/sim/src/fixtures.ts packages/sim/src/domain.ts packages/sim/src/Combat.ts packages/sim/src/Combat.test.ts
git commit -m "feat(sim): select unarmed kit from var_2268 and tables"
```

---

### Task 7: Throw bit is a no-op (no item spawn)

**Files:**

- Modify: `packages/sim/src/Combat.ts` (optional: consume throw so it does not fall through)
- Modify: `packages/sim/src/Combat.test.ts`
- Modify: `packages/sim/src/Items.ts` only if needed (keep no-op)

**Interfaces:**

- Just-pressed `InputBits.throw` (512): do not add fighters or items; `Items.step` stays `Effect.void`
- If Unarmed has no throw power (CSV has no throw slot in spec 1), throw does nothing

- [ ] **Step 1: Write failing test**

```ts
  it.effect("throw bit does not add entities", () =>
    Effect.gen(function* () {
      const match = yield* Match;
      const combat = yield* Combat;
      yield* seed(match, [fighter(1, 1, { input: InputBits.throw }), fighter(2, 2, { x: 40 })]);
      yield* combat.step();
      const state = yield* match.get();
      expect(state.fighters.length).toBe(2);
    }),
  );
```

This may already pass. If it passes on step 2, still add an explicit `if (justPressed throw) { /* no-op */ }` in Combat so the bit is documented, then commit.

- [ ] **Step 2: Run** `vp test src/Combat.test.ts`

- [ ] **Step 3: Implement no-op if needed**

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/sim/src/Combat.ts packages/sim/src/Combat.test.ts
git commit -m "feat(sim): unarmed throw does not spawn items"
```

---

### Task 8: SmallBrawlhaven fixture runs to a legal STOCK end

**Files:**

- Modify: `packages/sim/src/fixtures.test.ts`

**Interfaces:**

- Consumes: existing fixture load + `runReplay` / `create` + `runToEnd`
- Assert: `ended`, `scores.length === 2`, at least one fighter `lives === 0`
- Do **not** assert file `2–1` or `duration === 36208`
- Keep existing stats assertions on `create` (or split a second `it.effect` for `runToEnd` so stats test stays fast)

`runToEnd` can hit the 600s cap (`SimulationFault` `time cap`) if nobody KOs. That is a **test failure** to fix by iterating kinematics/combat — not by raising the cap. If it times out, debug jump/dodge/blastzones; do not skip.

Use `runReplay(replay)` with the same `Simulation.Default` + loaded tables/level as `create`. Read `snapshot` or `Match.get` after for lives. `runReplay` returns `{ duration, scores }` — also `yield* snapshot()` in the same provided layer:

```ts
const { results, snap } = yield* Effect.gen(function* () {
  const results = yield* runReplay(replay);
  const snap = yield* snapshot();
  return { results, snap };
}).pipe(Effect.provide(simLayer));
expect(snap.ended).toBe(true);
expect(results.scores.length).toBe(2);
expect(snap.fighters.some((f) => f.lives === 0)).toBe(true);
```

Export `snapshot` is already in `Simulation.ts`. Import `runReplay` and `snapshot` from `./Simulation.ts` or `./index.ts`.

- [ ] **Step 1: Write the failing fixture test** (second `it.effect` in the same `layer(Live)`)

- [ ] **Step 2: Run — expect FAIL** (time cap or never `ended`)

Run: `vp test src/fixtures.test.ts`

- [ ] **Step 3: Only if FAIL for a dump reason** — fix the smallest Fighter/Combat/Collision bug; do not weaken assertions

- [ ] **Step 4: PASS**

Run: `vp test src/fixtures.test.ts`

- [ ] **Step 5: Check and commit**

```bash
git add packages/sim/src/fixtures.test.ts
git commit -m "test(sim): SmallBrawlhaven fixture ends with a legal stock"
```

---

### Task 9: Full package verification

**Files:** none unless check/test fail

- [ ] **Step 1: Run** `vp test` in `packages/sim`  
  Expected: all tests pass (existing optional golden may still skip)

- [ ] **Step 2: Run** `vp check --fix` in `packages/sim`  
  Expected: format/lint/types clean

- [ ] **Step 3: Commit only if check rewrote files**

```bash
git add packages/sim
git commit -m "style(sim): apply vp check --fix after jumps kit"
```

---

## Spec coverage

| Spec requirement | Task |
| --- | --- |
| 14-bit mask + edges | 1 |
| Vertical walls | 2 |
| Ground / air / wall jump | 3 |
| Dodge, dash-jump, fast-fall, dodge invuln | 4 |
| Unarmed ItemType + PowerType fields | 5 (CSV, not XML) |
| `var_2268` kit | 6 |
| Throw no item | 7 |
| Fixture legal STOCK end | 8 |
| Spawns still rejected | unchanged `MatchRules` |
| No file `2–1` / duration golden | 8 |

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-16-sim-jumps-unarmed.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks

**2. Inline Execution** — run tasks in this session with executing-plans and checkpoints

Which approach?
