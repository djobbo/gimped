# Unarmed jumps, dodge, and kit — Design

Date: 2026-08-16  
Status: draft (written; pending user review)

Parent spec: `docs/superpowers/specs/2026-08-15-sim-engine-design.md`  
Package: `@gimped/sim` (`packages/sim`)  
Dump: `brawlhalla-src/dump` (not invented physics)

prefer Effect native modules; `Effect.gen` / `Effect.fn`; each sim module is a `Context.Service` layer.

Follow `.repos/effect/LLMS.md` and shipped `effect` / `@effect/*` `AGENTS.md`.

This is **spec 1 of 2**. Weapons, crates, gadgets, and spawn-on matches are **spec 2** (separate spec → plan → implementation). Do not implement spec 2 here.

## Goal

Extend the unarmed STOCK sim so a fighter can **jump, dodge/dash, fast-fall, use walls, and fire the full unarmed light/heavy/air kit** the way `class_123` / `class_288` / `ItemType` do.

Pass/fail:

- Unit tests copied from dump behavior (qualitative: left the floor, third air jump fails, nair ≠ nlight, and so on).
- Fixture `packages/sim/fixtures/[10.09] SmallBrawlhaven (4).replay`: load SWZ + replay, `runToEnd`, match **ended**, scores length 2. Legal STOCK for `startingLives: 1` means at least one 1v1 fighter has `lives === 0` (match already ended). Simultaneous KO (both 0) is allowed if `Stock` already allows it.
- **Do not** assert recorded `results.scores` `2–1` or `results.duration` `36208`. That replay decodes `startingLives: 1`; dump STOCK cannot produce three credited KOs on one life. Do not fudge lives and do not treat codec repair as in-scope.

Per-frame positions are still not a golden.

## Context (from dump)

| Role | Dump |
| --- | --- |
| Input dispatch | `class_288` (`var_2268`, `method_8993`, jump/dodge/throw edges) |
| Entity kinematics | `class_123` (`method_5226` jump, dodge/dash, `method_1152` fast-fall, wall) |
| Item → power slots | `ItemType.var_13565` (`PowerType_Combo1`, `_Forward`, `_Down`, `_Aerial*`, `_Smash*`) |
| Power timings / boxes | `PowerType.as` (`CastTime`, `RecoverTime`, `BaseDamage`, `FixedImpulse`, `FixedStunTime`, offsets/AoE) |
| Stats already in sim | `class_576` Speed `RunSpeed`, Strength `ImpulseMult`, Dexterity `RecoverMod` (`1 / xml`), Weight `Recovery` |

Replay 14-bit mask (held, recorded on change). This fixture’s rows use bits 16, 32, 64, 128, 256, 512 plus the direction nibble. Spec 1 implements actions for 16 / 64 / 128 / 256 / 512. Bit 32 is used inside `method_8993` as the neutral-vs-side check on the snapshot mask; do not start attacks on bit 32 alone. Taunt is a no-op.

### Input bits

| Bit | Dump | Sim `InputBits` |
| --- | --- | --- |
| 1 | up | `up` |
| 2 | down (fast-fall airborne; drop-through; dlight/dheavy direction) | `down` |
| 4 / 8 | left / right | `left` / `right` |
| 16 | `method_5226` jump | `jump` |
| 32 | used **inside** `method_8993` as neutral-vs-side on the snapshot mask | `attack` (inner check only; do not start attacks on 32) |
| 64 | `method_8993(..., param4=6)` heavy | `heavy` |
| 128 | `method_8993(..., param4=0)` light | `light` |
| 256 | `method_84` dodge | `dodge` |
| 512 | throw / `method_4771` | `throw` |

Edge detect: previous mask vs current mask on the fighter. No `class_288` 5–7 frame input buffer in this spec.

## Architecture

Tick graph **unchanged**: Clock → Input → Items stub → World → Fighter → Combat → Stock → Renderer.

