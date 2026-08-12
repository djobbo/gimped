Base: 7fa9d79cff17561e9a962e8f76c6d42814fa1d3f
Head: 62f886d6313361ba980b692c530a99d573702da7

## Commits
62f886d feat(swz): add MalformedCsv/Xml/Json tagged errors
## Stat
 packages/swz/src/errors.parse.test.ts | 16 ++++++++++++++++
 packages/swz/src/errors.ts            | 15 +++++++++++++++
 2 files changed, 31 insertions(+)
## Diff
diff --git a/packages/swz/src/errors.parse.test.ts b/packages/swz/src/errors.parse.test.ts
new file mode 100644
index 0000000..f6d7f89
--- /dev/null
+++ b/packages/swz/src/errors.parse.test.ts
@@ -0,0 +1,16 @@
+import { describe, expect, it } from "vite-plus/test";
+import { MalformedCsv, MalformedJson, MalformedXml } from "./errors.ts";
+
+describe("parse errors", () => {
+  it("constructs MalformedCsv / MalformedXml / MalformedJson with path and message", () => {
+    const csv = new MalformedCsv({ path: "/a.csv", message: "dup header" });
+    const xml = new MalformedXml({ path: "/a.xml", message: "bad tag" });
+    const json = new MalformedJson({ path: "/a.json", message: "bad json" });
+
+    expect(csv._tag).toBe("MalformedCsv");
+    expect(csv.path).toBe("/a.csv");
+    expect(csv.message).toBe("dup header");
+    expect(xml._tag).toBe("MalformedXml");
+    expect(json._tag).toBe("MalformedJson");
+  });
+});
diff --git a/packages/swz/src/errors.ts b/packages/swz/src/errors.ts
index d37c65e..c4c04aa 100644
--- a/packages/swz/src/errors.ts
+++ b/packages/swz/src/errors.ts
@@ -15,10 +15,25 @@ export class UnknownVersion extends Schema.TaggedError<UnknownVersion>()("Unknow
 }) {}
 
 export class MissingRegistry extends Schema.TaggedError<MissingRegistry>()("MissingRegistry", {
   path: Schema.String,
 }) {}
 
 export class IoError extends Schema.TaggedError<IoError>()("IoError", {
   path: Schema.String,
   message: Schema.String,
 }) {}
+
+export class MalformedCsv extends Schema.TaggedError<MalformedCsv>()("MalformedCsv", {
+  path: Schema.String,
+  message: Schema.String,
+}) {}
+
+export class MalformedXml extends Schema.TaggedError<MalformedXml>()("MalformedXml", {
+  path: Schema.String,
+  message: Schema.String,
+}) {}
+
+export class MalformedJson extends Schema.TaggedError<MalformedJson>()("MalformedJson", {
+  path: Schema.String,
+  message: Schema.String,
+}) {}
