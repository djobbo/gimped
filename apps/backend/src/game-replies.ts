import type { TcpFrame } from "./framing.ts";
import { type GameProtocolAction, protocolActionFor } from "./game-child-protocol.ts";

export type GameAction = GameProtocolAction;

export const gameActionFor = (
  frame: TcpFrame,
  spec: { readonly userId: number; readonly token: string; readonly includeBot: boolean },
): GameAction => protocolActionFor(frame, spec);
