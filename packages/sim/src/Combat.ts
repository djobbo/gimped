import { Context, Effect, Layer } from "effect";
import { InputBits, type FighterState } from "./domain.ts";
import type { SimulationFault } from "./errors.ts";
import { Fighter } from "./Fighter.ts";
import { Match } from "./Match.ts";
import { Rng } from "./Rng.ts";
import { Tables } from "./Tables.ts";

/**
 * Dump `class_288.as:1298` — `(param2 & 32) != 0` sets `_loc16_ = 1`.
 * `class_288.as:37` `var_2268 = [3,1,2,6,4,5,8,11,7,10,9,9]`; grounded nlight
 * index `_loc16_ + param4 + _loc15_ = 1` → `var_2268[1] = 1`.
 * `class_80.method_2245` loads `ItemType.var_13565[1]` (`PowerType_Combo1`).
 * Unarmed `itemTypes.csv` `PowerType_Combo1=BaseNeutral` (PowerID 1).
 *
 * `stockTables().powers` is empty — timings/damage/impulse are BaseNeutral
 * `powerTypes.csv` fields parsed by `PowerType.as` (`CastTime`, `RecoverTime`,
 * `BaseDamage`, `FixedImpulse`, `FixedStunTime`, `AoERadius*`, `CenterOffset*`).
 */
/** `CastTime` `5:2@2-2` — `_loc44_=5` startup, `_loc45_=2` active (`PowerType.as:1548`). */
const UNARMED_NLIGHT_STARTUP = 5;
const UNARMED_NLIGHT_ACTIVE = 2;
/** `RecoverTime` (`PowerType.as:2309`). */
const UNARMED_NLIGHT_RECOVER = 3;
/** `BaseDamage` (`PowerType.as:1459`). */
const UNARMED_NLIGHT_DAMAGE = 3;
/** `FixedImpulse` (`PowerType.as:1915`). `VariableImpulse` is 0. */
const UNARMED_NLIGHT_FIXED_IMPULSE = 25;
/** `ImpulseOffsetX` / `ImpulseOffsetY` — OnHit direction before normalize. */
const UNARMED_NLIGHT_IMPULSE_OFFSET_X = 100;
const UNARMED_NLIGHT_IMPULSE_OFFSET_Y = -48;
/** `FixedStunTime` (`PowerType.as:1942`); dump applies `* 16` ms (`class_78.as:853`). */
const UNARMED_NLIGHT_STUN = 17;
/** `CenterOffsetX` / `CenterOffsetY` / `AoERadiusX` / `AoERadiusY`. */
const UNARMED_NLIGHT_CENTER_OFFSET_X = 76;
const UNARMED_NLIGHT_CENTER_OFFSET_Y = 4;
const UNARMED_NLIGHT_AOE_X = 45;
const UNARMED_NLIGHT_AOE_Y = 33;

type Box = { left: number; right: number; top: number; bottom: number };

const hurtbox = (fighter: FighterState): Box => ({
  // Feet origin, y-down: `top = y - hurtH`. Dump `class_206` DEFAULT is 145×160
  // (`hurtboxTypes.csv`); synthetic fighters use fixtures 50×80.
  left: fighter.x - fighter.hurtW / 2,
  right: fighter.x + fighter.hurtW / 2,
  top: fighter.y - fighter.hurtH,
  bottom: fighter.y,
});

const hitbox = (fighter: FighterState): Box => {
  const sign = fighter.facingLeft ? -1 : 1;
  const cx = fighter.x + UNARMED_NLIGHT_CENTER_OFFSET_X * sign;
  const cy = fighter.y + UNARMED_NLIGHT_CENTER_OFFSET_Y;
  return {
    left: cx - UNARMED_NLIGHT_AOE_X,
    right: cx + UNARMED_NLIGHT_AOE_X,
    top: cy - UNARMED_NLIGHT_AOE_Y,
    bottom: cy + UNARMED_NLIGHT_AOE_Y,
  };
};

const overlaps = (a: Box, b: Box): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const applyOnHitImpulse = (attacker: FighterState, victim: FighterState): void => {
  const ox = attacker.facingLeft
    ? -UNARMED_NLIGHT_IMPULSE_OFFSET_X
    : UNARMED_NLIGHT_IMPULSE_OFFSET_X;
  const oy = UNARMED_NLIGHT_IMPULSE_OFFSET_Y;
  const len = Math.hypot(ox, oy);
  // `class_123.OnHit` (`class_123.as:6598`) queues dir; `class_122.as:29` is the interface.
  // `class_78.method_4558` (`:840`) `param7.normalize(impulse)`; `method_5949` (`:1080`)
  // zeros vx/vy then writes the scaled point.
  victim.vx = (UNARMED_NLIGHT_FIXED_IMPULSE * ox) / len;
  victim.vy = (UNARMED_NLIGHT_FIXED_IMPULSE * oy) / len;
};

export class Combat extends Context.Service<
  Combat,
  {
    readonly step: () => Effect.Effect<void, SimulationFault>;
  }
>()("@gimped/sim/Combat") {
  static readonly layer = Layer.effect(
    Combat,
    Effect.gen(function* () {
      const match = yield* Match;
      yield* Fighter;
      yield* Rng;
      yield* Tables;

      const hitThisPower = new Map<number, Set<number>>();

      const step = Effect.fn("Combat.step")(function* () {
        const state = yield* match.get();

        for (const attacker of state.fighters) {
          if (attacker.ko) {
            continue;
          }

          let frames = attacker.attackFrames ?? 0;
          if (frames === 0) {
            const bits = attacker.input ?? 0;
            if (attacker.grounded && (bits & InputBits.attack) !== 0) {
              frames = 1;
              hitThisPower.set(attacker.entityId, new Set());
            }
          } else {
            frames += 1;
            if (frames > UNARMED_NLIGHT_STARTUP + UNARMED_NLIGHT_ACTIVE + UNARMED_NLIGHT_RECOVER) {
              attacker.attackFrames = 0;
              hitThisPower.delete(attacker.entityId);
              continue;
            }
          }
          attacker.attackFrames = frames;
          if (frames === 0) {
            continue;
          }

          const inActive =
            frames > UNARMED_NLIGHT_STARTUP &&
            frames <= UNARMED_NLIGHT_STARTUP + UNARMED_NLIGHT_ACTIVE;
          if (!inActive) {
            continue;
          }

          const atkBox = hitbox(attacker);
          const hitSet = hitThisPower.get(attacker.entityId) ?? new Set<number>();
          for (const victim of state.fighters) {
            if (victim.entityId === attacker.entityId || victim.ko) {
              continue;
            }
            if (victim.team === attacker.team) {
              continue;
            }
            if (hitSet.has(victim.entityId)) {
              continue;
            }
            if (!overlaps(atkBox, hurtbox(victim))) {
              continue;
            }

            victim.damage += UNARMED_NLIGHT_DAMAGE;
            applyOnHitImpulse(attacker, victim);
            victim.stun = UNARMED_NLIGHT_STUN;
            victim.lastHitBy = attacker.entityId;
            hitSet.add(victim.entityId);
            hitThisPower.set(attacker.entityId, hitSet);
          }
        }
      });

      return Combat.of({ step });
    }),
  );
}
