import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { MalformedXml } from "./errors.ts";
import { jsonToXml, xmlToJson } from "./xmlCodec.ts";

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
const runFail = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.result(effect));

describe("xmlCodec", () => {
  it("round-trips semantically (parse -> json -> xml -> parse)", async () => {
    const native = '<HeroTypes><Hero name="bodvar"><Stat v="1"/></Hero></HeroTypes>';
    const data = await run(xmlToJson(native, "HeroTypes.xml"));
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
    const rebuilt = await run(jsonToXml(data, "HeroTypes.xml"));
    const again = await run(xmlToJson(rebuilt, "HeroTypes.xml"));
    expect(again.root).toEqual(data.root);
  });

  it("preserves attribute values that look like booleans", async () => {
    const native = '<HeroTypes><Hero flag="true" off="false"/></HeroTypes>';
    const data = await run(xmlToJson(native, "HeroTypes.xml"));
    const rebuilt = await run(jsonToXml(data, "HeroTypes.xml"));
    expect(rebuilt).toContain('flag="true"');
    const again = await run(xmlToJson(rebuilt, "HeroTypes.xml"));
    expect(again.root).toEqual({
      HeroTypes: { Hero: { "@_flag": "true", "@_off": "false" } },
    });
  });

  it("ignores XML declarations and processing instructions", async () => {
    const native =
      '<?xml version="1.0" encoding="utf-8"?><HeroTypes><Hero name="bodvar"/></HeroTypes>';
    const data = await run(xmlToJson(native, "HeroTypes.xml"));
    expect(Object.keys(data.root)).toEqual(["HeroTypes"]);
    const rebuilt = await run(jsonToXml(data, "HeroTypes.xml"));
    const again = await run(xmlToJson(rebuilt, "HeroTypes.xml"));
    expect(again.root).toEqual(data.root);
  });

  it("rejects malformed XML", async () => {
    const result = await runFail(xmlToJson("<HeroTypes><Hero></HeroTypes>", "bad.xml"));
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure).toBeInstanceOf(MalformedXml);
    }
  });
});
