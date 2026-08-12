# Structured JSON Transpile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace string-embedding JSON mode with structured CSV↔JSON (exact) and XML↔JSON (semantic) conversion, plus `MalformedCsv` / `MalformedXml` / `MalformedJson` errors.

**Architecture:** Keep `JsonTranspile` as the directory/registry service. Add pure converters `csvCodec.ts` (hand-rolled) and `xmlCodec.ts` (`fast-xml-parser`). Schema-validate JSON entry documents; map parse/shape failures to the new tagged errors. Widen `Pipeline` error unions so CLI surfaces them.

**Tech Stack:** Effect `4.0.0-beta.107`, `fast-xml-parser`, Vitest via Vite+ (`vp test`), existing `@gimped/swz` service/layer patterns.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-swz-json-structured-design.md`
- CSV round-trip must be **exact** native string equality; XML only **semantic**
- CSV JSON shape: `{ filetype: "csv", name, headers, rows: Record<string,string>[] }` — reject empty/duplicate headers and row key mismatches
- XML JSON shape: `{ filetype: "xml", root: { RootTag: ... } }` with `@_` attributes and `#text` via `fast-xml-parser`
- No raw `xml` / `text` string payload fields in written JSON entries
- No `node:fs` in `packages/swz/src`
- Prefer TDD: failing test → implement → pass → commit per task

## File structure

| File | Role |
| ---- | ---- |
| `packages/swz/src/errors.ts` | Add `MalformedCsv`, `MalformedXml`, `MalformedJson` |
| `packages/swz/src/csvCodec.ts` | Pure `csvToJson` / `jsonToCsv` |
| `packages/swz/src/csvCodec.test.ts` | CSV unit tests |
| `packages/swz/src/xmlCodec.ts` | Pure `xmlToJson` / `jsonToXml` |
| `packages/swz/src/xmlCodec.test.ts` | XML unit tests |
| `packages/swz/src/JsonTranspile.ts` | Wire converters + new entry schemas + `MalformedJson` |
| `packages/swz/src/JsonTranspile.test.ts` | Update expectations + parse-error cases |
| `packages/swz/src/pipeline.ts` | Widen `PipelineError` |
| `packages/swz/src/pipeline.test.ts` | JSON path: exact CSV, semantic XML |
| `packages/swz/package.json` / lockfile | Add `fast-xml-parser` dependency |
| `packages/swz-cli/src/cli.test.ts` | Only if JSON round-trip assertions break |

---

### Task 1: Tagged parse errors

**Files:**
- Modify: `packages/swz/src/errors.ts`
- Create: `packages/swz/src/errors.parse.test.ts`

**Interfaces:**
- Produces:
  - `new MalformedCsv({ path: string, message: string })`
  - `new MalformedXml({ path: string, message: string })`
  - `new MalformedJson({ path: string, message: string })`

- [ ] **Step 1: Write the failing test**

Create `packages/swz/src/errors.parse.test.ts`:

```ts
import { describe, expect, it } from "vite-plus/test";
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gimped/swz exec vp test src/errors.parse.test.ts`

Expected: FAIL (exports missing)

- [ ] **Step 3: Add the three TaggedError classes**

Append to `packages/swz/src/errors.ts` (same pattern as `IoError`):

```ts
export class MalformedCsv extends Schema.TaggedError<MalformedCsv>()("MalformedCsv", {
  path: Schema.String,
  message: Schema.String,
}) {}

export class MalformedXml extends Schema.TaggedError<MalformedXml>()("MalformedXml", {
  path: Schema.String,
  message: Schema.String,
}) {}

export class MalformedJson extends Schema.TaggedError<MalformedJson>()("MalformedJson", {
  path: Schema.String,
  message: Schema.String,
}) {}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gimped/swz exec vp test src/errors.parse.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/swz/src/errors.ts packages/swz/src/errors.parse.test.ts
git commit -m "feat(swz): add MalformedCsv/Xml/Json tagged errors"
```

---

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

---

### Task 3: XML codec (semantic round-trip)

**Files:**
- Modify: `packages/swz/package.json` (add dependency)
- Modify: `pnpm-lock.yaml` (via install)
- Create: `packages/swz/src/xmlCodec.ts`
- Create: `packages/swz/src/xmlCodec.test.ts`

**Interfaces:**
- Consumes: `MalformedXml` from `./errors.ts`, `fast-xml-parser`
- Produces:
  - `export type XmlJsonData = { readonly root: Readonly<Record<string, unknown>> }`
  - `export const xmlToJson = (content: string, path: string) => Effect.Effect<XmlJsonData, MalformedXml>`
  - `export const jsonToXml = (data: XmlJsonData, path: string) => Effect.Effect<string, MalformedXml>`

