import type { TcpFrame } from "./framing.ts";
import { protocolActionFor } from "./game-child-protocol.ts";
import type { GameProtocolAction } from "./messages.ts";

export type GameAction = GameProtocolAction;

import type { MatchSetupSpec } from "./match-spec.ts";

export const gameActionFor = (
  frame: TcpFrame,
  spec: {
    readonly userId: number;
    readonly token: string;
    readonly levelId: number;
    readonly includeBot: boolean;
    readonly setup: MatchSetupSpec;
  },
): GameAction => protocolActionFor(frame, spec);
