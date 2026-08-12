import { describe, expect, it } from "vite-plus/test";
import { playerChecksum, type ChecksumPlayer } from "./checksum.ts";

const player = (over: Partial<ChecksumPlayer> = {}): ChecksumPlayer => ({
  colorSchemeId: 1,
  heroes: [{ heroId: 0, costumeId: 0, field3172: 0, weaponSkinId: 0 }],
  cosmetics: {
    spawnBotId: 0,
    field2463: 0,
    field11747: 0,
    tauntIds: [0, 0, 0, 0, 0, 0, 0, 0],
    field2378: 0,
    field15047: 0,
    bitfield: [],
    field3535: 0,
  },
  ...over,
});

describe("playerChecksum", () => {
  it("matches colorSchemeId*5 + null handicap 29, mod 173", () => {
    expect(playerChecksum([player()], 0, 1)).toBe(34);
  });

  it("includes levelId * 47", () => {
    expect(playerChecksum([player()], 2, 1)).toBe((34 + 94) % 173);
  });
});
