import { Match } from "effect";
import { decodeGameConnect } from "./game-connect.ts";
import { decodeIntroEntitySync } from "./game-intro-sync.ts";
import { decodeGameInput } from "./game-input.ts";
import type { GameChildState } from "./game-child-model.ts";
import { buildLevelReadySync, buildQuitSync, decodePostConnectAck } from "./game-sync.ts";
import type { GameProtocolAction, ProtocolIngestResult, TcpFrame } from "./messages.ts";
import { encodeMatchSetup, matchSetupOptionsFromSpec } from "./match-setup.ts";
import { PacketType } from "./packets.ts";
import type { MatchSetupSpec } from "./match-spec.ts";

export type GameProtocolSpec = {
  readonly userId: number;
  readonly token: string;
  readonly levelId: number;
  readonly includeBot: boolean;
  readonly setup: MatchSetupSpec;
};

const validateHello = (
  frame: TcpFrame,
  spec: GameProtocolSpec,
  state: GameChildState,
): { readonly ok: true; readonly userId: number } | { readonly ok: false } => {
  try {
    const hello = decodeGameConnect(frame.payload);
    if (hello.token !== spec.token) {
      return { ok: false };
    }
    if (hello.userId === spec.userId || state.disconnectedUserIds.includes(hello.userId)) {
      return { ok: true, userId: hello.userId };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
};

const replyMatchSetup = (spec: GameProtocolSpec): ProtocolIngestResult => {
  const payload = encodeMatchSetup(matchSetupOptionsFromSpec(spec.setup, spec.levelId));
  return {
    action: {
      _tag: "Reply",
      frames: [
        {
          type: PacketType.matchSetup,
          seq: undefined,
          payload,
        },
      ],
    },
  };
};

export const protocolActionFor = (frame: TcpFrame, spec: GameProtocolSpec): GameProtocolAction =>
  protocolIngest(
    frame,
    spec,
    {
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
      disconnectedUserIds: [],
    },
    spec.userId,
  ).action;

const emptyReply = (): ProtocolIngestResult => ({
  action: { _tag: "Reply", frames: [] },
});

export const protocolIngest = (
  frame: TcpFrame,
  spec: GameProtocolSpec,
  state: GameChildState,
  connectionUserId: number,
): ProtocolIngestResult =>
  Match.value(frame.type).pipe(
    Match.when(PacketType.keepalivePing, (): ProtocolIngestResult => ({
      action: {
        _tag: "Reply",
        frames: [{ type: PacketType.keepalivePing, seq: undefined, payload: new Uint8Array() }],
      },
    })),
    Match.when(
      (type): type is typeof PacketType.gameServerHello =>
        type === PacketType.gameServerHello && state.phase === "syncingIntoMatch",
      (): ProtocolIngestResult => {
        const valid = validateHello(frame, spec, state);
        if (!valid.ok) return { action: { _tag: "Close" } };
        return emptyReply();
      },
    ),
    Match.when(
      (type): type is typeof PacketType.gameConnect =>
        type === PacketType.gameConnect && state.phase === "syncingIntoMatch",
      (): ProtocolIngestResult => {
        const valid = validateHello(frame, spec, state);
        if (!valid.ok) return { action: { _tag: "Close" } };
        return replyMatchSetup(spec);
      },
    ),
    Match.when(
      (type): type is typeof PacketType.gameConnect =>
        type === PacketType.gameConnect && state.phase === "activeMatch",
      (): ProtocolIngestResult => {
        const valid = validateHello(frame, spec, state);
        if (!valid.ok) return { action: { _tag: "Close" } };
        if (!state.disconnectedUserIds.includes(valid.userId)) {
          return emptyReply();
        }
        return {
          action: { _tag: "Reply", frames: [] },
          reconnectUserId: valid.userId,
        };
      },
    ),
    Match.when(
      (type): type is number =>
        (type === PacketType.levelReady || type === PacketType.postConnectAck) &&
        state.phase === "syncingIntoMatch",
      (): ProtocolIngestResult => {
        if (frame.type === PacketType.postConnectAck) {
          decodePostConnectAck(frame.payload);
        }
        const frames = buildLevelReadySync(state, { sessionToken: spec.token });
        return {
          action: { _tag: "Reply", frames },
          nextPhase: "activeMatch",
        };
      },
    ),
    Match.when(
      (type): type is typeof PacketType.postConnectAck =>
        type === PacketType.postConnectAck && state.phase === "activeMatch",
      (): ProtocolIngestResult => {
        decodePostConnectAck(frame.payload);
        return emptyReply();
      },
    ),
    Match.whenOr(
      PacketType.introPlayerSync,
      PacketType.introEntitySync,
      PacketType.introAuxSync,
      (): ProtocolIngestResult => {
        const introEntity =
          frame.type === PacketType.introEntitySync
            ? decodeIntroEntitySync(frame.payload)
            : undefined;
        return {
          action: { _tag: "Reply", frames: [] },
          introSync: true,
          introClientSimTick: introEntity?.active === true ? introEntity.clientSimTick : undefined,
        };
      },
    ),
    Match.when(
      (type): type is typeof PacketType.simReady =>
        type === PacketType.simReady && state.phase === "activeMatch",
      (): ProtocolIngestResult => ({
        action: { _tag: "Reply", frames: buildQuitSync(state) },
        shouldClose: true,
        quitUserId: connectionUserId,
      }),
    ),
    Match.orElse((): ProtocolIngestResult =>
      Match.value(state.phase).pipe(
        Match.when("activeMatch", () =>
          Match.value(decodeGameInput(frame.type, frame.payload)).pipe(
            Match.when(Match.defined, (input) => ({
              action: { _tag: "Reply" as const, frames: [] },
              input,
            })),
            Match.orElse(() => ({
              action: { _tag: "Reply" as const, frames: [] },
              unknownGameplay: { type: frame.type, payload: frame.payload },
            })),
          ),
        ),
        Match.orElse(emptyReply),
      ),
    ),
  );
