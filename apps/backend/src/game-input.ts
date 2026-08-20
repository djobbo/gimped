import { BitReader, BitWriter } from "./bitstream.ts";
import type { GameChildState } from "./game-child-model.ts";
import {
  alignSimTick,
  BOT_ENTITY_ID,
  fightStartTickFrom,
  nextAuthoritativeTick,
  PLAYER_ENTITY_ID,
} from "./game-child-model.ts";
import type { TcpFrame } from "./framing.ts";
import { PacketType } from "./packets.ts";

export type SimReadyInput = { readonly _tag: "SimReady" };
export type TickAckInput = { readonly _tag: "TickAck"; readonly clientTick: number };
export type MoveInput = {
  readonly _tag: "Move";
  readonly entityId: number;
  /** Packed sim tick from class_220.var_5923. */
  readonly tick: number;
  /** 14-bit controller bitmask from class_220.var_1213. */
  readonly input: number;
  readonly raw: Uint8Array;
};
export type UnknownInput = {
  readonly _tag: "UnknownInput";
  readonly type: number;
  readonly payload: Uint8Array;
};

export type GameInput = SimReadyInput | TickAckInput | MoveInput | UnknownInput;

export const decodeSimReady = (_payload: Uint8Array) => ({ _tag: "SimReady" as const });

export const decodeTickAck = (payload: Uint8Array) => {
  const bits = new BitReader(payload);
  return { _tag: "TickAck" as const, clientTick: bits.readPackedU32() };
};

export const decodeMove = (payload: Uint8Array) => {
  const bits = new BitReader(payload);
  return {
    _tag: "Move" as const,
    entityId: bits.readBits(4),
    tick: bits.readPackedU32(),
    input: bits.readBits(14),
    raw: payload,
  };
};

export const decodeGameInput = (type: number, payload: Uint8Array): GameInput | undefined => {
  if (type === PacketType.simReady) return decodeSimReady(payload);
  if (type === PacketType.tickAck) return decodeTickAck(payload);
  if (type === PacketType.moveInput) return decodeMove(payload);
  return undefined;
};

/** LinkUpdater.method_6892 — child→client tick pulse during active match. */
export const encodeTickPulse = (tick: number): Uint8Array => {
  const bits = new BitWriter();
  bits.writePackedU32(tick);
  return bits.toUint8Array();
};

/** LinkUpdater.method_2517 (10404) — fight-start tick ack from server to client. */
export const encodeTickAck = encodeTickPulse;

/** LinkUpdater.method_2963 (10309) — batched rollback inputs for all entities. */
export const encodeInputBroadcast = (broadcast: {
  readonly serverTick: number;
  readonly inputs: ReadonlyArray<{
    readonly entityId: number;
    readonly tick: number;
    readonly input: number;
  }>;
}): Uint8Array => {
  const bits = new BitWriter();
  bits.writePackedU32(broadcast.serverTick);
  bits.writePackedU32(broadcast.inputs.length);
  for (const sample of broadcast.inputs) {
    bits.writeBits(4, sample.entityId);
    bits.writePackedU32(sample.tick);
    bits.writeBits(14, sample.input);
  }
  return bits.toUint8Array();
};

/** LinkUpdater.method_3520 (10304) — stock loss / entity state (scoreboard via method_6840). */
export const encodeEntityState = (state: {
  readonly entityId: number;
  readonly tick: number;
  readonly code: number;
}): Uint8Array => {
  const bits = new BitWriter();
  bits.writePackedU32(state.entityId);
  bits.writePackedU32(state.tick);
  bits.writePackedU32(state.code);
  return bits.toUint8Array();
};

/** LinkUpdater.method_2473 (10307) — respawn after stock loss (method_2363). */
export const encodeEntityRespawn = (respawn: {
  readonly entityId: number;
  readonly field2: number;
  readonly tick: number;
  readonly reason: number;
  readonly active: boolean;
}): Uint8Array => {
  const bits = new BitWriter();
  bits.writePackedU32(respawn.entityId);
  bits.writePackedU32(respawn.field2);
  bits.writePackedU32(respawn.tick);
  bits.writePackedU32(respawn.reason);
  bits.writeBool(respawn.active);
  return bits.toUint8Array();
};

export const encodeUdpTunnelAck = (ackSeq: number): Uint8Array => {
  const bits = new BitWriter();
  bits.writePackedU24(ackSeq);
  return bits.toUint8Array();
};

