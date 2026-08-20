import { Schema } from "effect";

export const TcpFrame = Schema.Struct({
  type: Schema.Number,
  seq: Schema.optionalKey(Schema.Number),
  payload: Schema.instanceOf(Uint8Array),
});
export type TcpFrame = typeof TcpFrame.Type;

export const HandleFrameResult = Schema.Struct({
  replies: Schema.Array(TcpFrame),
});
export type HandleFrameResult = typeof HandleFrameResult.Type;

export const GameProtocolReply = Schema.TaggedStruct("Reply", {
  frames: Schema.Array(TcpFrame),
});
export const GameProtocolClose = Schema.TaggedStruct("Close", {});
export const GameProtocolAction = Schema.Union([GameProtocolReply, GameProtocolClose]);
export type GameProtocolAction = typeof GameProtocolAction.Type;

export const ProtocolIngestResult = Schema.Struct({
  action: GameProtocolAction,
  nextPhase: Schema.optionalKey(Schema.Literals(["syncingIntoMatch", "activeMatch"])),
  input: Schema.optionalKey(Schema.Unknown),
  introSync: Schema.optionalKey(Schema.Boolean),
  introClientSimTick: Schema.optionalKey(Schema.Number),
  unknownGameplay: Schema.optionalKey(
    Schema.Struct({
      type: Schema.Number,
      payload: Schema.instanceOf(Uint8Array),
    }),
  ),
});
export type ProtocolIngestResult = typeof ProtocolIngestResult.Type;

export const ProtocolHello = Schema.TaggedStruct("ProtocolHello", {
  text: Schema.String,
});
export const ClientVersion = Schema.TaggedStruct("ClientVersion", {
  versionStamp: Schema.Number,
  platformId: Schema.Number,
});
export const LoginRequest = Schema.TaggedStruct("LoginRequest", {
  email: Schema.String,
  ticketBytes: Schema.Number,
  nameHint: Schema.String,
});
export const LoginAccepted = Schema.TaggedStruct("LoginAccepted", {
  userId: Schema.Number,
  displayName: Schema.String,
});
export const CreateCustomRoom = Schema.TaggedStruct("CreateCustomRoom", {
  flags: Schema.Number,
  playlistId: Schema.Number,
  customGameType: Schema.Number,
});
export const CustomLobby = Schema.TaggedStruct("CustomLobby", {
  roomId: Schema.Number,
  roomCode: Schema.String,
  hostUserId: Schema.Number,
  regionId: Schema.Number,
  maxPlayers: Schema.Number,
});
export const LobbySettings = Schema.TaggedStruct("LobbySettings", {
  playlistId: Schema.Number,
  customGameType: Schema.Number,
  maxPlayers: Schema.Number,
  regionId: Schema.Number,
});
export const LegendPick = Schema.TaggedStruct("LegendPick", {
  isBot: Schema.Boolean,
  slotId: Schema.Number,
  heroId: Schema.Number,
  ready: Schema.Boolean,
});
export const AddBot = Schema.TaggedStruct("AddBot", {
  controller: Schema.Number,
});
export const StartMatch = Schema.TaggedStruct("StartMatch", {});
export const GameConnect = Schema.TaggedStruct("GameConnect", {
  userId: Schema.Number,
  token: Schema.String,
});
export const MatchSetup = Schema.TaggedStruct("MatchSetup", {
  custom: Schema.Boolean,
  playerCount: Schema.Number,
  hostUserId: Schema.Number,
});
export const SessionSync = Schema.TaggedStruct("SessionSync", {
  clearTransfer: Schema.Boolean,
  token: Schema.String,
});
export const EntitySpawnEntity = Schema.Struct({
  entityId: Schema.Number,
  field2: Schema.Number,
  name: Schema.String,
  field4: Schema.String,
  field5: Schema.Number,
  userId: Schema.Number,
  field7: Schema.Number,
  field8: Schema.Boolean,
});
export const EntitySpawn = Schema.TaggedStruct("EntitySpawn", {
  entities: Schema.Array(EntitySpawnEntity),
});
export const GameServerReady = Schema.TaggedStruct("GameServerReady", {
  ready: Schema.Boolean,
  tick: Schema.Number,
});
export const PostConnectAck = Schema.TaggedStruct("PostConnectAck", {});
export const SimReady = Schema.TaggedStruct("SimReady", {});
export const TickAck = Schema.TaggedStruct("TickAck", {
  clientTick: Schema.Number,
});
export const MoveInput = Schema.TaggedStruct("MoveInput", {
  entityId: Schema.Number,
  x: Schema.optionalKey(Schema.Number),
  y: Schema.optionalKey(Schema.Number),
  tick: Schema.optionalKey(Schema.Number),
  input: Schema.optionalKey(Schema.Number),
});
export const TickPulse = Schema.TaggedStruct("TickPulse", {
  tick: Schema.Number,
});
export const TickPulseEcho = Schema.TaggedStruct("TickPulseEcho", {});
export const EntityValue = Schema.TaggedStruct("EntityValue", {
  entityId: Schema.Number,
  value: Schema.Number,
});
export const AssignGameServer = Schema.TaggedStruct("AssignGameServer", {
  userId: Schema.Number,
  levelId: Schema.Number,
  token: Schema.String,
  host: Schema.String,
  tcpPort: Schema.Number,
  udpPort: Schema.Number,
  useNetworkNext: Schema.Boolean,
});
export const IntroSync = Schema.TaggedStruct("IntroSync", {
  size: Schema.Number,
});
export const InputBroadcast = Schema.TaggedStruct("InputBroadcast", {
  size: Schema.Number,
});
export const UdpTunnel = Schema.TaggedStruct("UdpTunnel", {
  size: Schema.Number,
});
export const EntityState = Schema.TaggedStruct("EntityState", {
  entityId: Schema.Number,
  tick: Schema.Number,
  code: Schema.Number,
});
export const EntityRespawn = Schema.TaggedStruct("EntityRespawn", {
  size: Schema.Number,
});
export const Unknown = Schema.TaggedStruct("Unknown", {});

export const DecodedPayload = Schema.Union([
  ProtocolHello,
  ClientVersion,
  LoginRequest,
  LoginAccepted,
  CreateCustomRoom,
  CustomLobby,
  LobbySettings,
  LegendPick,
  AddBot,
  StartMatch,
  GameConnect,
  MatchSetup,
  SessionSync,
  EntitySpawn,
  GameServerReady,
  PostConnectAck,
  SimReady,
  TickAck,
  MoveInput,
  TickPulse,
  TickPulseEcho,
  EntityValue,
  AssignGameServer,
  IntroSync,
  InputBroadcast,
  UdpTunnel,
  EntityState,
  EntityRespawn,
  Unknown,
]);
export type DecodedPayload = typeof DecodedPayload.Type;
