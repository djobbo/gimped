import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { IoError } from "@gimped/common";
import { Effect, FileSystem, Layer, Path } from "effect";
import { MissingCollision } from "./errors.ts";
import { GameData } from "./GameData.ts";

const scoringTypesXml = `<ScoringTypes>
  <ScoringType ScoringName="Stock"><ScoringID>1</ScoringID></ScoringType>
</ScoringTypes>
`;

const heroTypesXml = `<HeroTypes>
  <HeroType HeroName="Bodvar"><HeroID>3</HeroID></HeroType>
</HeroTypes>
`;

const levelTypesXml = `<LevelTypes>
  <LevelType LevelName="Box"><LevelID>12</LevelID></LevelType>
</LevelTypes>
`;

const levelDescXml = `<LevelDesc LevelName="Box">
  <CameraBounds X="-400" Y="-200" W="800" H="600"/>
  <HardCollision X1="-200" Y1="0" X2="200" Y2="0"/>
  <Respawn X="0" Y="-50" Team="1"/>
</LevelDesc>
`;

const Live = GameData.layer.pipe(Layer.provideMerge(NodeServices.layer));

const writeTablesDir = Effect.fn("writeTablesDir")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectory({ prefix: "sim-gamedata-" });
  yield* fs.writeFileString(path.join(dir, "ScoringTypes.xml"), scoringTypesXml);
  yield* fs.writeFileString(path.join(dir, "HeroTypes.xml"), heroTypesXml);
  yield* fs.writeFileString(path.join(dir, "LevelTypes.xml"), levelTypesXml);
  yield* fs.writeFileString(path.join(dir, "LevelDesc_Box.xml"), levelDescXml);
  return dir;
});

