import { decodeGameConnect } from "./game-connect.ts";
import type { TcpFrame } from "./framing.ts";
import { encodeMatchSetup } from "./match-setup.ts";
import { PacketType } from "./packets.ts";

export type GameAction =
  | { readonly _tag: "Reply"; readonly frames: ReadonlyArray<TcpFrame> }
  | { readonly _tag: "Close" };

export const gameActionFor = (
  frame: TcpFrame,
  spec: { readonly userId: number; readonly token: string; readonly includeBot: boolean },
): GameAction => {
  if (frame.type === PacketType.keepalivePing) {
    return {
      _tag: "Reply",
      frames: [{ type: PacketType.keepalivePing, seq: undefined, payload: new Uint8Array() }],
    };
  }
  if (frame.type === PacketType.gameConnect) {
    try {
      const hello = decodeGameConnect(frame.payload);
      if (hello.userId !== spec.userId || hello.token !== spec.token) return { _tag: "Close" };
      return {
        _tag: "Reply",
        frames: [
          {
            type: PacketType.matchSetup,
            seq: undefined,
            payload: encodeMatchSetup({ includeBot: spec.includeBot }),
          },
        ],
      };
    } catch {
      return { _tag: "Close" };
    }
  }
  return { _tag: "Reply", frames: [] };
};
