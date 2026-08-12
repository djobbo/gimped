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
