# Task 1 Report: Tagged parse errors

## Status

Complete. Three `Schema.TaggedError` classes added to `errors.ts` with construction test. No changes to JsonTranspile or codecs.

## TDD Evidence

### RED — Step 2: Failing test before implementation

Command: `pnpm --filter @gimped/swz exec vp test src/errors.parse.test.ts`

```
 FAIL  src/errors.parse.test.ts > parse errors > constructs MalformedCsv / MalformedXml / MalformedJson with path and message
TypeError: MalformedCsv is not a constructor
 ❯ src/errors.parse.test.ts:6:17
```

Result: **FAIL** (exports missing) — as expected.

### GREEN — Step 4: Passing test after implementation

Command: `pnpm --filter @gimped/swz exec vp test src/errors.parse.test.ts`

```
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

Result: **PASS**

## Implementation

### Modified: `packages/swz/src/errors.ts`

Appended three classes matching the existing `IoError` pattern:

- `MalformedCsv` — tag `"MalformedCsv"`, fields `path`, `message`
- `MalformedXml` — tag `"MalformedXml"`, fields `path`, `message`
- `MalformedJson` — tag `"MalformedJson"`, fields `path`, `message`

### Created: `packages/swz/src/errors.parse.test.ts`

Single test verifying construction and `_tag` / field values for all three error types.

## Full package suite (pre-commit)

Command: `pnpm --filter @gimped/swz exec vp test`

```
 Test Files  8 passed (8)
      Tests  37 passed (37)
```

No regressions.

## Commit

```
62f886d feat(swz): add MalformedCsv/Xml/Json tagged errors
```

Files: `packages/swz/src/errors.ts`, `packages/swz/src/errors.parse.test.ts`

## Self-review

| Check | Result |
| ----- | ------ |
| Matches brief verbatim (class names, fields, test code) | Yes |
| Same `Schema.TaggedError` pattern as `IoError` | Yes |
| JsonTranspile / codecs untouched | Yes |
| TDD order: test first, then implementation | Yes |
| Focused test RED then GREEN | Yes |
| Full suite green before commit | Yes |

### Notes

- Test asserts `xml._tag` and `json._tag` but not their `path`/`message` fields; this matches the brief exactly.
- Errors are exported from `errors.ts` but not re-exported from a package index; downstream tasks will wire them into JsonTranspile.

## Concerns

None.
