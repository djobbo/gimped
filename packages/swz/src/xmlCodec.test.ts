import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import { MalformedXml } from "./errors.ts";
import { XmlCodecLive } from "./layers.ts";
import { jsonToXml, xmlToJson } from "./xmlCodec.ts";

layer(XmlCodecLive)("xmlCodec", (it) => {
  it.effect("round-trips semantically (parse -> json -> xml -> parse)", () =>
    Effect.gen(function* () {
      const native = '<HeroTypes><Hero name="bodvar"><Stat v="1"/></Hero></HeroTypes>';
      const data = yield* xmlToJson(native, "HeroTypes.xml");
      expect(data.root).toEqual({
        HeroTypes: {
          Hero: {
            "@_name": "bodvar",
            Stat: {
              "@_v": "1",
            },
          },
        },
      });
      const rebuilt = yield* jsonToXml(data, "HeroTypes.xml");
      const again = yield* xmlToJson(rebuilt, "HeroTypes.xml");
      expect(again.root).toEqual(data.root);
    }),
  );

  it.effect("preserves attribute values that look like booleans", () =>
    Effect.gen(function* () {
      const native = '<HeroTypes><Hero flag="true" off="false"/></HeroTypes>';
      const data = yield* xmlToJson(native, "HeroTypes.xml");
      const rebuilt = yield* jsonToXml(data, "HeroTypes.xml");
      expect(rebuilt).toContain('flag="true"');
      const again = yield* xmlToJson(rebuilt, "HeroTypes.xml");
      expect(again.root).toEqual({
        HeroTypes: { Hero: { "@_flag": "true", "@_off": "false" } },
      });
    }),
  );

  it.effect("ignores XML declarations and processing instructions", () =>
    Effect.gen(function* () {
      const native =
        '<?xml version="1.0" encoding="utf-8"?><HeroTypes><Hero name="bodvar"/></HeroTypes>';
      const data = yield* xmlToJson(native, "HeroTypes.xml");
      expect(Object.keys(data.root)).toEqual(["HeroTypes"]);
      const rebuilt = yield* jsonToXml(data, "HeroTypes.xml");
      const again = yield* xmlToJson(rebuilt, "HeroTypes.xml");
      expect(again.root).toEqual(data.root);
    }),
  );

  it.effect("rejects malformed XML", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(xmlToJson("<HeroTypes><Hero></HeroTypes>", "bad.xml"));
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(MalformedXml);
      }
    }),
  );
});
