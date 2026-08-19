import { Console, Effect } from "effect";
import { decodePayload } from "./decode.ts";
import type { TcpFrame } from "./framing.ts";
import { nameForType } from "./packets.ts";

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
  yield* Console.log(
    `game unknown ${args.dir} type=${args.type} ${nameForType(args.type)} ${args.payload.length} bytes`,
  );
});
