import { Context, Effect, Layer } from "effect";
import { Collision } from "./Collision.ts";
import type { CollisionLine } from "./domain.ts";
import { InputBits } from "./domain.ts";
import type { SimulationFault } from "./errors.ts";
import { Match } from "./Match.ts";

/** Dump `class_123.var_4334` — entity gravity (Y-down). */
const GRAVITY = 3.75;
/** Dump `class_50.var_12301` — per-frame physics scale. */
const DT = 0.384;
/** Dump `class_123.var_2919` / `class_576` Speed.RunSpeed default. */
const GROUND_SPEED = 30;
/** Dump `class_123.var_8994` / `class_576` Weight.Recovery default. */
const DEFAULT_RECOVERY = 4;
/** Dump `class_123.method_5226` / `var_8735` — ground jump impulse. */
const JUMP_GROUND = 57;
/** Dump `class_123.method_5226` / `var_8735` — air jump impulse. */
const JUMP_AIR = 57;
/** Dump `class_123.method_5226` / `class_725.var_14470` — wall jump Y. */
const JUMP_WALL_Y = 53;
/** Dump `class_123.method_5226` / `var_8456` — wall jump X away. */
const JUMP_WALL_X = 48;
/** Dump `class_123.method_2869` — max air jumps. */
const AIR_JUMPS = 2;
/** Dump `class_123.method_5226` dash branch — dash-jump Y impulse. */
const JUMP_DASH = 170;
/** Dump `class_123.method_5226` dash branch — max |vx| after dash-jump. */
const JUMP_DASH_VX_CAP = 66;
/** Dump `class_123.as:3656-3658` — default max fall speed. */
const FALL_SPEED_CAP = 70;
/** Dump `class_123.as:3656-3658` — fast-fall max while holding down. */
const FALL_SPEED_CAP_FAST = 85;
/** Dump `DodgeType` `StandardSpot` grounded no-side duration. */
const DODGE_GROUND_SPOT = 18;
/** Dump `DodgeType` `StandardSide` grounded/air side duration. */
const DODGE_SIDE = 14;
/** Dump `DodgeType` `AerialSpot` airborne no-side duration. */
const DODGE_AIR_SPOT = 22;

const lineTop = (line: CollisionLine) => Math.min(line.startY, line.endY);

export class Fighter extends Context.Service<
  Fighter,
  {
    readonly step: () => Effect.Effect<void, SimulationFault>;
  }
