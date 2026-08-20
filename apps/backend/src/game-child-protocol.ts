import { decodeGameConnect } from "./game-connect.ts";
import { decodeIntroEntitySync } from "./game-intro-sync.ts";
import { decodeGameInput, type GameInput } from "./game-input.ts";
import type { GameChildPhase, GameChildState } from "./game-child-model.ts";
import { buildInitialSync, buildLevelReadySync, decodePostConnectAck } from "./game-sync.ts";
import type { TcpFrame } from "./framing.ts";
import { encodeMatchSetup, matchSetupOptionsFromSpec } from "./match-setup.ts";
import { PacketType } from "./packets.ts";
import type { MatchSetupSpec } from "./match-spec.ts";

export type GameProtocolAction =
  | { readonly _tag: "Reply"; readonly frames: ReadonlyArray<TcpFrame> }
  | { readonly _tag: "Close" };

export type GameProtocolSpec = {
  readonly userId: number;
  readonly token: string;
  readonly includeBot: boolean;
  readonly setup: MatchSetupSpec;
};

export type ProtocolIngestResult = {
  readonly action: GameProtocolAction;
  readonly nextPhase?: GameChildPhase;
  readonly input?: GameInput;
  readonly introSync?: boolean;
  readonly introClientSimTick?: number;
  readonly unknownGameplay?: { readonly type: number; readonly payload: Uint8Array };
};

export const protocolActionFor = (frame: TcpFrame, spec: GameProtocolSpec): GameProtocolAction =>
  protocolIngest(frame, spec, {
    phase: "syncingIntoMatch",
    includeBot: spec.includeBot,
    connected: true,
    tick: 0,
    clientTick: 0,
    clientSimTick: 0,
    simReady: false,
    entities: [],
    entityInputs: {},
    inputQueue: [],
    udpAckSeq: 0,
    udpSendSeq: 0,
    udpSessionId: 0,
    lastIntroSyncAtMs: 0,
    lastTickAdvanceAtMs: 0,
    enteredActiveMatchAtMs: 0,
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
              payload: encodeMatchSetup(matchSetupOptionsFromSpec(spec.setup)),
            },
            ...buildInitialSync(state, { sessionToken: spec.token }),
          ],
        },
      };
    } catch {
      return { action: { _tag: "Close" } };
    }
  }
  if (
    (frame.type === PacketType.levelReady || frame.type === PacketType.postConnectAck) &&
    state.phase === "syncingIntoMatch"
  ) {
    if (frame.type === PacketType.postConnectAck) {
      decodePostConnectAck(frame.payload);
    }
    return {
      action: {
        _tag: "Reply",
        frames: buildLevelReadySync(state, { sessionToken: spec.token }),
      },
      nextPhase: "activeMatch",
    };
  }
  if (frame.type === PacketType.postConnectAck && state.phase === "activeMatch") {
    decodePostConnectAck(frame.payload);
    return { action: { _tag: "Reply", frames: [] } };
  }
  if (
    frame.type === PacketType.introPlayerSync ||
    frame.type === PacketType.introEntitySync ||
    frame.type === PacketType.introAuxSync
  ) {
    const introEntity =
      frame.type === PacketType.introEntitySync ? decodeIntroEntitySync(frame.payload) : undefined;
    return {
      action: { _tag: "Reply", frames: [] },
      introSync: true,
      introClientSimTick: introEntity?.active === true ? introEntity.clientSimTick : undefined,
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
