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
