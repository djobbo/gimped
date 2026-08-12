# Effect Layer refactor for `@gimped/swz` — Design

Date: 2026-08-12  
Status: approved (pending written-spec review)

## Goal

Refactor `@gimped/swz` to Effect v4 service/Layer style per `.repos/effect/LLMS.md` and `effect/AGENTS.md`:

- Prefer Effect `FileSystem` / `Path` (no `node:fs`)
- Prefer `Effect.fn("…")` + `Effect.gen` (no vanilla Promise/fs helpers as the public style)
- Behavioral modules as `Context.Service` with `static layer`
- Errors as `Schema.TaggedError`

## Service layout (option B)

| Service         | Responsibility                                           | Dependencies                                              |
| --------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| `Well512`       | Factory: `create()` → instance with `initState` / `next` | —                                                         |
| `SwzCodec`      | `compile` / `decompile`                                  | `Well512`                                                 |
| `VersionKeys`   | `resolveKey`, default key map                            | —                                                         |
| `EntryIo`       | native dir read/write + entry naming                     | `FileSystem`, `Path`                                      |
| `JsonTranspile` | JSON dir + registry (Schema decode)                      | `FileSystem`, `Path`                                      |
| `Pipeline`      | `decompileFile` / `compileFile`                          | codec, keys, EntryIo, JsonTranspile, `FileSystem`, `Path` |

**Non-service:** `errors.ts` (`Schema.TaggedError`), `binary.ts` (pure BE/ROTR helpers used by `SwzCodec`).

Service ids follow `"@gimped/swz/<Module>"`.

## Style rules

- Methods: `Effect.fn("Service.method")(function* (…) { … })`
- Layers: `Layer.effect(Service, Effect.gen(…))` returning `Service.of({ … })`
- IO: `yield* FileSystem.FileSystem` / `yield* Path.Path`; map `PlatformError` → `IoError` at the service boundary where the public API uses `IoError`
- JSON/registry: `Schema` decode (no hand-rolled `isRecord` parsers)
- `Pipeline.Default` (or `Pipeline.layer`) composes child layers via `Layer.provide` / `provideMerge`
- CLI/tests: provide `NodeServices.layer` (or Node FS+Path) then app layers

## Testing

- Prefer `@effect/vitest` `it.effect` where practical, or `Effect.provide` + `Effect.runPromise`
- Fixture tests load SWZ bytes via `FileSystem.readFile`
- Existing behavioral coverage preserved (codec, keys, native/json IO, pipeline, real fixtures)

## Out of scope

- Changing CLI flag surface
- Key bruteforce / ANE bindings
- Structured XML trees (JSON mode stays lossless text fields)

## Success criteria

1. No `node:fs` / `node:fs/promises` imports in `packages/swz`
2. Each behavioral module exports a `Context.Service` + `layer`
3. Public operations use `Effect.fn` / consume services via `yield*`
4. Errors use `Schema.TaggedError`
5. Package tests pass (including real fixtures)