No new service. `MatchRules` still rejects `weaponSpawnRateId !== 0` or `gadgetSpawnRateId !== 0`.

| Module | Change |
| --- | --- |
| `Input` | Apply the full 14-bit mask. Store previous mask on the fighter for edges. |
| `Fighter` | Jump (ground / air / wall / dash-jump), dodge/dash, fast-fall, wall cling. |
| `Collision` | Keep horizontal floors. Add **vertical** hard walls (`startX === endX`). |
| `Combat` | Select Unarmed powers via `var_2268`; timings from `Tables` PowerType rows. |
| `GameData` | Parse Unarmed `ItemType` slots + PowerType combat fields from `itemTypes.csv` / `powerTypes.csv` in `Game.swz` via `CsvCodec`. |
| `Items` | Still no-op. |
| Fixture test | Legal STOCK end; not file `2–1` / duration. |

Sloped SmallBrawlhaven roof is **out** unless a unit test cannot stand or wall-jump without it. Not a full `class_72` port.

## Fighter + Collision

Y-down. Existing constants stay: gravity `3.75` (`class_123.var_4334`), `DT = 0.384` (`class_50.var_12301`). Stun still blocks walk/jump/dodge starts the dump would block.

**Jump** (`method_5226`), bit 16 just pressed:

| Kind | When | Dump impulse |
| --- | --- | --- |
| Ground | On a floor | `vy` decreased by **57** |
| Dash-jump | Jump during a dash | **170**; \|vx\| cap **66** |
| Wall | Against / clinging to a vertical wall | vertical **53** (`class_123.var_14470` from `class_725`); horizontal **48** away from the wall |
| Air | Airborne and `airJumpsUsed < 2` | **57** (dump **65** when `param2` is true — copy that condition at implementation; do not invent a third jump) |

`method_2869` returns **2** air jumps. Landing on a floor resets `airJumpsUsed`. Speed `JumpXImpulse` (`var_10204`) applies the dump’s ground-jump horizontal nudge; default if the stat row is missing (`class_123.var_5185`).

**Dodge** (bit 64, just pressed): grounded + direction → dash. Air dodge duration, velocity, and cooldown are copied from `class_123` at implementation. If the dump skips hurt overlap during dodge, `Combat` must skip that victim for the same window.

**Fast-fall:** held down while airborne (`method_1152`). Extra downward speed from dump; do not invent a second gravity.

**Walls:** `Collision.wallAt(x, y)` (name may match dump style) for vertical hard lines. `Fighter` may cling and wall-jump.

**`FighterState` additions** (optional fields, defaults so existing walk tests stay valid): `airJumpsUsed`, dodge/dash timers, wall side, previous input mask.

## Combat + tables

Unarmed power index (`class_288.method_8993`):

```
var_2268 = [3, 1, 2, 6, 4, 5, 8, 11, 7, 10, 9, 9]
dir: down → 0, forward (left/right) → 2, else → 1
air: grounded → 0, airborne (`method_455`) → 3
param4: light → 0, heavy → 6
slot = var_2268[dir + param4 + air]
power name = Unarmed ItemType.var_13565[slot]
```

| Slot | `ItemType` XML | Kit |
| --- | --- | --- |
| 1 | `PowerType_Combo1` | nlight |
| 2 | `PowerType_Forward` | slight |
| 3 | `PowerType_Down` | dlight |
| 4 | `PowerType_Aerial` | nair |
| 5 | `PowerType_Aerial_Forward` | sair |
| 6 | `PowerType_Aerial_Down` | dair |
| 7 | `PowerType_Smash_Forward` | sheavy |
| 8 | `PowerType_Smash_Down` | dheavy |
| 11 | `PowerType_Smash_Neutral` | nheavy |
| 9 | `PowerType_Smash_Aerial_Up` | air heavy up |
| 10 | `PowerType_Smash_Aerial_Down` | air heavy down |

