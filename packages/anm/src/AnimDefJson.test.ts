import { MalformedJson, runWith } from "@gimped/common";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { AnimDefJsonService, AnimDefJsonText, type AnimDef } from "./AnimDefJson.ts";

const Live = AnimDefJsonService.layer;
const run = runWith(Live);

const minimal = (): AnimDef => ({
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
          bones: [
            {
              id: 12,
              a: 1,
              b: 0,
              c: 0,
              d: 1,
              tx: 0,
              ty: 0,
              alpha: 1,
              gfxFrame: 1,
            },
          ],
        },
      ],
    },
  ],
});

describe("AnimDefJson", () => {
  it("omits optional bone name, fireSocket, and platform when unset", () => {
    const json = Schema.encodeUnknownSync(AnimDefJsonText)(minimal());
    expect(json).not.toContain('"name":"a_Torso1"');
    expect(json).not.toContain("fireSocket");
    expect(json).not.toContain("platform");
  });

  it("decodes a def from JSON text and rejects garbage", async () => {
    const def = await run(
      Effect.gen(function* () {
        const json = yield* AnimDefJsonService;
        return yield* json.decodeDef(
          Schema.encodeUnknownSync(AnimDefJsonText)(minimal()),
          "x.json",
        );
      }),
    );
    expect(def.key).toBe("anims/Foo.swf/a__Foo");

    const error = await run(
      Effect.gen(function* () {
        const json = yield* AnimDefJsonService;
        return yield* json.decodeDef("{", "bad.json").pipe(Effect.flip);
      }),
    );
    expect(error._tag).toBe("MalformedJson");
    expect(error.path).toBe("bad.json");
  });

  it("rejects an out-of-range gfxFrame", async () => {
    const input = minimal();
    input.moves[0]!.frames[0]!.bones[0]!.gfxFrame = 300;

    const error = await run(
      Effect.gen(function* () {
        const json = yield* AnimDefJsonService;
        return yield* Effect.flip(
          json.decodeDef(
            Schema.encodeUnknownSync(Schema.UnknownFromJsonString)(input),
            "bad-gfx-frame.json",
          ),
        );
      }),
    );

    expect(error).toBeInstanceOf(MalformedJson);
    expect(error.path).toBe("bad-gfx-frame.json");
  });
});
