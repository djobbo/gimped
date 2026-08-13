import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import type { AnimDef } from "./AnimDefJson.ts";
import { BoneTypes } from "./BoneTypes.ts";
import { GameDataError } from "./errors.ts";

const Live = BoneTypes.layer.pipe(Layer.provideMerge(NodeServices.layer));

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

layer(Live)("BoneTypes", (it) => {
  it.effect("fills names from BoneTypes.xml and omits unknown ids", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const bones = yield* BoneTypes;
      const dir = yield* fs.makeTempDirectory({ prefix: "anm-bones-" });
      yield* fs.writeFileString(
        path.join(dir, "BoneTypes.xml"),
        "<BoneTypes><Bone>a_Torso1</Bone><Bone>a_Jaw</Bone></BoneTypes>\n",
      );
      const annotated = yield* bones.annotate([defWithIds(0, 1, 99)], dir);
      const names = annotated[0]?.moves[0]?.frames[0]?.bones.map((bone) => bone.name);
      expect(names).toEqual(["UNKNOWN", "a_Torso1", undefined]);
    }),
  );

  it.effect("omits names when --data has no BoneTypes table", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const bones = yield* BoneTypes;
      const dir = yield* fs.makeTempDirectory({ prefix: "anm-nobones-" });
      yield* fs.writeFileString(path.join(dir, "Other.xml"), "<Other><x>1</x></Other>\n");
      const annotated = yield* bones.annotate([defWithIds(0, 1)], dir);
      const names = annotated[0]?.moves[0]?.frames[0]?.bones.map((bone) => bone.name);
      expect(names).toEqual([undefined, undefined]);
    }),
  );

  it.effect("leaves names unset without --data", () =>
    Effect.gen(function* () {
      const bones = yield* BoneTypes;
      const annotated = yield* bones.annotate([defWithIds(1)]);
      expect(annotated[0]?.moves[0]?.frames[0]?.bones[0]?.name).toBeUndefined();
    }),
  );

  it.effect("fails GameDataError when --data path cannot be loaded", () =>
    Effect.gen(function* () {
      const bones = yield* BoneTypes;
      const error = yield* bones.annotate([defWithIds(1)], "/no/such/anm-data").pipe(Effect.flip);
      expect(error).toBeInstanceOf(GameDataError);
    }),
  );
});
