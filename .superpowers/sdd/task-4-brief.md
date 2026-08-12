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
