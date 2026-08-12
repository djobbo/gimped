### Task 2: CSV codec (exact round-trip)

**Files:**
- Create: `packages/swz/src/csvCodec.ts`
- Create: `packages/swz/src/csvCodec.test.ts`

**Interfaces:**
- Consumes: `MalformedCsv` from `./errors.ts`
- Produces:
  - `export type CsvJsonData = { readonly name: string; readonly headers: readonly string[]; readonly rows: readonly Readonly<Record<string, string>>[] }`
  - `export const csvToJson = (content: string, path: string) => Effect.Effect<CsvJsonData, MalformedCsv>`
  - `export const jsonToCsv = (data: CsvJsonData, path: string) => Effect.Effect<string, MalformedCsv>`

Notes for implementer:

- Strip `\r` before splitting lines; ignore a single trailing empty line after split
- Require at least name + header line; otherwise `MalformedCsv`
- Split data lines with a small RFC4180-ish field parser (quoted fields, `""` escapes)
- Validate headers: every header `trim` length > 0 and unique
- Each data row: same field count as headers; build `Record` with string values
- `jsonToCsv`: re-validate headers/rows; emit `name\n` + header row + data rows; quote cells that contain `,`, `"`, or `\n`; always end with `\n` if the original convention in tests uses trailing newline — **exact round-trip**: `jsonToCsv(csvToJson(s)) === s` for the fixtures below (normalize only by rejecting `\r` inputs that differ; test inputs use `\n` only)
- Prefer: if input ends with `\n`, output ends with `\n`; if input has no trailing newline after last row, preserve that — simplest approach that still passes tests: use the canonical form `name\nheaders\nrows...\n` and make all tests use that form (matches existing `"MyTable\na,b\n1,2\n"`)

- [ ] **Step 1: Write the failing tests**

Create `packages/swz/src/csvCodec.test.ts`:

```ts
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
      jsonToCsv(
        { name: "T", headers: ["a", "b"], rows: [{ a: "1" }] },
        "t.csv",
      ),
    );
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(MalformedCsv);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @gimped/swz exec vp test src/csvCodec.test.ts`

Expected: FAIL (module missing)

- [ ] **Step 3: Implement `csvCodec.ts`**

Create `packages/swz/src/csvCodec.ts` implementing the interfaces above. Keep helpers private (`parseLine`, `escapeCell`, `validateHeaders`, `validateRows`). Failures must set `path` to the argument path and a clear `message` (e.g. `Duplicate header "a"`, `Empty header`, `Row 1 missing key "b"`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @gimped/swz exec vp test src/csvCodec.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/swz/src/csvCodec.ts packages/swz/src/csvCodec.test.ts
git commit -m "feat(swz): add exact CSV JSON codec with header validation"
```
