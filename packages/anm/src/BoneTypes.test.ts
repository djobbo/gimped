import { runWith } from "@gimped/common";
import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Layer, Path } from "effect";
import { describe, expect, it } from "vite-plus/test";
import type { AnimDef } from "./AnimDefJson.ts";
import { BoneTypes } from "./BoneTypes.ts";
import { GameDataError } from "./errors.ts";

const Live = BoneTypes.layer.pipe(Layer.provideMerge(NodeServices.layer));
const run = runWith(Live);

const defWithIds = (...ids: number[]): AnimDef => ({
  key: "k",
  name: "n",
  file: "f",
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
          bones: ids.map((id) => ({
            id,
            a: 1,
            b: 0,
            c: 0,
            d: 1,
            tx: 0,
            ty: 0,
            alpha: 1,
            gfxFrame: 1,
          })),
        },
      ],
    },
  ],
});

describe("BoneTypes", () => {
  it("fills names from BoneTypes.xml and omits unknown ids", async () => {
    const annotated = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const bones = yield* BoneTypes;
        const dir = yield* fs.makeTempDirectory({ prefix: "anm-bones-" });
        yield* fs.writeFileString(
          path.join(dir, "BoneTypes.xml"),
          "<BoneTypes><Bone>a_Torso1</Bone><Bone>a_Jaw</Bone></BoneTypes>\n",
        );
        return yield* bones.annotate([defWithIds(0, 1, 99)], dir);
      }),
    );
    const names = annotated[0]?.moves[0]?.frames[0]?.bones.map((bone) => bone.name);
    expect(names).toEqual(["UNKNOWN", "a_Torso1", undefined]);
  });

  it("omits names when --data has no BoneTypes table", async () => {
    const annotated = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const bones = yield* BoneTypes;
        const dir = yield* fs.makeTempDirectory({ prefix: "anm-nobones-" });
        yield* fs.writeFileString(path.join(dir, "Other.xml"), "<Other><x>1</x></Other>\n");
        return yield* bones.annotate([defWithIds(0, 1)], dir);
      }),
    );
    const names = annotated[0]?.moves[0]?.frames[0]?.bones.map((bone) => bone.name);
    expect(names).toEqual([undefined, undefined]);
  });

  it("leaves names unset without --data", async () => {
    const annotated = await run(
      Effect.gen(function* () {
        const bones = yield* BoneTypes;
        return yield* bones.annotate([defWithIds(1)]);
      }),
    );
    expect(annotated[0]?.moves[0]?.frames[0]?.bones[0]?.name).toBeUndefined();
  });

  it("fails GameDataError when --data path cannot be loaded", async () => {
    const error = await run(
      Effect.gen(function* () {
        const bones = yield* BoneTypes;
        return yield* bones.annotate([defWithIds(1)], "/no/such/anm-data").pipe(Effect.flip);
      }),
    );
    expect(error).toBeInstanceOf(GameDataError);
  });
});
