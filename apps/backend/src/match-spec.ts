import { Schema } from "effect";
import { DEFAULT_HOST_COSTUME_ID, DEFAULT_HOST_HERO_ID, DEFAULT_RULESET } from "./lobby-state.ts";

export class MatchSetupHeroSlot extends Schema.Class<MatchSetupHeroSlot>("MatchSetupHeroSlot")({
  heroId: Schema.Number,
  costumeId: Schema.Number,
}) {}

export class MatchSetupGuest extends Schema.Class<MatchSetupGuest>("MatchSetupGuest")({
  controller: Schema.Number,
  entityId: Schema.Number,
  heroId: Schema.Number,
  costumeId: Schema.Number,
  heroSlots: Schema.Array(MatchSetupHeroSlot),
}) {}

export class MatchSetupBot extends Schema.Class<MatchSetupBot>("MatchSetupBot")({
  controller: Schema.Number,
  entityId: Schema.Number,
  heroId: Schema.Number,
  costumeId: Schema.Number,
}) {}

export class MatchSetupSpec extends Schema.Class<MatchSetupSpec>("MatchSetupSpec")({
  hostHeroId: Schema.Number,
  hostCostumeId: Schema.Number,
  hostHeroSlots: Schema.Array(MatchSetupHeroSlot),
  ruleset: Schema.Array(Schema.Number),
  guests: Schema.Array(MatchSetupGuest),
  bots: Schema.Array(MatchSetupBot),
}) {
  static readonly default = new MatchSetupSpec({
    hostHeroId: DEFAULT_HOST_HERO_ID,
    hostCostumeId: DEFAULT_HOST_COSTUME_ID,
    hostHeroSlots: [
      { heroId: DEFAULT_HOST_HERO_ID, costumeId: DEFAULT_HOST_COSTUME_ID },
      { heroId: DEFAULT_HOST_HERO_ID, costumeId: DEFAULT_HOST_COSTUME_ID },
    ],
    ruleset: [...DEFAULT_RULESET],
    guests: [],
    bots: [],
  });
}

export class MatchSpec extends Schema.Class<MatchSpec>("MatchSpec")({
  userId: Schema.Number,
  token: Schema.String,
  levelId: Schema.Number,
  setup: MatchSetupSpec,
}) {}

export class GameListenReady extends Schema.Class<GameListenReady>("GameListenReady")({
  host: Schema.String,
  tcpPort: Schema.Number,
  udpPort: Schema.Number,
}) {}

export const GameListenReadyLine = Schema.fromJsonString(GameListenReady);

export const MatchSetupArgLine = Schema.fromJsonString(MatchSetupSpec);

export const encodeSetupArg = (setup: MatchSetupSpec): string =>
  Schema.encodeUnknownSync(MatchSetupArgLine)(setup);

export const decodeSetupArg = (text: string): MatchSetupSpec =>
  Schema.decodeUnknownSync(MatchSetupArgLine)(text);
