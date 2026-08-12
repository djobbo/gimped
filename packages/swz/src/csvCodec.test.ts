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

  it("round-trips exact native CSV without trailing newline", async () => {
    const native = "MyTable\na,b\n1,2";
    const data = await run(csvToJson(native, "MyTable.csv"));
    expect(data).toEqual({
      name: "MyTable",
      headers: ["a", "b"],
      rows: [{ a: "1", b: "2" }],
    });
    expect(await run(jsonToCsv(data, "MyTable.csv"))).toBe(native);
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
