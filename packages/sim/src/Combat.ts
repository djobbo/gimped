import { Context, Effect, Layer } from "effect";
import { InputBits, type FighterState, type PowerRow } from "./domain.ts";
import type { SimulationFault } from "./errors.ts";
import { Fighter } from "./Fighter.ts";
import { Match } from "./Match.ts";
import { Rng } from "./Rng.ts";
import { Tables } from "./Tables.ts";

/**
 * Dump `class_288.as:37` — slot index from dir + heavy offset + air offset.
 * Unarmed slots via `ItemType` / `itemTypes.csv`; power names → `powerTypes.csv`.
 */
const VAR_2268 = [3, 1, 2, 6, 4, 5, 8, 11, 7, 10, 9, 9] as const;

/**
 * Fallback when a PowerRow field is missing — BaseNeutral dump numbers
 * (`powerTypes.csv` / `PowerType.as` CastTime `5:2@2-2`, etc.).
 */
const FALLBACK = {
  startup: 5,
  active: 2,
  recover: 3,
  damage: 3,
  fixedImpulse: 25,
  stun: 17,
  centerOffsetX: 76,
  centerOffsetY: 4,
  aoeX: 45,
  aoeY: 33,
  impulseOffsetX: 100,
  impulseOffsetY: -48,
} as const;

type Box = { left: number; right: number; top: number; bottom: number };

const justPressed = (bits: number, prev: number, bit: number): boolean =>
  (bits & bit) !== 0 && (prev & bit) === 0;

const selectSlot = (fighter: FighterState, heavy: boolean): number => {
  const bits = fighter.input ?? 0;
  const dir =
    (bits & InputBits.down) !== 0 ? 0 : (bits & (InputBits.left | InputBits.right)) !== 0 ? 2 : 1;
  const air = fighter.grounded ? 0 : 3;
  const param4 = heavy ? 6 : 0;
  return VAR_2268[dir + param4 + air]!;
};

const hurtbox = (fighter: FighterState): Box => ({
  // Feet origin, y-down: `top = y - hurtH`. Dump `class_206` DEFAULT is 145×160
  // (`hurtboxTypes.csv`); synthetic fighters use fixtures 50×80.
  left: fighter.x - fighter.hurtW / 2,
  right: fighter.x + fighter.hurtW / 2,
  top: fighter.y - fighter.hurtH,
  bottom: fighter.y,
});

const hitbox = (fighter: FighterState, power: PowerRow): Box => {
  const sign = fighter.facingLeft ? -1 : 1;
  const cx = fighter.x + (power.centerOffsetX ?? FALLBACK.centerOffsetX) * sign;
  const cy = fighter.y + (power.centerOffsetY ?? FALLBACK.centerOffsetY);
  const aoeX = power.aoeX ?? FALLBACK.aoeX;
  const aoeY = power.aoeY ?? FALLBACK.aoeY;
  return {
    left: cx - aoeX,
    right: cx + aoeX,
    top: cy - aoeY,
    bottom: cy + aoeY,
  };
};

const overlaps = (a: Box, b: Box): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const applyOnHitImpulse = (attacker: FighterState, victim: FighterState, power: PowerRow): void => {
  const oxRaw = power.impulseOffsetX ?? FALLBACK.impulseOffsetX;
  const oy = power.impulseOffsetY ?? FALLBACK.impulseOffsetY;
  const ox = attacker.facingLeft ? -oxRaw : oxRaw;
  const len = Math.hypot(ox, oy);
  // `class_123.OnHit` (`class_123.as:6598`) queues dir; `class_122.as:29` is the interface.
  // `class_78.method_4558` (`:840`) `param7.normalize(impulse)`; `method_5949` (`:1080`)
  // zeros vx/vy then writes the scaled point.
  // `class_78.method_778` (`:652`) scales by attacker Strength `ImpulseMult` (`var_5838`).
  const impulse = (power.fixedImpulse ?? FALLBACK.fixedImpulse) * (attacker.impulseMult ?? 1);
  victim.vx = (impulse * ox) / len;
  victim.vy = (impulse * oy) / len;
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
      const tables = yield* Tables;

      const hitThisPower = new Map<number, Set<number>>();

      const step = Effect.fn("Combat.step")(function* () {
        const state = yield* match.get();
        const unarmed = tables.items.get("Unarmed");

        for (const attacker of state.fighters) {
          if (attacker.ko) {
            continue;
          }

          let frames = attacker.attackFrames ?? 0;
          if (frames === 0) {
            const bits = attacker.input ?? 0;
            const prev = attacker.prevInput ?? 0;
            const lightEdge = justPressed(bits, prev, InputBits.light);
            const heavyEdge = justPressed(bits, prev, InputBits.heavy);
            if (!lightEdge && !heavyEdge) {
              continue;
            }
            if (unarmed === undefined) {
              continue;
            }
            const slot = selectSlot(attacker, heavyEdge);
            const powerName = unarmed.slots.get(slot);
            if (powerName === undefined) {
              continue;
            }
            if ((bits & InputBits.left) !== 0) {
              attacker.facingLeft = true;
            } else if ((bits & InputBits.right) !== 0) {
              attacker.facingLeft = false;
            }
            attacker.attackPower = powerName;
            frames = 1;
            hitThisPower.set(attacker.entityId, new Set());
          } else {
            frames += 1;
            const power =
              attacker.attackPower !== undefined
                ? tables.powersByName.get(attacker.attackPower)
                : undefined;
            const startup = power?.startup ?? FALLBACK.startup;
            const active = power?.active ?? FALLBACK.active;
            // Dump `class_630.as:1341` RecoverTime * Dexterity RecoverMod (`var_1056`).
            const recover = Math.floor(
              (power?.recover ?? FALLBACK.recover) * (attacker.recoverMod ?? 1),
            );
            if (frames > startup + active + recover) {
              attacker.attackFrames = 0;
              attacker.attackPower = undefined;
              hitThisPower.delete(attacker.entityId);
              continue;
            }
          }
          attacker.attackFrames = frames;
          if (frames === 0) {
            continue;
          }

          const power =
            attacker.attackPower !== undefined
              ? tables.powersByName.get(attacker.attackPower)
              : undefined;
          const startup = power?.startup ?? FALLBACK.startup;
          const active = power?.active ?? FALLBACK.active;
          const inActive = frames > startup && frames <= startup + active;
          if (!inActive || power === undefined) {
            continue;
          }

          const atkBox = hitbox(attacker, power);
          const hitSet = hitThisPower.get(attacker.entityId) ?? new Set<number>();
          for (const victim of state.fighters) {
            if (victim.entityId === attacker.entityId || victim.ko) {
              continue;
            }
            if (victim.team === attacker.team) {
              continue;
            }
            if ((victim.dodgeFrames ?? 0) > 0) {
              continue;
            }
            if (hitSet.has(victim.entityId)) {
              continue;
            }
            if (!overlaps(atkBox, hurtbox(victim))) {
              continue;
            }

            victim.damage += power.damage ?? FALLBACK.damage;
            applyOnHitImpulse(attacker, victim, power);
            victim.stun = power.stun ?? FALLBACK.stun;
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
