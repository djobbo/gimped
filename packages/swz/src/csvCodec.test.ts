import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import { csvToJson, jsonToCsv } from "./csvCodec.ts";
import { MalformedCsv } from "./errors.ts";
import { CsvCodecLive } from "./layers.ts";

layer(CsvCodecLive)("csvCodec", (it) => {
  it.effect("round-trips exact native CSV including quoted cells", () =>
    Effect.gen(function* () {
      const native = 'MyTable\na,b\n1,"x,y"\n';
      const data = yield* csvToJson(native, "MyTable.csv");
      expect(data).toEqual({
        name: "MyTable",
        headers: ["a", "b"],
        rows: [{ a: "1", b: "x,y" }],
      });
      expect(yield* jsonToCsv(data, "MyTable.csv")).toBe(native);
    }),
  );

  it.effect("parses quoted cells that contain newlines", () =>
    Effect.gen(function* () {
      const native = 'MyTable\na,b\n1,"x\ny"\n2,z\n';
      const data = yield* csvToJson(native, "MyTable.csv");
      expect(data).toEqual({
        name: "MyTable",
        headers: ["a", "b"],
        rows: [
          { a: "1", b: "x\ny" },
          { a: "2", b: "z" },
        ],
      });
    }),
  );

  it.effect("canonicalizes CSV without a trailing newline to always end with one", () =>
    Effect.gen(function* () {
      const native = "MyTable\na,b\n1,2";
      const data = yield* csvToJson(native, "MyTable.csv");
      expect(data).toEqual({
        name: "MyTable",
        headers: ["a", "b"],
        rows: [{ a: "1", b: "2" }],
      });
      expect(yield* jsonToCsv(data, "MyTable.csv")).toBe(`${native}\n`);
    }),
  );

  it.effect("rejects cells containing newline characters", () =>
    Effect.gen(function* () {
      const lf = yield* Effect.result(
        jsonToCsv({ name: "T", headers: ["a"], rows: [{ a: "x\ny" }] }, "t.csv"),
      );
      const cr = yield* Effect.result(
        jsonToCsv({ name: "T", headers: ["a"], rows: [{ a: "x\ry" }] }, "t.csv"),
      );
      expect(lf._tag).toBe("Failure");
      expect(cr._tag).toBe("Failure");
      if (lf._tag === "Failure") {
        expect(lf.failure).toBeInstanceOf(MalformedCsv);
        expect(lf.failure.message).toContain("newline");
      }
      if (cr._tag === "Failure") expect(cr.failure).toBeInstanceOf(MalformedCsv);
    }),
  );

  it.effect("rejects empty and duplicate headers", () =>
    Effect.gen(function* () {
      const empty = yield* Effect.result(csvToJson("T\n,a\n1,2\n", "t.csv"));
      const dup = yield* Effect.result(csvToJson("T\na,a\n1,2\n", "t.csv"));
      expect(empty._tag).toBe("Failure");
      expect(dup._tag).toBe("Failure");
      if (empty._tag === "Failure") expect(empty.failure).toBeInstanceOf(MalformedCsv);
      if (dup._tag === "Failure") expect(dup.failure).toBeInstanceOf(MalformedCsv);
    }),
  );

  it.effect("rejects row width / key mismatches on rebuild", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        jsonToCsv({ name: "T", headers: ["a", "b"], rows: [{ a: "1" }] }, "t.csv"),
      );
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(MalformedCsv);
    }),
  );
});
