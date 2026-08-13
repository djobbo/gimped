import { describe, expect, it } from "@effect/vitest";
import { MalformedCsv, MalformedJson, MalformedXml } from "./errors.ts";

describe("parse errors", () => {
  it("constructs MalformedCsv / MalformedXml / MalformedJson with path and message", () => {
    const csv = new MalformedCsv({ path: "/a.csv", message: "dup header" });
    const xml = new MalformedXml({ path: "/a.xml", message: "bad tag" });
    const json = new MalformedJson({ path: "/a.json", message: "bad json" });

    expect(csv._tag).toBe("MalformedCsv");
    expect(csv.path).toBe("/a.csv");
    expect(csv.message).toBe("dup header");
    expect(xml._tag).toBe("MalformedXml");
    expect(json._tag).toBe("MalformedJson");
  });
});
