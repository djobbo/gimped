import type { MatchSetupSpec } from "./match-spec.ts";

/** Human fighters in match setup (host + lobby guests, excluding bots). */
export const humanPlayerCount = (setup: MatchSetupSpec): number => 1 + setup.guests.length;
