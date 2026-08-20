import { BitReader, BitWriter } from "./bitstream.ts";
import type { GameChildState } from "./game-child-model.ts";
import type { TcpFrame } from "./framing.ts";
import { encodeEntityRespawn, encodeEntityState } from "./game-input.ts";
import { STUB_DISPLAY_NAME, STUB_USER_ID } from "./login-accepted.ts";
import { PacketType } from "./packets.ts";

export type SessionSync = {
  readonly _tag: "SessionSync";
  readonly clearTransfer: boolean;
  readonly token: string;
};

export type EntitySpawnRecord = {
  readonly entityId: number;
  readonly field2: number;
  readonly name: string;
  readonly field4: string;
  readonly field5: number;
  readonly userId: number;
  readonly field7: number;
  readonly field8: boolean;
};

export type EntitySpawn = {
  readonly _tag: "EntitySpawn";
  readonly entities: ReadonlyArray<EntitySpawnRecord>;
};

export type GameServerReady = {
  readonly _tag: "GameServerReady";
  readonly ready: boolean;
  readonly tick: number;
};

export type PostConnectAck = {
  readonly _tag: "PostConnectAck";
};

const frame = (type: number, payload: Uint8Array): TcpFrame => ({
  type,
  seq: undefined,
  payload,
});

/** LinkUpdater.method_8595 — bool clear-transfer flag + session token string. */
export const encodeSessionSync = (sync: {
  readonly clearTransfer: boolean;
  readonly token: string;
}): Uint8Array => {
  const bits = new BitWriter();
  bits.writeBool(sync.clearTransfer);
  bits.writeString(sync.token);
  return bits.toUint8Array();
};

export const decodeSessionSync = (payload: Uint8Array): SessionSync => {
  const bits = new BitReader(payload);
  return {
    _tag: "SessionSync",
    clearTransfer: bits.readBool(),
    token: bits.readString(),
  };
};

/** LinkUpdater.method_289 — loop of entity snapshot records. */
export const encodeEntitySpawn = (spawn: {
  readonly entities: ReadonlyArray<{
    readonly entityId: number;
    readonly field2?: number;
    readonly name: string;
    readonly field4?: string;
    readonly field5?: number;
    readonly userId: number;
    readonly field7?: number;
    readonly field8?: boolean;
  }>;
}): Uint8Array => {
  const bits = new BitWriter();
  for (const entity of spawn.entities) {
    bits.writeBool(true);
    bits.writePackedU32(entity.entityId);
    bits.writePackedU32(entity.field2 ?? 0);
    bits.writeString(entity.name);
    bits.writeString(entity.field4 ?? "");
    bits.writePackedU24(entity.field5 ?? 3);
    bits.writePackedU32(entity.userId);
    bits.writePackedU24(entity.field7 ?? 0);
    bits.writeBool(entity.field8 ?? false);
  }
  bits.writeBool(false);
  return bits.toUint8Array();
};

export const decodeEntitySpawn = (payload: Uint8Array): EntitySpawn => {
  const bits = new BitReader(payload);
  const entities: EntitySpawnRecord[] = [];
  while (bits.readBool()) {
    entities.push({
      entityId: bits.readPackedU32(),
      field2: bits.readPackedU32(),
      name: bits.readString(),
      field4: bits.readString(),
      field5: bits.readPackedU24(),
      userId: bits.readPackedU32(),
      field7: bits.readPackedU24(),
      field8: bits.readBool(),
    });
  }
  return { _tag: "EntitySpawn", entities };
};

/** LinkUpdater.method_4718 — ready flag + simulation tick. */
export const encodeGameServerReady = (ready: {
  readonly ready: boolean;
  readonly tick: number;
}): Uint8Array => {
  const bits = new BitWriter();
  bits.writeBool(ready.ready);
  bits.writePackedU32(ready.tick);
  return bits.toUint8Array();
};

export const decodeGameServerReady = (payload: Uint8Array): GameServerReady => {
  const bits = new BitReader(payload);
  return {
    _tag: "GameServerReady",
    ready: bits.readBool(),
    tick: bits.readPackedU32(),
  };
};

/** class_139.method_673 — empty client post-connect ack. */
export const decodePostConnectAck = (_payload: Uint8Array): PostConnectAck => ({
  _tag: "PostConnectAck",
});

const encodeDropOffline = (reason: number): Uint8Array => {
  const bits = new BitWriter();
  bits.writePackedU32(reason);
  return bits.toUint8Array();
};

const defaultSpawnEntities = (state: GameChildState): ReadonlyArray<EntitySpawnRecord> => {
  if (state.entities.length > 0) {
    return state.entities.map((entity) => ({
      entityId: entity.entityId,
      field2: 0,
      name: STUB_DISPLAY_NAME,
      field4: "",
      field5: entity.stocks,
      userId: entity.userId,
      field7: 0,
      field8: false,
    }));
  }
  const entities: EntitySpawnRecord[] = [
    {
      entityId: 1,
      field2: 0,
      name: STUB_DISPLAY_NAME,
      field4: "",
      field5: 3,
      userId: STUB_USER_ID,
      field7: 0,
      field8: false,
    },
  ];
  if (state.includeBot) {
    entities.push({
      entityId: 2,
      field2: 0,
      name: "Bot",
      field4: "",
      field5: 3,
      userId: 0,
      field7: 0,
      field8: false,
    });
  }
  return entities;
};

/** Post-10310 child→client sync (10310 is sent separately on gameConnect). */
export const buildInitialSync = (
  _state: GameChildState,
  _options: { readonly sessionToken: string },
): ReadonlyArray<TcpFrame> => [];

/** Sent after client 10409/10403 once the level shell is ready (not right after 10310). */
export const buildLevelReadySync = (
  state: GameChildState,
  _options: { readonly sessionToken: string },
): ReadonlyArray<TcpFrame> => {
  // LinkUpdater.method_8604 (10311) calls class_139.method_855() when var_5286 != 0, which clears
  // fighters spawned by 10310. After 10409 levelReady the client has already ticked the level shell,
  // so var_5286 is non-zero and 10311 wipes var_7032 before we can start sim.
  // LinkUpdater.method_288 (10312) also ends in method_855(); keep it for respawn/match-over only.
  return [
    frame(PacketType.gameServerReady, encodeGameServerReady({ ready: true, tick: state.tick })),
  ];
};

export const buildRespawnSync = (
  state: GameChildState,
  entityId: number,
): ReadonlyArray<TcpFrame> => {
  const tick = state.tick === 0 ? 16 : state.tick;
  return [
    frame(PacketType.entityState, encodeEntityState({ entityId, tick, code: tick })),
    frame(
      PacketType.entityRespawn,
      encodeEntityRespawn({
        entityId,
        field2: 0,
        tick,
        reason: 4,
        active: true,
      }),
    ),
  ];
};

export const buildMatchOverSync = (state: GameChildState): ReadonlyArray<TcpFrame> => [
  frame(PacketType.entitySpawn, encodeEntitySpawn({ entities: defaultSpawnEntities(state) })),
  frame(PacketType.dropOffline, encodeDropOffline(0)),
];
