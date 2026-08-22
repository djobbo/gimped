import { Match } from "effect";
import { BitWriter } from "./bitstream.ts";
import type { HandleFrameResult, TcpFrame } from "./messages.ts";
import { encodeLoginAccepted } from "./login-accepted.ts";
import { PacketType } from "./packets.ts";

/** Non-empty salt for LinkUpdater.method_6530 → class_139.var_14332. */
export const LOGIN_CHALLENGE = "gimped";

/** Login / keepalive only. Lobby create/join/settings live in room-replies + RoomRegistry. */
export const handleFrame = (frame: TcpFrame): HandleFrameResult =>
  Match.value(frame.type).pipe(
    Match.when(PacketType.clientVersion, () => {
      const bits = new BitWriter();
      bits.writeString(LOGIN_CHALLENGE);
      return {
        replies: [
          { type: PacketType.loginChallenge, seq: undefined, payload: bits.toUint8Array() },
        ],
      };
    }),
    Match.whenOr(PacketType.loginRequest, PacketType.loginRequestAlt, () => ({
      replies: [{ type: PacketType.loginAccepted, seq: undefined, payload: encodeLoginAccepted() }],
    })),
    Match.when(PacketType.keepalivePing, () => ({
      replies: [{ type: PacketType.keepalivePing, seq: undefined, payload: new Uint8Array() }],
    })),
    Match.orElse(() => ({ replies: [] })),
  );

export const repliesFor = (frame: TcpFrame): ReadonlyArray<TcpFrame> => handleFrame(frame).replies;
