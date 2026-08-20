export type GameChildPhase = "waitingForConnect" | "syncingIntoMatch" | "activeMatch" | "matchOver";

/** Simulation frame length in ms (class_139.method_4363 aligns to multiples of 16). */
export const TICK_FRAME_MS = 16;

export type EntityInputSample = {
  readonly tick: number;
  readonly input: number;
};

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
  /** Authoritative sim tick in ms (0 before first frame, then 16/32/…). */
  readonly tick: number;
  readonly clientTick: number;
  /** Latest var_12624 from client 10419 intro entity sync or move inputs. */
  readonly clientSimTick: number;
  readonly simReady: boolean;
  readonly entities: ReadonlyArray<EntityState>;
  /** Latest 10407 input sample per entity id. */
  readonly entityInputs: Readonly<Record<number, EntityInputSample>>;
  /** Queued 10407 samples not yet broadcast on TCP tick. */
  readonly inputQueue: ReadonlyArray<EntityInputSample & { readonly entityId: number }>;
  /** Last ack sequence from client bundles (class_647.var_9259). */
  readonly udpAckSeq: number;
  /** Outbound reliable UDP sequence (class_647.var_1158). */
  readonly udpSendSeq: number;
  /** Session id in UDP headers (class_139.var_14614 — local user id). */
  readonly udpSessionId: number;
  /** Last client intro sync packet (10415/10419/10422) — ms since epoch. */
  readonly lastIntroSyncAtMs: number;
  /** Wall clock ms when the authoritative tick last advanced. */
  readonly lastTickAdvanceAtMs: number;
  /** Wall clock ms when phase became activeMatch. */
  readonly enteredActiveMatchAtMs: number;
};

/** Intro sync goes quiet ~500ms before the fight starts. */
export const INTRO_QUIET_MS = 500;

/** class_139.var_12624 reaches ~6000ms when the countdown finishes and fight begins. */
export const FIGHT_PHASE_TICK_MS = 6000;

export const advanceSimTick = (tick: number): number =>
  tick === 0 ? TICK_FRAME_MS : tick + TICK_FRAME_MS;

/** Align to class_139.method_4363 16 ms frame grid (minimum one frame). */
export const alignSimTick = (tick: number): number => {
  if (tick <= 0) return TICK_FRAME_MS;
  return tick - (tick % TICK_FRAME_MS);
};

export const trackClientSimTick = (state: GameChildState, tick: number): GameChildState =>
  tick > state.clientSimTick ? { ...state, clientSimTick: tick, clientTick: tick } : state;

export const introQuietElapsed = (state: GameChildState, now: number): boolean =>
  state.lastIntroSyncAtMs > 0 && now - state.lastIntroSyncAtMs >= INTRO_QUIET_MS;

/** True when the stub should send 10404 and arm the wall-clock 10301 loop. */
export const shouldBeginFight = (state: GameChildState, now: number): boolean => {
  if (
    state.simReady ||
    state.phase !== "activeMatch" ||
    state.clientSimTick < FIGHT_PHASE_TICK_MS
  ) {
    return false;
  }
  // Clients that never send 10419 intro sync still advance var_12624 via move inputs.
  if (state.lastIntroSyncAtMs === 0) return true;
  return introQuietElapsed(state, now);
};

/** Advance one frame, never past the latest client sim tick. */
export const nextAuthoritativeTick = (state: GameChildState): number => {
  if (state.clientSimTick <= state.tick) return state.tick;
  return advanceSimTick(state.tick);
};

/** Fight start tick written to var_13931 — align to client when already past intro. */
export const fightStartTickFrom = (state: GameChildState): number =>
  alignSimTick(
    state.clientSimTick >= FIGHT_PHASE_TICK_MS ? state.clientSimTick : FIGHT_PHASE_TICK_MS,
  );

/** Max sim frames to advance in one loop iteration when the client is ahead. */
export const MAX_CATCHUP_STEPS = 16;

export const catchupStepsFor = (state: GameChildState): number => {
  const lag = state.clientSimTick - state.tick;
  if (lag <= TICK_FRAME_MS) return 1;
  return Math.min(MAX_CATCHUP_STEPS, Math.max(1, Math.floor(lag / TICK_FRAME_MS)));
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
  clientSimTick: 0,
  simReady: false,
  entities: initialEntities(1, includeBot),
  entityInputs: {},
  inputQueue: [],
  udpAckSeq: 0,
  udpSendSeq: 0,
  udpSessionId: 1,
  lastIntroSyncAtMs: 0,
  lastTickAdvanceAtMs: 0,
  enteredActiveMatchAtMs: 0,
});
