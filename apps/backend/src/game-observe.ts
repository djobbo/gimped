import { Effect } from "effect";
import { decodePayload } from "./decode.ts";
import type { GameChildPhase } from "./game-child-model.ts";
import type { TcpFrame } from "./framing.ts";
import { PacketType, nameForType } from "./packets.ts";

const INTRO_SYNC_TYPES = new Set<number>([
  PacketType.introPlayerSync,
  PacketType.introEntitySync,
  PacketType.introAuxSync,
]);

const QUIET_ACTIVE_TYPES = new Set<number>([
  PacketType.tickPulse,
  PacketType.inputBroadcast,
  PacketType.udpTunnel,
  PacketType.moveInput,
  ...INTRO_SYNC_TYPES,
]);

export const isIntroSyncType = (type: number): boolean => INTRO_SYNC_TYPES.has(type);

export const shouldLogGameFrame = (type: number, phase: GameChildPhase): boolean =>
  phase !== "activeMatch" || !QUIET_ACTIVE_TYPES.has(type);

export type ObservedGameFrame = {
  readonly summary: string;
  readonly known: boolean;
};

export const observeGameFrame = (frame: TcpFrame): ObservedGameFrame => {
  const decoded = decodePayload(frame.type, frame.payload);
  const known = decoded._tag !== "Unknown";
  const size = `${frame.payload.length} bytes`;
  const summary = `${nameForType(frame.type)} seq=${frame.seq ?? "-"} ${known ? decoded._tag : size}`;
  return { summary, known } satisfies ObservedGameFrame;
};

export const recordUnknownGamePacket = Effect.fn("recordUnknownGamePacket")(function* (args: {
  readonly dir: "client" | "server";
  readonly type: number;
  readonly payload: Uint8Array;
}) {
  yield* Effect.log(
    `game unknown ${args.dir} type=${args.type} ${nameForType(args.type)} ${args.payload.length} bytes`,
  );
});

let gameplayLogBudget = 8;

/** Always-on sparse gameplay logs (not throttled like tick/input frames). */
export const logGameplayEvent = Effect.fn("logGameplayEvent")(function* (message: string) {
  if (gameplayLogBudget <= 0) return;
  gameplayLogBudget -= 1;
  yield* Effect.log(`game gameplay: ${message}`);
});

export const resetGameplayLogBudget = () => {
  gameplayLogBudget = 8;
};
