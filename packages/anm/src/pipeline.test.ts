import { runWith } from "@gimped/common";
import { Effect, FileSystem, Path, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { AnmCodec } from "./AnmCodec.ts";
import { AnimDefJson, type AnimDef } from "./AnimDefJson.ts";
import { Envelope } from "./Envelope.ts";
import { TestLive } from "./layers.ts";
import { compileFile, decompileFile } from "./pipeline.ts";

const run = runWith(TestLive);

const sample = (): AnimDef => ({
  key: "anims/Foo.swf/a__Foo",
  name: "a__Foo",
  file: "anims/Foo.swf",
  moves: [
    {
      name: "Ready",
      startFrame: 1,
      duration: 1,
      loop: 0,
      recover: 0,
      free: 0,
      iconUI: 0,
      runEnds: [],
      frames: [
        {
          index: 0,
          bones: [{ id: 1, a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0, alpha: 1, gfxFrame: 1 }],
        },
      ],
    },
  ],
});

describe("file pipeline", () => {
  it("round-trips decompile → compile → decompile without names", async () => {
    const { first, second } = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const envelope = yield* Envelope;
        const codec = yield* AnmCodec;
        const root = yield* fs.makeTempDirectory({ prefix: "anm-pipeline-" });
        const anmIn = path.join(root, "in.anm");
        const dir1 = path.join(root, "first");
        const anmOut = path.join(root, "out.anm");
        const dir2 = path.join(root, "second");
        const payload = yield* codec.encode([sample()]);
        const sealed = yield* envelope.seal(payload);
        yield* fs.writeFile(anmIn, sealed);
        yield* decompileFile({ inPath: anmIn, outPath: dir1 });
        yield* compileFile({ inPath: dir1, outPath: anmOut });
        yield* decompileFile({ inPath: anmOut, outPath: dir2 });
        const firstText = yield* fs.readFileString(path.join(dir1, "anims__Foo.swf__a__Foo.json"));
        const secondText = yield* fs.readFileString(path.join(dir2, "anims__Foo.swf__a__Foo.json"));
        return { first: JSON.parse(firstText), second: JSON.parse(secondText) };
      }),
    );
    expect(second).toEqual(first);
    expect(first.moves[0].frames[0].bones[0].name).toBeUndefined();
    expect(Schema.decodeUnknownSync(AnimDefJson)(first).key).toBe("anims/Foo.swf/a__Foo");
  });

  it("adds bone names from --data and compile drops them", async () => {
    const { named, unnamed } = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const envelope = yield* Envelope;
        const codec = yield* AnmCodec;
        const root = yield* fs.makeTempDirectory({ prefix: "anm-data-" });
        const dataDir = path.join(root, "data");
        yield* fs.makeDirectory(dataDir);
        yield* fs.writeFileString(
          path.join(dataDir, "BoneTypes.xml"),
          "<BoneTypes><Bone>a_Torso1</Bone></BoneTypes>\n",
        );
        const anmIn = path.join(root, "in.anm");
        const dir1 = path.join(root, "named");
        const anmOut = path.join(root, "out.anm");
        const dir2 = path.join(root, "unnamed");
        yield* fs.writeFile(anmIn, yield* envelope.seal(yield* codec.encode([sample()])));
        yield* decompileFile({ inPath: anmIn, outPath: dir1, dataPath: dataDir });
        yield* compileFile({ inPath: dir1, outPath: anmOut });
        yield* decompileFile({ inPath: anmOut, outPath: dir2 });
        const named = JSON.parse(
          yield* fs.readFileString(path.join(dir1, "anims__Foo.swf__a__Foo.json")),
        );
        const unnamed = JSON.parse(
          yield* fs.readFileString(path.join(dir2, "anims__Foo.swf__a__Foo.json")),
        );
        return { named, unnamed };
      }),
    );
    expect(named.moves[0].frames[0].bones[0].name).toBe("a_Torso1");
    expect(unnamed.moves[0].frames[0].bones[0].name).toBeUndefined();
  });
});
