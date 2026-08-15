import type { Replay } from "@gimped/replay";

export const InputBits = { up: 1, down: 2, left: 4, right: 8 } as const;

export type CollisionLine = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  type: 1 | 2;
};

export type Spawn = {
  x: number;
  y: number;
  team?: number;
};

export type CameraBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type FighterState = {
  entityId: number;
  team: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  facingLeft: boolean;
  lives: number;
  damage: number;
  score: number;
  input: number | undefined;
  hurtW: number;
  hurtH: number;
  stun: number;
  ko: boolean;
  lastHitBy: number | undefined;
};

export type MatchState = {
  timeMs: number;
  gameSpeed: number;
  ended: boolean;
  fighters: FighterState[];
  lines: CollisionLine[];
  spawns: Spawn[];
  bounds: CameraBounds;
  startingLives: number;
  inputs: Replay["inputs"];
};

export type Snapshot = {
  timeMs: number;
  ended: boolean;
  fighters: Array<{
    entityId: number;
    team: number;
    x: number;
    y: number;
    lives: number;
    damage: number;
    score: number;
    ko: boolean;
  }>;
};

export type SimResults = {
  duration: number;
  scores: ReadonlyArray<{ entityId: number; score: number }>;
  endValue: number;
};

export type ScoringRow = { id: number; name: string };
export type HeroRow = { id: number; name: string };
export type HurtboxRow = { name: string; width: number; height: number };
export type PowerRow = { id: number; name: string };
export type LevelRow = { id: number; name: string };

export type TablesData = {
  scoring: Map<number, ScoringRow>;
  heroes: Map<number, HeroRow>;
  hurtboxes: Map<string, HurtboxRow>;
  powers: Map<number, PowerRow>;
  levels: Map<number, LevelRow>;
};

export type LevelCollisionData = {
  levelId: number;
  lines: CollisionLine[];
  spawns: Spawn[];
  bounds: CameraBounds;
};
