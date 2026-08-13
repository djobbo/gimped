import { MalformedJson, runWith } from "@gimped/common";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { AnimDefJson, AnimDefJsonService, type AnimDef } from "./AnimDefJson.ts";
import { Schema } from "effect";

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
    const encoded = Schema.encodeUnknownSync(AnimDefJson)(minimal());
    const json = JSON.stringify(encoded);
    expect(json).not.toContain('"name":"a_Torso1"');
    expect(json).not.toContain("fireSocket");
    expect(json).not.toContain("platform");
  });

  it("decodes a def from JSON text and rejects garbage", async () => {
    const def = await run(
      Effect.gen(function* () {
        const json = yield* AnimDefJsonService;
        return yield* json.decodeDef(JSON.stringify(minimal()), "x.json");
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
});
