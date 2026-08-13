import { runWith } from "@gimped/common";
import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Layer, Path } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { AnimDefJsonService, type AnimDef } from "./AnimDefJson.ts";
import { EntryIo } from "./EntryIo.ts";
import { InvalidAnm, MissingIndex } from "./errors.ts";

const Live = EntryIo.layer.pipe(
  Layer.provideMerge(AnimDefJsonService.layer),
  Layer.provideMerge(NodeServices.layer),
);
const run = runWith(Live);

const def = (key: string, name: string): AnimDef => ({
  key,
  name,
  file: "anims/Foo.swf",
  moves: [],
});

describe("EntryIo", () => {
  it("writes index.json and slugged files, then reads them back in order", async () => {
    const defs = [def("anims/A.swf/a__A", "a__A"), def("anims/B.swf/a__B", "a__B")];
    const round = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const io = yield* EntryIo;
        const dir = yield* fs.makeTempDirectory({ prefix: "anm-entry-" });
        yield* io.writeDir(defs, dir);
        const indexText = yield* fs.readFileString(path.join(dir, "index.json"));
        const names = yield* fs.readDirectory(dir);
        const read = yield* io.readDir(dir);
        return { indexText, names, read };
      }),
    );
    expect(JSON.parse(round.indexText).files).toEqual([
      { file: "anims__A.swf__a__A.json", key: "anims/A.swf/a__A" },
      { file: "anims__B.swf__a__B.json", key: "anims/B.swf/a__B" },
    ]);
    expect(round.names).toContain("index.json");
    expect(round.read.map((d) => d.key)).toEqual(["anims/A.swf/a__A", "anims/B.swf/a__B"]);
  });

  it("fails MissingIndex when index.json is absent", async () => {
    const error = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const io = yield* EntryIo;
        const dir = yield* fs.makeTempDirectory({ prefix: "anm-missing-" });
        return yield* io.readDir(dir).pipe(Effect.flip);
      }),
    );
    expect(error).toBeInstanceOf(MissingIndex);
  });

  it("fails InvalidAnm on key mismatch", async () => {
    const error = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const io = yield* EntryIo;
        const dir = yield* fs.makeTempDirectory({ prefix: "anm-mismatch-" });
        yield* io.writeDir([def("anims/A.swf/a__A", "a__A")], dir);
        const filePath = path.join(dir, "anims__A.swf__a__A.json");
        const text = yield* fs.readFileString(filePath);
        const parsed = JSON.parse(text) as { key: string };
        parsed.key = "other";
        yield* fs.writeFileString(filePath, JSON.stringify(parsed));
        return yield* io.readDir(dir).pipe(Effect.flip);
      }),
    );
    expect(error).toBeInstanceOf(InvalidAnm);
    expect((error as InvalidAnm).reason).toBe("key mismatch");
  });
});