`GameData` parses those names on the Unarmed `ItemType` and the `PowerType` fields Combat already uses for nlight (`CastTime`, `RecoverTime`, `BaseDamage`, `FixedImpulse`, `FixedStunTime`, center/AoE/impulse offsets). `Combat` looks up the selected row instead of hardcoded BaseNeutral.

**Throw (bit 512, just pressed):** dump throw path. With `Items` stub and spawns off, pickup misses. If Unarmed defines a throw power, use it; otherwise throw is a no-op. Do not spawn weapons.

**OnHit:** keep Strength `ImpulseMult`, Dexterity `RecoverMod` on recover frames, Weight `Recovery` during stunned airborne knockback. Full `class_78.method_778` damage% formula is **out** unless a unit test cannot tell two heavies apart without it.

**Gravity cancel:** dodge then light/heavy in air if the dump allows attacking out of dodge. No separate GC flag.

Signatures that require a **held weapon** are out (spec 2). Unarmed heavies are in.

## Errors

Same tagged errors as the parent spec.

| Tag | Spec 1 |
| --- | --- |
| `UnsupportedMatch` | Unchanged: not STOCK; not 1v1/2v2; strikeout; weapon/gadget spawns on |
| `MissingTables` | Also: Unarmed `ItemType` missing, or a required `PowerType_*` / PowerType row missing |
| `MissingCollision` | Unchanged (no usable XML lines for `level.id`) |
| `SimulationFault` | Unchanged (NaN, unknown `entityId`) |

Recorded replay `2–1` / `36208` is not an error and not a test assertion.

## Testing

`@effect/vitest` `it.effect`. Dump numbers in comments. Assert qualitative behavior so exact copied constants can stay dump-accurate.

- **Input:** bits 16, 32, 64, 256, 512 round-trip; omitted `input` still clears the mask.
- **Fighter:** ground jump leaves the floor (`vy < 0`); two air jumps succeed, a third does not; wall jump requires a vertical line and pushes away from it; dash-jump uses the 170 branch while dashing; fast-fall is faster downward than gravity-only; dodge/dash starts on bit 64.
- **Collision:** vertical `wallAt`; existing floor tests stay green.
- **Combat:** existing nlight overlap test stays green; slight / dlight / nair / sair / dair / nheavy select **different** Unarmed PowerType names; recover still scales with `recoverMod`.
- **Throw:** bit 512 does not add an item entity; no `SimulationFault`.
- **Integration:** existing 1v1 / 2v2 blastzone tests stay green.
- **Fixture:** `fixtures.test.ts` loads the committed SmallBrawlhaven replay + `packages/swz/fixtures`, `runToEnd`, `ended === true`, `scores.length === 2`, at least one fighter `lives === 0`. Do not assert file scores or duration.

## Out of scope (spec 2 or later)

- Weapons, weapon crates, gadgets, world item spawns
- Held-weapon signatures
- `class_288` 5–7 frame input buffer
- Full `class_72` / sloped collision (unless a spec-1 unit test forces a slope)
- Replay codec fix for `startingLives` vs recorded `2–1`
- Frame-perfect position goldens
- Renderer beyond the existing stub
- TIMED / FFA / strikeout

## Success criteria

1. Jump / dodge / dash / fast-fall / wall-jump unit tests pass against dump behavior.
2. Unarmed directional lights, airs, and heavies resolve through `var_2268` + Unarmed `ItemType` + `PowerType` tables.
3. SmallBrawlhaven fixture runs to a legal STOCK end; file `2–1` / duration are not asserted.
4. Weapon/gadget spawns still `UnsupportedMatch`.
5. `vp check --fix` and `vp test` pass in `packages/sim`.

## Implementation note

Sequence: InputBits + edge mask → Collision vertical walls → Fighter jump/air/wall → dodge/dash + fast-fall → GameData ItemType/PowerType fields → Combat `var_2268` kit → throw no-op → fixture legal-end assertion. Copy every impulse, timer, and slot from dump at the task that introduces it.
