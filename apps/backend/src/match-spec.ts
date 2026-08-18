import { Schema } from "effect";

export class MatchSpec extends Schema.Class<MatchSpec>("MatchSpec")({
  userId: Schema.Number,
  token: Schema.String,
  levelId: Schema.Number,
  includeBot: Schema.Boolean,
}) {}

export class GameListenReady extends Schema.Class<GameListenReady>("GameListenReady")({
  host: Schema.String,
  tcpPort: Schema.Number,
  udpPort: Schema.Number,
}) {}

export const GameListenReadyLine = Schema.fromJsonString(GameListenReady);
