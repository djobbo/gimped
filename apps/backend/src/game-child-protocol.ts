import { decodeGameConnect } from "./game-connect.ts";
import { decodeGameInput, type GameInput } from "./game-input.ts";
import type { GameChildPhase, GameChildState } from "./game-child-model.ts";
import { buildInitialSync, decodePostConnectAck } from "./game-sync.ts";
import type { TcpFrame } from "./framing.ts";
import { encodeMatchSetup } from "./match-setup.ts";
import { PacketType } from "./packets.ts";

export type GameProtocolAction =
  | { readonly _tag: "Reply"; readonly frames: ReadonlyArray<TcpFrame> }
  | { readonly _tag: "Close" };

export type GameProtocolSpec = {
  readonly userId: number;
  readonly token: string;
  readonly includeBot: boolean;
};

export type ProtocolIngestResult = {
  readonly action: GameProtocolAction;
  readonly nextPhase?: GameChildPhase;
  readonly input?: GameInput;
  readonly unknownGameplay?: { readonly type: number; readonly payload: Uint8Array };
};

export const protocolActionFor = (frame: TcpFrame, spec: GameProtocolSpec): GameProtocolAction =>
  protocolIngest(frame, spec, {
    phase: "syncingIntoMatch",
    includeBot: spec.includeBot,
    connected: true,
    tick: 0,
    clientTick: 0,
    simReady: false,
    entities: [],
  }).action;

export const protocolIngest = (
  frame: TcpFrame,
  spec: GameProtocolSpec,
  state: GameChildState,
): ProtocolIngestResult => {
  if (frame.type === PacketType.keepalivePing) {
    return {
      action: {
        _tag: "Reply",
        frames: [{ type: PacketType.keepalivePing, seq: undefined, payload: new Uint8Array() }],
      },
    };
  }
  if (frame.type === PacketType.gameConnect && state.phase === "syncingIntoMatch") {
    try {
      const hello = decodeGameConnect(frame.payload);
      if (hello.userId !== spec.userId || hello.token !== spec.token) {
        return { action: { _tag: "Close" } };
      }
      return {
        action: {
          _tag: "Reply",
          frames: [
            {
              type: PacketType.matchSetup,
              seq: undefined,
              payload: encodeMatchSetup({ includeBot: spec.includeBot }),
            },
            ...buildInitialSync(state, { sessionToken: spec.token }),
          ],
        },
      };
    } catch {
      return { action: { _tag: "Close" } };
    }
  }
  if (frame.type === PacketType.postConnectAck && state.phase === "syncingIntoMatch") {
    decodePostConnectAck(frame.payload);
    return {
      action: { _tag: "Reply", frames: [] },
      nextPhase: "activeMatch",
    };
  }
  if (state.phase === "activeMatch") {
    const input = decodeGameInput(frame.type, frame.payload);
    if (input !== undefined) {
      return { action: { _tag: "Reply", frames: [] }, input };
    }
    return {
      action: { _tag: "Reply", frames: [] },
      unknownGameplay: { type: frame.type, payload: frame.payload },
    };
  }
  return { action: { _tag: "Reply", frames: [] } };
};
