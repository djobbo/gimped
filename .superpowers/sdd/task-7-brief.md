### Task 7: Library orchestration helpers

**Files:**

- Create: `packages/swz/src/pipeline.ts`
- Test: `packages/swz/src/pipeline.test.ts`
- Modify: `packages/swz/src/index.ts`

**Interfaces:**

- Consumes: codec, version keys, EntryIo, JsonTranspile
- Produces:
  - `decompileFile(opts: { inPath: string; outPath: string; version: string; json: boolean }): Effect<void, …>`
  - `compileFile(opts: { inPath: string; outPath: string; version: string; json: boolean }): Effect<void, …>`

Flow decompile: read bytes → `resolveKey` → `decompile` → `writeJsonDir` or `writeNativeDir`  
Flow compile: `readJsonDir` or `readNativeDir` → `resolveKey` → `compile` → write bytes

- [ ] **Step 1: Write integration test** that compiles synthetic entries to temp `.swz`, decompiles to dir, recompiles, decompiles again, compares entry contents (native and `--json` paths).

- [ ] **Step 2: Implement `pipeline.ts`; PASS; commit**

```bash
cd packages/swz && vp test src/pipeline.test.ts
git add packages/swz/src && git commit -m "feat(swz): decompile/compile file pipeline"
```

---