layer(Live)("GameData", (it) => {
  it.effect("loads hard collision and Stock scoring from directory XML", () =>
    Effect.gen(function* () {
      const dir = yield* writeTablesDir();
      const data = yield* GameData;
      const loaded = yield* data.load(dir, 12);
      expect(loaded.tables.scoring.get(1)?.name).toBe("Stock");
      expect(
        loaded.level.lines.some(
          (line) =>
            line.type === 1 &&
            line.startX === -200 &&
            line.startY === 0 &&
            line.endX === 200 &&
            line.endY === 0,
        ),
      ).toBe(true);
    }),
  );

  it.effect("fails IoError when the data path is missing", () =>
    Effect.gen(function* () {
      const data = yield* GameData;
      const error = yield* data.load("/this/sim-gamedata/does/not/exist", 12).pipe(Effect.flip);
      expect(error).toBeInstanceOf(IoError);
    }),
  );

  it.effect("joins LevelDesc by LevelName when DisplayName differs", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectory({ prefix: "sim-gamedata-" });
      yield* fs.writeFileString(path.join(dir, "ScoringTypes.xml"), scoringTypesXml);
      yield* fs.writeFileString(path.join(dir, "HeroTypes.xml"), heroTypesXml);
      yield* fs.writeFileString(
        path.join(dir, "LevelTypes.xml"),
        `<LevelTypes>
  <LevelType LevelName="Box" DisplayName="Wrong"><LevelID>12</LevelID></LevelType>
</LevelTypes>
`,
      );
      yield* fs.writeFileString(path.join(dir, "LevelDesc_Box.xml"), levelDescXml);
      const data = yield* GameData;
      const loaded = yield* data.load(dir, 12);
      expect(loaded.tables.levels.get(12)?.name).toBe("Box");
      expect(loaded.level.lines.length).toBeGreaterThan(0);
    }),
  );

  it.effect("fails MissingCollision when the level has no lines", () =>
    Effect.gen(function* () {
      const dir = yield* writeTablesDir();
      const data = yield* GameData;
      const error = yield* data.load(dir, 99).pipe(Effect.flip);
      expect(error).toBeInstanceOf(MissingCollision);
      if (error._tag === "MissingCollision") expect(error.levelId).toBe(99);
    }),
  );

  it.effect("parses hero Speed/Strength/Dexterity/Weight and StatType RunSpeed", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectory({ prefix: "sim-gamedata-" });
      yield* fs.writeFileString(path.join(dir, "ScoringTypes.xml"), scoringTypesXml);
      yield* fs.writeFileString(
        path.join(dir, "HeroTypes.xml"),
        `<HeroTypes>
  <HeroType HeroName="Super"><HeroID>15</HeroID><Strength>5</Strength><Dexterity>8</Dexterity><Weight>4</Weight><Speed>6</Speed></HeroType>
  <HeroType HeroName="Dwarf"><HeroID>22</HeroID><Strength>6</Strength><Dexterity>8</Dexterity><Weight>7</Weight><Speed>3</Speed></HeroType>
</HeroTypes>
`,
      );
      yield* fs.writeFileString(
        path.join(dir, "StatTypes.xml"),
        `<StatTypes>
  <StatType StatName="Speed6"><RunSpeed>47.56</RunSpeed></StatType>
  <StatType StatName="Speed3"><RunSpeed>41.69</RunSpeed></StatType>
  <StatType StatName="Strength5"><ImpulseMult>1.053</ImpulseMult></StatType>
  <StatType StatName="Dexterity8"><RecoverMod>1.57</RecoverMod></StatType>
  <StatType StatName="Weight7"><Recovery>8.8768</Recovery></StatType>
</StatTypes>
`,
      );
      yield* fs.writeFileString(path.join(dir, "LevelTypes.xml"), levelTypesXml);
      yield* fs.writeFileString(path.join(dir, "LevelDesc_Box.xml"), levelDescXml);
      const data = yield* GameData;
      const loaded = yield* data.load(dir, 12);
      expect(loaded.tables.heroes.get(15)?.speed).toBe(6);
      expect(loaded.tables.heroes.get(22)?.speed).toBe(3);
      expect(loaded.tables.heroes.get(15)?.speed).not.toBe(loaded.tables.heroes.get(22)?.speed);
      expect(loaded.tables.stats.get("Speed6")?.runSpeed).toBe(47.56);
      expect(loaded.tables.stats.get("Dexterity8")?.recoverMod).toBeCloseTo(1 / 1.57, 5);
    }),
  );

  it.effect("parses LevelDesc HardCollision shorthand X/Y", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectory({ prefix: "sim-gamedata-" });
      yield* fs.writeFileString(path.join(dir, "ScoringTypes.xml"), scoringTypesXml);
      yield* fs.writeFileString(path.join(dir, "HeroTypes.xml"), heroTypesXml);
      yield* fs.writeFileString(path.join(dir, "LevelTypes.xml"), levelTypesXml);
      yield* fs.writeFileString(
        path.join(dir, "LevelDesc_Box.xml"),
        `<LevelDesc LevelName="Box">
  <CameraBounds X="-400" Y="-200" W="800" H="600"/>
  <HardCollision X1="540" X2="2240" Y="1850"/>
  <Respawn X="0" Y="-50" Team="1"/>
</LevelDesc>
`,
      );
      const data = yield* GameData;
      const loaded = yield* data.load(dir, 12);
      expect(
        loaded.level.lines.some(
          (line) =>
            line.type === 1 &&
            line.startX === 540 &&
            line.endX === 2240 &&
            line.startY === 1850 &&
            line.endY === 1850,
        ),
      ).toBe(true);
    }),
  );

  it.effect("loads SmallBrawlhaven collision from the swz fixtures directory", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const here = yield* path.fromFileUrl(new URL(import.meta.url));
      const swzDir = path.join(path.dirname(here), "..", "..", "swz", "fixtures");
      const data = yield* GameData;
      const loaded = yield* data.load(swzDir, 94);
      expect(loaded.level.lines.length).toBeGreaterThan(0);
      expect(loaded.tables.heroes.get(15)?.strength).not.toBe(
        loaded.tables.heroes.get(22)?.strength,
      );
      expect(loaded.tables.heroes.get(15)?.dexterity).not.toBe(
        loaded.tables.heroes.get(22)?.dexterity,
      );
    }),
  );
});