>()("@gimped/sim/Fighter") {
  static readonly layer = Layer.effect(
    Fighter,
    Effect.gen(function* () {
      const match = yield* Match;
      const collision = yield* Collision;

      const step = Effect.fn("Fighter.step")(function* () {
        const state = yield* match.get();

        for (const fighter of state.fighters) {
          // Dump `class_288`: gravity+fall cap → method_84 (dodge) → method_5226 (jump).
          const bits = fighter.input ?? 0;
          const prevBits = fighter.prevInput ?? 0;

          if (!fighter.grounded) {
            // Dump `class_123` integrate: `vy += var_4334 * class_50.var_12301`.
            fighter.vy += GRAVITY * DT;
            if (fighter.stun > 0) {
              // Dump `class_123.method_3493`: length -= Recovery * DT, then normalize.
              const recovery = fighter.recovery ?? DEFAULT_RECOVERY;
              const len = Math.hypot(fighter.vx, fighter.vy);
              const next = len - recovery * DT;
              if (len > 0 && next > 0) {
                const scale = next / len;
                fighter.vx *= scale;
                fighter.vy *= scale;
              } else {
                fighter.vx = 0;
                fighter.vy = 0;
              }
            }
            // Dump `class_123.as:3656-3658` — fall-speed cap after gravity, before dodge/jump.
            const fallCap = (bits & InputBits.down) !== 0 ? FALL_SPEED_CAP_FAST : FALL_SPEED_CAP;
            if (fighter.vy > fallCap) {
              fighter.vy = fallCap;
            }
          }

          // Dump `class_123.method_84` — dodge on just-pressed bit 256 (before jump).
          let dodgeStarted = false;
          if ((fighter.dodgeFrames ?? 0) > 0) {
            fighter.dodgeFrames = (fighter.dodgeFrames ?? 0) - 1;
            if (fighter.dodgeFrames === 0) {
              fighter.dashing = false;
            }
          } else {
            const dodgePressed =
              (bits & InputBits.dodge) !== 0 && (prevBits & InputBits.dodge) === 0;
            if (dodgePressed && fighter.stun <= 0 && !fighter.ko) {
              const holdingSide = (bits & InputBits.left) !== 0 || (bits & InputBits.right) !== 0;
              if (fighter.grounded) {
                fighter.dodgeFrames = holdingSide ? DODGE_SIDE : DODGE_GROUND_SPOT;
                if (holdingSide) {
                  fighter.dashing = true;
                }
              } else {
                fighter.dodgeFrames = holdingSide ? DODGE_SIDE : DODGE_AIR_SPOT;
              }
              // Dump `class_123.as:8778-8780` — zero velocity on dodge start.
              fighter.vx = 0;
              fighter.vy = 0;
              if (holdingSide) {
                const speed = fighter.runSpeed ?? GROUND_SPEED;
                if ((bits & InputBits.left) !== 0) {
                  fighter.vx = -speed;
                } else if ((bits & InputBits.right) !== 0) {
                  fighter.vx = speed;
                }
              }
              dodgeStarted = true;
            }
          }

          // Dump `class_123.method_5226` — jump on just-pressed bit 16; skipped if dodge started.
          const jumpPressed = (bits & InputBits.jump) !== 0 && (prevBits & InputBits.jump) === 0;
          let wallJumped = false;
          if (jumpPressed && !dodgeStarted && fighter.stun <= 0 && !fighter.ko) {
            const wall = yield* collision.wallAt(fighter.x, fighter.y);
            fighter.wallSide = wall !== undefined ? (fighter.x >= wall.startX ? 1 : -1) : 0;

            if (fighter.grounded) {
              if (fighter.dashing) {
                // Dump `class_123.method_5226` dash branch.
                fighter.vy -= JUMP_DASH;
                if (fighter.vx > JUMP_DASH_VX_CAP) {
                  fighter.vx = JUMP_DASH_VX_CAP;
                } else if (fighter.vx < -JUMP_DASH_VX_CAP) {
                  fighter.vx = -JUMP_DASH_VX_CAP;
                }
              } else {
                fighter.vy -= JUMP_GROUND;
              }
              fighter.grounded = false;
            } else if (fighter.wallSide !== 0) {
              fighter.vy -= JUMP_WALL_Y;
              fighter.vx = -JUMP_WALL_X * fighter.wallSide;
              fighter.grounded = false;
              wallJumped = true;
            } else if ((fighter.airJumpsUsed ?? 0) < AIR_JUMPS) {
              fighter.vy -= JUMP_AIR;
              fighter.airJumpsUsed = (fighter.airJumpsUsed ?? 0) + 1;
              fighter.grounded = false;
            }
          }

          const line = yield* collision.groundAt(fighter.x, fighter.y, fighter.vy);
          const nextY = fighter.y + fighter.vy * DT;
          const holdingDown = ((fighter.input ?? 0) & InputBits.down) !== 0;
          const dropThrough = line !== undefined && line.type === 2 && holdingDown;
          const wasGrounded = fighter.grounded;

          if (line !== undefined && nextY >= lineTop(line) && !dropThrough) {
            fighter.y = lineTop(line);
            fighter.vy = 0;
            fighter.grounded = true;
            if (!wasGrounded) {
              fighter.airJumpsUsed = 0;
            }
          } else {
            fighter.y = nextY;
            fighter.grounded = false;
          }

          const stunned = fighter.stun > 0;
          if (stunned) {
            fighter.stun -= 1;
          } else {
            const speed = fighter.runSpeed ?? GROUND_SPEED;
            if ((bits & InputBits.left) !== 0) {
              fighter.x -= speed * DT;
              if (!wallJumped) {
                fighter.vx = -speed;
              }
              fighter.facingLeft = true;
            }
            if ((bits & InputBits.right) !== 0) {
              fighter.x += speed * DT;
              if (!wallJumped) {
                fighter.vx = speed;
              }
              fighter.facingLeft = false;
            }
          }

          if (fighter.grounded) {
            const still = yield* collision.groundAt(fighter.x, fighter.y, fighter.vy);
            if (still === undefined) {
              fighter.grounded = false;
            }
          }
        }
      });

      return Fighter.of({ step });
    }),
  );
}