`fast-xml-parser` options (both directions must agree):

```ts
{
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  // allow boolean-like / number coercion OFF — keep strings where possible
  parseAttributeValue: false,
  parseTagValue: false,
}
```

- `xmlToJson`: `XMLParser.parse` → ensure result is a non-null object with exactly one own key (the root tag); wrap as `{ root: parsed }`; on throw/invalid → `MalformedXml`
- `jsonToXml`: require `data.root` is object with exactly one key; `XMLBuilder.build(data.root)`; on throw/invalid → `MalformedXml`

- [ ] **Step 1: Add dependency**

Run from repo root:

```bash
pnpm --filter @gimped/swz add fast-xml-parser
```

Expected: `packages/swz/package.json` lists `fast-xml-parser`; lockfile updated.

- [ ] **Step 2: Write the failing tests**

Create `packages/swz/src/xmlCodec.test.ts`:

```ts
import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { MalformedXml } from "./errors.ts";
import { jsonToXml, xmlToJson } from "./xmlCodec.ts";

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
const runFail = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.result(effect));

describe("xmlCodec", () => {
  it("round-trips semantically (parse → json → xml → parse)", async () => {
    const native = '<HeroTypes><Hero name="bodvar"><Stat v="1"/></Hero></HeroTypes>';
    const data = await run(xmlToJson(native, "HeroTypes.xml"));
    expect(data.root).toEqual({
      HeroTypes: {
        Hero: {
          "@_name": "bodvar",
          Stat: { "@_v": "1" },
        },
      },
    });
    const rebuilt = await run(jsonToXml(data, "HeroTypes.xml"));
    const again = await run(xmlToJson(rebuilt, "HeroTypes.xml"));
    expect(again.root).toEqual(data.root);
  });

  it("rejects malformed XML", async () => {
    const result = await runFail(xmlToJson("<HeroTypes><Hero></HeroTypes>", "bad.xml"));
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(MalformedXml);
  });
});
```

If `fast-xml-parser` yields slightly different trees for self-closing vs empty elements, adjust the expected `data.root` to whatever the parser actually emits — keep the semantic second-parse equality assertion.

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @gimped/swz exec vp test src/xmlCodec.test.ts`

Expected: FAIL (module missing)

- [ ] **Step 4: Implement `xmlCodec.ts`**

Create `packages/swz/src/xmlCodec.ts` with `XMLParser` / `XMLBuilder` from `fast-xml-parser` using the options above.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @gimped/swz exec vp test src/xmlCodec.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/swz/package.json pnpm-lock.yaml packages/swz/src/xmlCodec.ts packages/swz/src/xmlCodec.test.ts
git commit -m "feat(swz): add semantic XML JSON codec via fast-xml-parser"
```

---

### Task 4: Wire JsonTranspile to structured converters

**Files:**
- Modify: `packages/swz/src/JsonTranspile.ts`
- Modify: `packages/swz/src/JsonTranspile.test.ts`
- Modify: `packages/swz/src/pipeline.ts` (`PipelineError` union)
- Modify: `packages/swz/src/pipeline.test.ts`

**Interfaces:**
- Consumes: `csvToJson` / `jsonToCsv`, `xmlToJson` / `jsonToXml`, new errors
- Produces (updated service method errors):
  - `writeJsonDir: (...) => Effect.Effect<void, IoError | MalformedCsv | MalformedXml>`
  - `readJsonDir: (...) => Effect.Effect<SwzEntry[], IoError | MissingRegistry | MalformedJson | MalformedCsv | MalformedXml>`
- `PipelineError` becomes:
  `IoError | MissingRegistry | UnknownVersion | ChecksumMismatch | InvalidSwz | MalformedCsv | MalformedXml | MalformedJson`

Schema changes inside `JsonTranspile.ts`:

```ts
const XmlJsonEntry = Schema.Struct({
  filetype: Schema.Literal("xml"),
  root: Schema.Record(Schema.String, Schema.Unknown),
});

const CsvJsonEntry = Schema.Struct({
  filetype: Schema.Literal("csv"),
  name: Schema.String,
  headers: Schema.Array(Schema.String),
  rows: Schema.Array(Schema.Record(Schema.String, Schema.String)),
});
```

`writeJsonDir` per entry:

```ts
const filetype = detectFiletype(entry.content);
const filePath = path.join(outDir, fileName);
const body =
  filetype === "xml"
    ? { filetype, ...(yield* xmlToJson(entry.content, filePath)) }
    : { filetype, ...(yield* csvToJson(entry.content, filePath)) };
```

`readJsonDir` per entry:

