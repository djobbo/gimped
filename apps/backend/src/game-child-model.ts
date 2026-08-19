export type GameChildPhase = "waitingForConnect" | "syncingIntoMatch" | "activeMatch" | "matchOver";

export type EntityState = {
  readonly entityId: number;
  readonly userId: number;
  readonly stocks: number;
  readonly damage: number;
};

export type GameChildState = {
  readonly phase: GameChildPhase;
  readonly includeBot: boolean;
  readonly connected: boolean;
  readonly tick: number;
  readonly entities: ReadonlyArray<EntityState>;
};

export const initialGameChildState = (includeBot: boolean): GameChildState => ({
  phase: "waitingForConnect",
  includeBot,
  connected: false,
  tick: 0,
  entities: [],
});
