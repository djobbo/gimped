export type GameChildPhase = "waitingForConnect" | "syncingIntoMatch" | "activeMatch" | "matchOver";

export type EntityState = {
  readonly entityId: number;
  readonly userId: number;
  readonly stocks: number;
  readonly damage: number;
  readonly x: number;
  readonly y: number;
};

export type GameChildState = {
  readonly phase: GameChildPhase;
  readonly includeBot: boolean;
  readonly connected: boolean;
  readonly tick: number;
  readonly clientTick: number;
  readonly simReady: boolean;
  readonly entities: ReadonlyArray<EntityState>;
};

export const PLAYER_ENTITY_ID = 1;
export const BOT_ENTITY_ID = 2;
export const BOT_USER_ID = 0;
export const DEFAULT_STOCKS = 3;
export const KO_DAMAGE = 999;

export const initialEntities = (
  playerUserId: number,
  includeBot: boolean,
): ReadonlyArray<EntityState> => {
  const entities: EntityState[] = [
    {
      entityId: PLAYER_ENTITY_ID,
      userId: playerUserId,
      stocks: DEFAULT_STOCKS,
      damage: 0,
      x: 0,
      y: 0,
    },
  ];
  if (includeBot) {
    entities.push({
      entityId: BOT_ENTITY_ID,
      userId: BOT_USER_ID,
      stocks: DEFAULT_STOCKS,
      damage: 0,
      x: 0,
      y: 0,
    });
  }
  return entities;
};

export const initialGameChildState = (includeBot: boolean): GameChildState => ({
  phase: "waitingForConnect",
  includeBot,
  connected: false,
  tick: 0,
  clientTick: 0,
  simReady: false,
  entities: initialEntities(1, includeBot),
});
