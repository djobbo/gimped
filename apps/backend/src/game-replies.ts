import type { TcpFrame } from "./framing.ts";
import { type GameProtocolAction, protocolActionFor } from "./game-child-protocol.ts";

export type GameAction = GameProtocolAction;

import type { MatchSetupSpec } from "./match-spec.ts";

export const gameActionFor = (
  frame: TcpFrame,
  spec: {
    readonly userId: number;
    readonly token: string;
    readonly includeBot: boolean;
    readonly setup: MatchSetupSpec;
  },
): GameAction => protocolActionFor(frame, spec);
