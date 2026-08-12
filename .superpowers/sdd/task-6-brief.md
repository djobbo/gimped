### Task 6: JSON transpile + registry

**Files:**

- Create: `packages/swz/src/JsonTranspile.ts`
- Test: `packages/swz/src/JsonTranspile.test.ts`
- Modify: `packages/swz/src/index.ts`

**Interfaces:**

- Consumes: entry content; `MissingRegistry`, `IoError`
- Produces:
  - `type Registry = { files: Record<string, { filetype: "xml" | "csv" }> }`
  - `writeJsonDir(entries, outDir): Effect<void, IoError>`
  - `readJsonDir(inDir): Effect<SwzEntry[], IoError | MissingRegistry>`

**JSON schemas (fixed, reversible):**

XML file (`HeroTypes.json`):

```json
{
  "filetype": "xml",
  "xml": "<HeroTypes><x/></HeroTypes>"
}
```

CSV file (`MyTable.json`):

```json
{
  "filetype": "csv",
  "name": "MyTable",
  "text": "MyTable\na,b\n1,2\n"
}
```

(v1 stores exact native text in JSON for lossless round-trip; `fast-xml-parser` is available if a later task wants structured trees — do **not** change schema without updating tests.)

`registry.json`:

```json
{
  "files": {
    "HeroTypes.json": { "filetype": "xml" },
    "MyTable.json": { "filetype": "csv" }
  }
}
```

- [ ] **Step 1: Write failing round-trip test** (tmpdir; writeJsonDir → readJsonDir; missing registry fails)

- [ ] **Step 2: Implement; PASS; export; commit**

```bash
cd packages/swz && vp test src/JsonTranspile.test.ts
git add packages/swz/src && git commit -m "feat(swz): json transpile mode with registry"
```

---
