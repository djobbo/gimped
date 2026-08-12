# Effect Layers refactor — Implementation Plan

> **For agentic workers:** Execute inline after this plan; steps use checkbox syntax.

**Goal:** Refactor `@gimped/swz` to Context.Service layers with Effect FS/Path, `Effect.fn`/`Effect.gen`, and `Schema.TaggedError` per `docs/superpowers/specs/2026-08-12-swz-effect-layers-design.md`.

**Architecture:** Services: Well512, SwzCodec, VersionKeys, EntryIo, JsonTranspile, Pipeline. Non-service: `errors`, `binary`. CLI provides `NodeServices.layer` + `Pipeline.Default`.

**Tech Stack:** effect `4.0.0-beta.107`, `@effect/platform-node` (CLI + swz tests).

## Tasks

1. Convert `errors.ts` to `Schema.TaggedError`
2. Convert `Well512` to `Context.Service` + layer; update test
3. Convert `SwzCodec` to service (uses Well512 + Crypto); update test
4. Convert `VersionKeys` to service; update test
5. Fold `Entry` into `EntryIo` service with FileSystem/Path; update test
6. Convert `JsonTranspile` to service with Schema decode + FileSystem/Path; update test
7. Convert `Pipeline` to service composing others; update test
8. Wire `index.ts`, CLI provide layers; fix CLI test
9. Update fixtures test; add `@effect/platform-node` to swz devDeps; run full suite

## Global Constraints

- No `node:fs` in `packages/swz/src`
- Service ids: `@gimped/swz/<Name>`
- Methods via `Effect.fn("Service.method")`
- Preserve fixture + behavioral tests
