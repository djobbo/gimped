import type { Replay } from "@gimped/replay";

export const InputBits = {
  up: 1,
  down: 2,
  left: 4,
  right: 8,
  jump: 16,
  /** Inner `class_288.method_8993` `(param2 & 32)` — not the replay light button. */
  attack: 32,
  heavy: 64,
  light: 128,
  dodge: 256,
  throw: 512,
} as const;

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
  prevInput?: number;
  hurtW: number;
  hurtH: number;
  stun: number;
  ko: boolean;
  lastHitBy: number | undefined;
  /** Elapsed frames of the current unarmed nlight; 0 = idle. */
  attackFrames?: number;
  heroId?: number;
  /** Dump `class_576` Speed.RunSpeed; grounded walk. */
  runSpeed?: number;
  /** Dump `class_576` Strength.ImpulseMult. */
  impulseMult?: number;
  /** Dump `class_576` Dexterity.RecoverMod stored as `1 / xml`. */
  recoverMod?: number;
  /** Dump `class_576` Weight.Recovery (UI Defense). */
  recovery?: number;
  /** Air jumps consumed this airborne period; reset on land. */
  airJumpsUsed?: number;
  /** -1 left of wall, 1 on/right of wall, 0 none. */
  wallSide?: -1 | 0 | 1;
  /** Remaining dodge invuln frames; `> 0` skips Combat hits. */
  dodgeFrames?: number;
  /** Set on grounded side dodge; enables dash-jump until dodge ends. */
  dashing?: boolean;
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
export type HeroRow = {
  id: number;
  name: string;
  strength?: number;
  dexterity?: number;
  /** Dump XML `Weight` — UI Defense. */
  weight?: number;
  speed?: number;
};
export type HurtboxRow = { name: string; width: number; height: number };
export type PowerRow = { id: number; name: string };
export type LevelRow = { id: number; name: string };
export type StatRow = {
  name: string;
  runSpeed?: number;
  impulseMult?: number;
  recoverMod?: number;
  recovery?: number;
};

export type TablesData = {
  scoring: Map<number, ScoringRow>;
  heroes: Map<number, HeroRow>;
  hurtboxes: Map<string, HurtboxRow>;
  powers: Map<number, PowerRow>;
  levels: Map<number, LevelRow>;
  stats: Map<string, StatRow>;
};

export type LevelCollisionData = {
  levelId: number;
  lines: CollisionLine[];
  spawns: Spawn[];
  bounds: CameraBounds;
};
