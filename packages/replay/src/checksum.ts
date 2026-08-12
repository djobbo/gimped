export type ChecksumHero = {
  readonly heroId: number;
  readonly costumeId: number;
  readonly field3172: number;
  readonly weaponSkinId: number;
};

export type ChecksumPlayer = {
  readonly colorSchemeId: number;
  readonly cosmetics: {
    readonly spawnBotId: number;
    readonly field2463: number;
    readonly field11747: number;
    readonly tauntIds: readonly number[];
    readonly field2378: number;
    readonly field15047: number;
    readonly bitfield: readonly number[];
    readonly field3535: number;
  };
  readonly heroes: readonly ChecksumHero[];
  readonly handicap?: { readonly lives: number; readonly statA: number; readonly statB: number };
};

const popcount = (x: number): number => {
  let n = x >>> 0;
  n -= (n >>> 1) & 0x55555555;
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

export const playerChecksum = (
  players: readonly ChecksumPlayer[],
  levelId: number,
  heroSlotCount: number,
): number => {
  let sum = 0;
  for (const player of players) {
    if (player == null) continue;
    const c = player.cosmetics;
    sum += player.colorSchemeId * 5;
    sum += c.spawnBotId * 93;
    sum += c.field2463 * 97;
    sum += c.field11747 * 53;
    for (let i = 0; i < 8; i++) sum += (c.tauntIds[i] ?? 0) * (13 + i);
    sum += c.field2378 * 37;
    sum += c.field15047 * 41;
    for (let i = 0; i < c.bitfield.length; i++) sum += (11 + i) * popcount(c.bitfield[i]!);
    sum += c.field3535 * 43;
    for (let i = 0; i < heroSlotCount; i++) {
      const hero = player.heroes[i];
      if (!hero) continue;
      sum += (hero.heroId & 65535) * (17 + i);
      sum += hero.costumeId * (7 + i);
      sum += hero.field3172 * (3 + i);
      sum += hero.weaponSkinId * (2 + i);
    }
    if (player.handicap == null) sum += 29;
    else {
      sum += player.handicap.lives * 31;
      sum += Math.round(player.handicap.statA / 10) * 3;
      sum += Math.round(player.handicap.statB / 10) * 23;
    }
  }
  sum += levelId * 47;
  return sum % 173;
};