/**
 * 10309 samples for the current authoritative tick.
 * Prefer an exact queued sample; otherwise hold the latest known mask.
 * Client only sends 10407 on input-edge changes, so wall-clock frames must
 * keep the held mask or rollback cancels movement/attacks with neutral floods.
 */
export const relayInputSamples = (
  state: GameChildState,
): ReadonlyArray<{ readonly entityId: number; readonly tick: number; readonly input: number }> => {
  const entityIds = state.includeBot ? [PLAYER_ENTITY_ID, BOT_ENTITY_ID] : [PLAYER_ENTITY_ID];
  return entityIds.map((entityId) => {
    const exact = state.inputQueue.find(
      (sample) => sample.entityId === entityId && sample.tick === state.tick,
    );
    if (exact !== undefined) {
      return { entityId, tick: state.tick, input: exact.input };
    }
    const held = state.entityInputs[entityId];
    if (held !== undefined && held.tick <= state.tick) {
      return { entityId, tick: state.tick, input: held.input };
    }
    return { entityId, tick: state.tick, input: 0 };
  });
};

export const queueMoveInput = (
  state: GameChildState,
  sample: { readonly entityId: number; readonly tick: number; readonly input: number },
): GameChildState => ({
  ...state,
  entityInputs: {
    ...state.entityInputs,
    [sample.entityId]: { tick: sample.tick, input: sample.input },
  },
  inputQueue: [
    ...state.inputQueue.filter(
      (queued) => !(queued.entityId === sample.entityId && queued.tick === sample.tick),
    ),
    sample,
  ],
});

/** Drop inputs only after the authoritative tick has reached their frame. */
export const drainAppliedInputs = (state: GameChildState): GameChildState => ({
  ...state,
  inputQueue: state.inputQueue.filter((sample) => sample.tick > state.tick),
});

/** Snap authoritative tick to a client input frame and build 10301 + 10309. */
export const syncStateToInputTick = (state: GameChildState, inputTick: number) => {
  if (!state.simReady) {
    return { state, frames: [] } satisfies {
      readonly state: GameChildState;
      readonly frames: ReadonlyArray<TcpFrame>;
    };
  }
  const tick = alignSimTick(inputTick);
  if (tick < state.tick) {
    return { state, frames: [] } satisfies {
      readonly state: GameChildState;
      readonly frames: ReadonlyArray<TcpFrame>;
    };
  }
  const tickState: GameChildState = { ...state, tick };
  const frames = buildTickSyncFrames(tickState);
  return { state: drainAppliedInputs(tickState), frames } satisfies {
    readonly state: GameChildState;
    readonly frames: ReadonlyArray<TcpFrame>;
  };
};

/** Advance sim tick and build the active-match 10301 + 10309 reply pair. */
export const advanceTickAndBuildSync = (state: GameChildState) => {
  const nextTick = nextAuthoritativeTick(state);
  if (nextTick === state.tick) {
    return { state, frames: [] } satisfies {
      readonly state: GameChildState;
      readonly frames: ReadonlyArray<TcpFrame>;
    };
  }
  const tickState: GameChildState = {
    ...state,
    simReady: true,
    tick: nextTick,
  };
  const frames = buildTickSyncFrames(tickState);
  return { state: drainAppliedInputs(tickState), frames } satisfies {
    readonly state: GameChildState;
    readonly frames: ReadonlyArray<TcpFrame>;
  };
};
/** Active-match heartbeat: 10301 tick pulse plus 10309 rollback inputs every frame. */
export const buildTickSyncFrames = (state: GameChildState): ReadonlyArray<TcpFrame> => {
  const simTick = state.tick;
  const inputs = relayInputSamples(state);
  return [
    {
      type: PacketType.tickPulse,
      seq: undefined,
      payload: encodeTickPulse(simTick),
    },
    {
      type: PacketType.inputBroadcast,
      seq: undefined,
      payload: encodeInputBroadcast({
        serverTick: simTick,
        inputs,
      }),
    },
  ];
};

/**
 * Fight start: 10404 sets var_13931; client enters rollback in method_3623 after intro.
 * Do not send 10301 here — method_6892 drives sidekick sim during intro and causes desync.
 */
export const buildFightStartSync = (state: GameChildState): ReadonlyArray<TcpFrame> => {
  const tick = fightStartTickFrom(state);
  return [
    {
      type: PacketType.tickAck,
      seq: undefined,
      payload: encodeTickAck(tick),
    },
  ];
};
