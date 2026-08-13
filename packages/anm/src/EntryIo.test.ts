import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";
import { AnimDefJsonService, AnimDefJsonText, IndexJsonText, type AnimDef } from "./AnimDefJson.ts";
import { EntryIo } from "./EntryIo.ts";
import { InvalidAnm, MissingIndex } from "./errors.ts";

const Live = EntryIo.layer.pipe(
  Layer.provideMerge(AnimDefJsonService.layer),
  Layer.provideMerge(NodeServices.layer),
);

const def = (key: string, name: string): AnimDef => ({
  key,
  name,
  file: "anims/Foo.swf",
  moves: [],
});

layer(Live)("EntryIo", (it) => {
  it.effect("writes index.json and slugged files, then reads them back in order", () =>
    Effect.gen(function* () {
      const defs = [def("anims/A.swf/a__A", "a__A"), def("anims/B.swf/a__B", "a__B")];
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const io = yield* EntryIo;
      const dir = yield* fs.makeTempDirectory({ prefix: "anm-entry-" });
      yield* io.writeDir(defs, dir);
      const indexText = yield* fs.readFileString(path.join(dir, "index.json"));
      const names = yield* fs.readDirectory(dir);
      const read = yield* io.readDir(dir);
      expect(Schema.decodeUnknownSync(IndexJsonText)(indexText).files).toEqual([
        { file: "anims__A.swf__a__A.json", key: "anims/A.swf/a__A" },
        { file: "anims__B.swf__a__B.json", key: "anims/B.swf/a__B" },
      ]);
      expect(names).toContain("index.json");
      expect(read.map((d) => d.key)).toEqual(["anims/A.swf/a__A", "anims/B.swf/a__B"]);
    }),
  );

  it.effect("fails MissingIndex when index.json is absent", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const io = yield* EntryIo;
      const dir = yield* fs.makeTempDirectory({ prefix: "anm-missing-" });
      const error = yield* io.readDir(dir).pipe(Effect.flip);
      expect(error).toBeInstanceOf(MissingIndex);
    }),
  );

  it.effect("fails InvalidAnm on key mismatch", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const io = yield* EntryIo;
      const dir = yield* fs.makeTempDirectory({ prefix: "anm-mismatch-" });
      yield* io.writeDir([def("anims/A.swf/a__A", "a__A")], dir);
      const filePath = path.join(dir, "anims__A.swf__a__A.json");
      const text = yield* fs.readFileString(filePath);
      const parsed = yield* Schema.decodeUnknownEffect(AnimDefJsonText)(text);
      const tampered = yield* Schema.encodeUnknownEffect(AnimDefJsonText)({
        ...parsed,
        key: "other",
      });
      yield* fs.writeFileString(filePath, `${tampered}\n`);
      const error = yield* io.readDir(dir).pipe(Effect.flip);
      expect(error).toBeInstanceOf(InvalidAnm);
      if (error instanceof InvalidAnm) {
        expect(error.reason).toBe("key mismatch");
      }
    }),
  );
});
