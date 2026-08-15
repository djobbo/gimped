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
});