- Decode with `Schema.fromJsonString(JsonEntry)`; on failure → `MalformedJson` (not `IoError`)
- Filetype mismatch vs registry → `IoError` (unchanged)
- Rebuild: `jsonToXml` / `jsonToCsv` → `{ content }`

- [ ] **Step 1: Update JsonTranspile tests first (TDD)**

Replace the round-trip expectation in `JsonTranspile.test.ts` so written files look like:

```ts
expect(snapshot.hero).toEqual({
  filetype: "xml",
  root: { HeroTypes: { x: "" } }, // adjust to actual fast-xml-parser output for `<HeroTypes><x/></HeroTypes>`
});
expect(snapshot.table).toEqual({
  filetype: "csv",
  name: "MyTable",
  headers: ["a", "b"],
  rows: [{ a: "1", b: "2" }],
});
expect(snapshot.back).toEqual([
  // XML may differ as string — assert CSV exact; for XML assert via xmlToJson equality OR keep back contents and compare semantically in a dedicated expect
]);
```

Recommended assertion for `back`:

```ts
expect(snapshot.back[1]).toBe("MyTable\na,b\n1,2\n");
const xmlAgain = await run(xmlToJson(snapshot.back[0]!, "HeroTypes.xml"));
expect(xmlAgain.root).toEqual(snapshot.hero.root);
```

Change malformed entry cases to expect `MalformedJson` when Schema fails; add one case with invalid CSV headers in a well-typed JSON document expecting `MalformedCsv` on read (via `jsonToCsv` validation).

Change the old `{ filetype: "xml", xml: 42 }` case: still `MalformedJson`.

- [ ] **Step 2: Run JsonTranspile tests — expect FAIL**

Run: `pnpm --filter @gimped/swz exec vp test src/JsonTranspile.test.ts`

Expected: FAIL on shape expectations

- [ ] **Step 3: Implement JsonTranspile + pipeline error widening**

Update `JsonTranspile.ts` and `pipeline.ts` as specified. Re-export nothing new required beyond existing `writeJsonDir` / `readJsonDir` (errors are part of Effect channels).

- [ ] **Step 4: Fix pipeline JSON round-trip test**

In `pipeline.test.ts`, split assertions when `json === true`:

```ts
const restored = /* ... */;
const byContent = restored.map((e) => e.content);
const csv = byContent.find((c) => !c.trimStart().startsWith("<"))!;
const xml = byContent.find((c) => c.trimStart().startsWith("<"))!;
expect(csv).toBe("MyTable\na,b\n1,2\n");
const originalXml = entries[0]!.content;
const a = yield* xmlToJson(originalXml, "x.xml");
const b = yield* xmlToJson(xml, "x.xml");
expect(b.root).toEqual(a.root);
```

For `json === false`, keep exact full-array equality.

If `packages/swz-cli/src/cli.test.ts` compares exact entry strings after `--json`, apply the same semantic XML check.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm --filter @gimped/swz exec vp test src/JsonTranspile.test.ts src/pipeline.test.ts
pnpm --filter @gimped/swz-cli exec vp test
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/swz/src/JsonTranspile.ts packages/swz/src/JsonTranspile.test.ts packages/swz/src/pipeline.ts packages/swz/src/pipeline.test.ts packages/swz-cli/src/cli.test.ts
git commit -m "feat(swz): structured CSV/XML JSON transpile with parse errors"
```

---

### Task 5: Full suite verification

**Files:** none expected beyond fixes if something fails

- [ ] **Step 1: Run full package tests**

```bash
pnpm --filter @gimped/swz exec vp test
pnpm --filter @gimped/swz-cli exec vp test
```

Expected: all PASS

- [ ] **Step 2: Run check if normally used**

```bash
pnpm check
```

Expected: PASS (or fix any type errors from widened channels)

- [ ] **Step 3: Commit only if fixes were needed**

```bash
git add -u
git commit -m "fix(swz): finish structured JSON transpile type/test fallout"
```

Skip this commit if the tree is clean.

---

## Spec coverage checklist

| Spec requirement | Task |
| ---------------- | ---- |
| CSV named-rows JSON schema | 2, 4 |
| Exact CSV round-trip + quoting | 2 |
| Empty/duplicate header errors | 2 |
| XML `@_` / `#text` tree | 3 |
| Semantic XML round-trip | 3, 4 |
| `MalformedCsv` / `MalformedXml` / `MalformedJson` | 1, 2, 3, 4 |
| Registry unchanged | 4 |
| Pipeline/CLI error channel widen | 4, 5 |
| No raw `xml`/`text` fields | 4 |
| `fast-xml-parser` dependency | 3 |
