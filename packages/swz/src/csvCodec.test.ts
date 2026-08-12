import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { MalformedCsv } from "./errors.ts";
import { csvToJson, jsonToCsv } from "./csvCodec.ts";

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
const runFail = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.result(effect));

describe("csvCodec", () => {
  it("round-trips exact native CSV including quoted cells", async () => {
    const native = 'MyTable\na,b\n1,"x,y"\n';
    const data = await run(csvToJson(native, "MyTable.csv"));
    expect(data).toEqual({
      name: "MyTable",
      headers: ["a", "b"],
      rows: [{ a: "1", b: "x,y" }],
    });
    expect(await run(jsonToCsv(data, "MyTable.csv"))).toBe(native);
  });

  it("canonicalizes CSV without a trailing newline to always end with one", async () => {
    const native = "MyTable\na,b\n1,2";
    const data = await run(csvToJson(native, "MyTable.csv"));
    expect(data).toEqual({
      name: "MyTable",
      headers: ["a", "b"],
      rows: [{ a: "1", b: "2" }],
    });
    expect(await run(jsonToCsv(data, "MyTable.csv"))).toBe(`${native}\n`);
  });

  it("rejects cells containing newline characters", async () => {
    const lf = await runFail(
      jsonToCsv({ name: "T", headers: ["a"], rows: [{ a: "x\ny" }] }, "t.csv"),
    );
    const cr = await runFail(
      jsonToCsv({ name: "T", headers: ["a"], rows: [{ a: "x\ry" }] }, "t.csv"),
    );
    expect(lf._tag).toBe("Failure");
    expect(cr._tag).toBe("Failure");
    if (lf._tag === "Failure") {
      expect(lf.failure).toBeInstanceOf(MalformedCsv);
      expect(lf.failure.message).toContain("newline");
    }
    if (cr._tag === "Failure") expect(cr.failure).toBeInstanceOf(MalformedCsv);
  });

  it("rejects empty and duplicate headers", async () => {
    const empty = await runFail(csvToJson("T\n,a\n1,2\n", "t.csv"));
    const dup = await runFail(csvToJson("T\na,a\n1,2\n", "t.csv"));
    expect(empty._tag).toBe("Failure");
    expect(dup._tag).toBe("Failure");
    if (empty._tag === "Failure") expect(empty.failure).toBeInstanceOf(MalformedCsv);
    if (dup._tag === "Failure") expect(dup.failure).toBeInstanceOf(MalformedCsv);
  });

  it("rejects row width / key mismatches on rebuild", async () => {
    const result = await runFail(
      jsonToCsv({ name: "T", headers: ["a", "b"], rows: [{ a: "1" }] }, "t.csv"),
    );
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(MalformedCsv);
  });
});
