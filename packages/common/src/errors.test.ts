import { describe, expect, it } from "vite-plus/test";
import { IoError, MalformedJson, toIoError, toMalformedJson } from "./errors.ts";

describe("common errors", () => {
  it("constructs IoError and MalformedJson", () => {
    const io = new IoError({ path: "/a", message: "nope" });
    const json = new MalformedJson({ path: "/b.json", message: "bad" });
    expect(io._tag).toBe("IoError");
    expect(json._tag).toBe("MalformedJson");
  });

  it("maps unknown values to IoError / MalformedJson", () => {
    const io = toIoError("/x", new Error("boom"));
    expect(io.path).toBe("/x");
    expect(io.message).toBe("boom");
    const json = toMalformedJson("/y", "not json");
    expect(json.path).toBe("/y");
    expect(json.message).toBe("not json");
  });
});
