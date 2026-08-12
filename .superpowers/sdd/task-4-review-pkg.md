Base: 97cc1844be75e6f1611f9276ef334a97ce27520e
Head: 3da68a12b079b038ca0f852fbaf0c40b1edd0146

## Commits
3da68a1 feat(swz): wire JsonTranspile to structured codecs
## Stat
 packages/swz-cli/src/cli.test.ts       | 19 +++++++++++--
 packages/swz/src/JsonTranspile.test.ts | 46 ++++++++++++++++++++++++------
 packages/swz/src/JsonTranspile.ts      | 52 +++++++++++++++++++++++-----------
 packages/swz/src/pipeline.test.ts      | 24 ++++++++++++----
 packages/swz/src/pipeline.ts           | 13 ++++++++-
 5 files changed, 121 insertions(+), 33 deletions(-)
## Diff
diff --git a/packages/swz-cli/src/cli.test.ts b/packages/swz-cli/src/cli.test.ts
index 3efefc3..ed0a5fd 100644
--- a/packages/swz-cli/src/cli.test.ts
+++ b/packages/swz-cli/src/cli.test.ts
@@ -1,15 +1,16 @@
 import { NodeServices } from "@effect/platform-node";
 import { compile, layer, readJsonDir, readNativeDir } from "@gimped/swz";
 import { Effect, FileSystem, Layer, Path } from "effect";
 import { Command } from "effect/unstable/cli";
 import { describe, expect, it } from "vite-plus/test";
+import { xmlToJson } from "../../swz/src/xmlCodec.ts";
 import { root } from "./cli.ts";
 
 const entries = [{ content: "<HeroTypes><x/></HeroTypes>" }, { content: "MyTable\na,b\n1,2\n" }];
 const AppLive = layer.pipe(Layer.provideMerge(NodeServices.layer));
 const runCli = (args: ReadonlyArray<string>) =>
   Command.runWith(root, { version: "0.0.0" })(args).pipe(Effect.provide(AppLive));
 
 const run = <A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> =>
   Effect.runPromise(Effect.provide(effect, AppLive) as Effect.Effect<A, E>);
 
@@ -34,17 +35,31 @@ describe("swz CLI", () => {
         const rebuiltSwz = path.join(temp, "rebuilt.swz");
         const secondDir = path.join(temp, "second");
         const jsonFlag = json ? (["--json"] as const) : ([] as const);
 
         yield* fs.writeFile(sourceSwz, yield* compile(entries, 762411009, 12345));
         yield* runCli(["decompile", "--in", sourceSwz, "--out", firstDir, ...jsonFlag]);
         yield* runCli(["compile", "--in", firstDir, "--out", rebuiltSwz, ...jsonFlag]);
         yield* runCli(["decompile", "--in", rebuiltSwz, "--out", secondDir, ...jsonFlag]);
 
         const restored = json ? yield* readJsonDir(secondDir) : yield* readNativeDir(secondDir);
-        return restored.map((entry) => entry.content).sort();
+        return restored.map((entry) => entry.content);
       }),
     );
 
-    expect(actual).toEqual(entries.map((entry) => entry.content).sort());
+    if (!json) {
+      expect(actual.sort()).toEqual(entries.map((entry) => entry.content).sort());
+      return;
+    }
+
+    const csv = actual.find((content) => !content.trimStart().startsWith("<"));
+    const xml = actual.find((content) => content.trimStart().startsWith("<"));
+    expect(csv).toBe("MyTable\na,b\n1,2\n");
+    expect(xml).toBeDefined();
+
+    const [a, b] = await Promise.all([
+      run(xmlToJson(entries[0]!.content, "x.xml")),
+      run(xmlToJson(xml!, "x.xml")),
+    ]);
+    expect(b.root).toEqual(a.root);
   });
 });
diff --git a/packages/swz/src/JsonTranspile.test.ts b/packages/swz/src/JsonTranspile.test.ts
index 1a9da73..493e3f2 100644
--- a/packages/swz/src/JsonTranspile.test.ts
+++ b/packages/swz/src/JsonTranspile.test.ts
@@ -1,17 +1,18 @@
 import { Effect, FileSystem, Path } from "effect";
 import { describe, expect, it } from "vite-plus/test";
-import { IoError, MissingRegistry } from "./errors.ts";
+import { IoError, MalformedCsv, MalformedJson, MissingRegistry } from "./errors.ts";
 import { readJsonDir, writeJsonDir } from "./JsonTranspile.ts";
 import * as swz from "./index.ts";
 import { JsonTranspileLive } from "./layers.ts";
 import { runWith } from "./test-utils.ts";
+import { xmlToJson } from "./xmlCodec.ts";
 
 const run = runWith(JsonTranspileLive);
 
 describe("JsonTranspile", () => {
   it("exports JSON transpile functions from the package entry point", () => {
     expect(swz.writeJsonDir).toBe(writeJsonDir);
     expect(swz.readJsonDir).toBe(readJsonDir);
   });
 
   it("writes the fixed lossless schemas and round-trips entries", async () => {
@@ -31,34 +32,37 @@ describe("JsonTranspile", () => {
           hero: JSON.parse(yield* fs.readFileString(path.join(dir, "HeroTypes.json"))),
           table: JSON.parse(yield* fs.readFileString(path.join(dir, "MyTable.json"))),
           registry: JSON.parse(yield* fs.readFileString(path.join(dir, "registry.json"))),
           back: (yield* readJsonDir(dir)).map((entry) => entry.content),
         };
       }),
     );
 
     expect(snapshot.hero).toEqual({
       filetype: "xml",
-      xml: "<HeroTypes><x/></HeroTypes>",
+      root: { HeroTypes: { x: "" } },
     });
     expect(snapshot.table).toEqual({
       filetype: "csv",
       name: "MyTable",
-      text: "MyTable\na,b\n1,2\n",
+      headers: ["a", "b"],
+      rows: [{ a: "1", b: "2" }],
     });
     expect(snapshot.registry).toEqual({
       files: {
         "HeroTypes.json": { filetype: "xml" },
         "MyTable.json": { filetype: "csv" },
       },
     });
-    expect(snapshot.back).toEqual(["<HeroTypes><x/></HeroTypes>", "MyTable\na,b\n1,2\n"]);
+    expect(snapshot.back[1]).toBe("MyTable\na,b\n1,2\n");
+    const xmlAgain = await run(xmlToJson(snapshot.back[0]!, "HeroTypes.xml"));
+    expect(xmlAgain.root).toEqual(snapshot.hero.root);
   });
 
   it("rejects entries that resolve to the same JSON filename", async () => {
     const { result, expectedPath } = await run(
       Effect.gen(function* () {
         const fs = yield* FileSystem.FileSystem;
         const path = yield* Path.Path;
         const dir = yield* fs.makeTempDirectory({ prefix: "swz-json-" });
         const result = yield* Effect.result(
           writeJsonDir(
@@ -73,33 +77,51 @@ describe("JsonTranspile", () => {
       }),
     );
 
     expect(result._tag).toBe("Failure");
     if (result._tag === "Failure") {
       expect(result.failure).toBeInstanceOf(IoError);
       expect(result.failure.path).toBe(expectedPath);
     }
   });
 
-  it("rejects malformed JSON entries and registry filetype mismatches", async () => {
+  it("rejects malformed JSON entries, malformed CSV payloads, and registry filetype mismatches", async () => {
     const cases = [
       {
+        expected: "MalformedJson" as const,
         registryType: "xml" as const,
         entry: { filetype: "xml", xml: 42 },
       },
       {
+        expected: "MalformedJson" as const,
         registryType: "csv" as const,
         entry: { filetype: "csv", text: null },
       },
       {
+        expected: "IoError" as const,
         registryType: "xml" as const,
-        entry: { filetype: "csv", name: "HeroTypes", text: "HeroTypes\na,b\n" },
+        entry: {
+          filetype: "csv",
+          name: "HeroTypes",
+          headers: ["a", "b"],
+          rows: [{ a: "1", b: "2" }],
+        },
+      },
+      {
+        expected: "MalformedCsv" as const,
+        registryType: "csv" as const,
+        entry: {
+          filetype: "csv",
+          name: "MyTable",
+          headers: ["a", "a"],
+          rows: [{ a: "1" }],
+        },
       },
     ];
 
     for (const testCase of cases) {
       const { result, filePath } = await run(
         Effect.gen(function* () {
           const fs = yield* FileSystem.FileSystem;
           const path = yield* Path.Path;
           const dir = yield* fs.makeTempDirectory({ prefix: "swz-json-" });
           const filePath = path.join(dir, "entry.json");
@@ -108,22 +130,30 @@ describe("JsonTranspile", () => {
             JSON.stringify({ files: { "entry.json": { filetype: testCase.registryType } } }),
           );
           yield* fs.writeFileString(filePath, JSON.stringify(testCase.entry));
           const result = yield* Effect.result(readJsonDir(dir));
           return { result, filePath };
         }),
       );
 
       expect(result._tag).toBe("Failure");
       if (result._tag === "Failure") {
-        expect(result.failure).toBeInstanceOf(IoError);
-        expect(result.failure.path).toBe(filePath);
+        if (testCase.expected === "MalformedJson") {
+          expect(result.failure).toBeInstanceOf(MalformedJson);
+          expect(result.failure.path).toBe(filePath);
+        } else if (testCase.expected === "MalformedCsv") {
+          expect(result.failure).toBeInstanceOf(MalformedCsv);
+          expect(result.failure.path).toBe(filePath);
+        } else {
+          expect(result.failure).toBeInstanceOf(IoError);
+          expect(result.failure.path).toBe(filePath);
+        }
       }
     }
   });
 
   it("fails with MissingRegistry when registry.json is absent", async () => {
     const { result, registryPath } = await run(
       Effect.gen(function* () {
         const fs = yield* FileSystem.FileSystem;
         const path = yield* Path.Path;
         const dir = yield* fs.makeTempDirectory({ prefix: "swz-json-" });
diff --git a/packages/swz/src/JsonTranspile.ts b/packages/swz/src/JsonTranspile.ts
index 93219a9..3ab618d 100644
--- a/packages/swz/src/JsonTranspile.ts
+++ b/packages/swz/src/JsonTranspile.ts
@@ -1,56 +1,66 @@
 import { Context, Effect, FileSystem, Layer, Path, Schema } from "effect";
 import type { PlatformError } from "effect/PlatformError";
+import { csvToJson, jsonToCsv } from "./csvCodec.ts";
 import { detectFiletype, entryFileName } from "./EntryIo.ts";
-import { IoError, MissingRegistry } from "./errors.ts";
+import { IoError, MalformedCsv, MalformedJson, MalformedXml, MissingRegistry } from "./errors.ts";
 import type { SwzEntry } from "./SwzCodec.ts";
+import { jsonToXml, xmlToJson } from "./xmlCodec.ts";
 
 export const RegistryEntry = Schema.Struct({
   filetype: Schema.Literals(["xml", "csv"]),
 });
 
 export const Registry = Schema.Struct({
   files: Schema.Record(Schema.String, RegistryEntry),
 });
 export type Registry = typeof Registry.Type;
 
 const XmlJsonEntry = Schema.Struct({
   filetype: Schema.Literal("xml"),
-  xml: Schema.String,
+  root: Schema.Record(Schema.String, Schema.Unknown),
 });
 
 const CsvJsonEntry = Schema.Struct({
   filetype: Schema.Literal("csv"),
-  name: Schema.optionalKey(Schema.String),
-  text: Schema.String,
+  name: Schema.String,
+  headers: Schema.Array(Schema.String),
+  rows: Schema.Array(Schema.Record(Schema.String, Schema.String)),
 });
 
 const JsonEntry = Schema.Union([XmlJsonEntry, CsvJsonEntry]);
 type JsonEntry = typeof JsonEntry.Type;
 
 const toIoError = (path: string, error: PlatformError | unknown): IoError =>
   new IoError({
     path,
     message: error instanceof Error ? error.message : String(error),
   });
+const toMalformedJson = (path: string, error: unknown): MalformedJson =>
+  new MalformedJson({
+    path,
+    message: error instanceof Error ? error.message : String(error),
+  });
 
 const jsonFileName = (content: string, pathApi: Path.Path): string =>
   `${pathApi.parse(entryFileName(content)).name}.json`;
 
 export class JsonTranspile extends Context.Service<
   JsonTranspile,
   {
     readonly writeJsonDir: (
       entries: readonly SwzEntry[],
       outDir: string,
-    ) => Effect.Effect<void, IoError>;
-    readonly readJsonDir: (inDir: string) => Effect.Effect<SwzEntry[], IoError | MissingRegistry>;
+    ) => Effect.Effect<void, IoError | MalformedCsv | MalformedXml>;
+    readonly readJsonDir: (
+      inDir: string,
+    ) => Effect.Effect<SwzEntry[], IoError | MissingRegistry | MalformedJson | MalformedCsv | MalformedXml>;
   }
 >()("@gimped/swz/JsonTranspile") {
   static readonly layer: Layer.Layer<JsonTranspile, never, FileSystem.FileSystem | Path.Path> =
     Layer.effect(
       JsonTranspile,
       Effect.gen(function* () {
         const fs = yield* FileSystem.FileSystem;
         const path = yield* Path.Path;
 
         const writeJsonDir = Effect.fn("JsonTranspile.writeJsonDir")(function* (
@@ -75,32 +85,28 @@ export class JsonTranspile extends Context.Service<
           yield* fs
             .makeDirectory(outDir, { recursive: true })
             .pipe(Effect.mapError((error) => toIoError(outDir, error)));
 
           const registryFiles: Record<string, { filetype: "xml" | "csv" }> = {};
 
           yield* Effect.forEach(entries, (entry, index) =>
             Effect.gen(function* () {
               const filetype = detectFiletype(entry.content);
               const fileName = fileNames[index]!;
-              const jsonEntry: JsonEntry =
+              const filePath = path.join(outDir, fileName);
+              const body =
                 filetype === "xml"
-                  ? { filetype, xml: entry.content }
-                  : {
-                      filetype,
-                      name: entry.content.split("\n", 1)[0]?.replaceAll("\r", "") ?? "",
-                      text: entry.content,
-                    };
+                  ? { filetype, ...(yield* xmlToJson(entry.content, filePath)) }
+                  : { filetype, ...(yield* csvToJson(entry.content, filePath)) };
 
-              const filePath = path.join(outDir, fileName);
               yield* fs
-                .writeFileString(filePath, `${JSON.stringify(jsonEntry, null, 2)}\n`)
+                .writeFileString(filePath, `${JSON.stringify(body, null, 2)}\n`)
                 .pipe(Effect.mapError((error) => toIoError(filePath, error)));
               registryFiles[fileName] = { filetype };
             }),
           );
 
           const registry: Registry = { files: registryFiles };
           const registryPath = path.join(outDir, "registry.json");
           yield* fs
             .writeFileString(registryPath, `${JSON.stringify(registry, null, 2)}\n`)
             .pipe(Effect.mapError((error) => toIoError(registryPath, error)));
@@ -127,31 +133,43 @@ export class JsonTranspile extends Context.Service<
           return yield* Effect.forEach(fileNames, (fileName) =>
             Effect.gen(function* () {
               const filePath = path.join(inDir, fileName);
               const expectedFiletype = registry.files[fileName]!.filetype;
               const text = yield* fs
                 .readFileString(filePath)
                 .pipe(Effect.mapError((error) => toIoError(filePath, error)));
 
               const jsonEntry = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(JsonEntry))(
                 text,
-              ).pipe(Effect.mapError((error) => toIoError(filePath, error)));
+              ).pipe(Effect.mapError((error) => toMalformedJson(filePath, error)));
 
               if (jsonEntry.filetype !== expectedFiletype) {
                 return yield* new IoError({
                   path: filePath,
                   message: `JSON filetype must match registry filetype ${expectedFiletype}`,
                 });
               }
 
+              const content =
+                jsonEntry.filetype === "xml"
+                  ? yield* jsonToXml({ root: jsonEntry.root }, filePath)
+                  : yield* jsonToCsv(
+                      {
+                        name: jsonEntry.name,
+                        headers: jsonEntry.headers,
+                        rows: jsonEntry.rows,
+                      },
+                      filePath,
+                    );
+
               return {
-                content: jsonEntry.filetype === "xml" ? jsonEntry.xml : jsonEntry.text,
+                content,
               } satisfies SwzEntry;
             }),
           );
         });
 
         return JsonTranspile.of({ writeJsonDir, readJsonDir });
       }),
     );
 }
 
diff --git a/packages/swz/src/pipeline.test.ts b/packages/swz/src/pipeline.test.ts
index e0707af..37888bc 100644
--- a/packages/swz/src/pipeline.test.ts
+++ b/packages/swz/src/pipeline.test.ts
@@ -1,17 +1,18 @@
 import { Effect, FileSystem, Path } from "effect";
 import { describe, expect, it } from "vite-plus/test";
 import * as swz from "./index.ts";
 import { TestLive } from "./layers.ts";
 import { runWith } from "./test-utils.ts";
 import { compileFile, decompileFile } from "./pipeline.ts";
 import { compile } from "./SwzCodec.ts";
+import { xmlToJson } from "./xmlCodec.ts";
 
 const entries = [{ content: "<HeroTypes><x/></HeroTypes>" }, { content: "MyTable\na,b\n1,2\n" }];
 
 const run = runWith(TestLive);
 
 describe("file pipeline", () => {
   it("exports orchestration helpers from the package entry point", () => {
     expect(swz.decompileFile).toBe(decompileFile);
     expect(swz.compileFile).toBe(compileFile);
   });
@@ -45,20 +46,33 @@ describe("file pipeline", () => {
           version: "latest",
           json,
         });
         yield* decompileFile({
           inPath: rebuiltSwz,
           outPath: secondDir,
           version: "latest",
           json,
         });
 
-        const restored = json
-          ? yield* swz.readJsonDir(secondDir)
-          : yield* swz.readNativeDir(secondDir);
-        return restored.map((entry) => entry.content).sort();
+        const restored = json ? yield* swz.readJsonDir(secondDir) : yield* swz.readNativeDir(secondDir);
+        return restored.map((entry) => entry.content);
       }),
     );
 
-    expect(actual).toEqual(entries.map((entry) => entry.content).sort());
+    if (!json) {
+      expect(actual.sort()).toEqual(entries.map((entry) => entry.content).sort());
+      return;
+    }
+
+    const csv = actual.find((content) => !content.trimStart().startsWith("<"));
+    const xml = actual.find((content) => content.trimStart().startsWith("<"));
+    expect(csv).toBe("MyTable\na,b\n1,2\n");
+    expect(xml).toBeDefined();
+
+    const originalXml = entries[0]!.content;
+    const [a, b] = await Promise.all([
+      run(xmlToJson(originalXml, "x.xml")),
+      run(xmlToJson(xml!, "x.xml")),
+    ]);
+    expect(b.root).toEqual(a.root);
   });
 });
diff --git a/packages/swz/src/pipeline.ts b/packages/swz/src/pipeline.ts
index 048e2f4..6ffa4d4 100644
--- a/packages/swz/src/pipeline.ts
+++ b/packages/swz/src/pipeline.ts
@@ -1,33 +1,44 @@
 import { Context, Crypto, Effect, FileSystem, Layer, Path } from "effect";
 import type { PlatformError } from "effect/PlatformError";
 import { EntryIo } from "./EntryIo.ts";
 import {
   ChecksumMismatch,
   InvalidSwz,
   IoError,
+  MalformedCsv,
+  MalformedJson,
+  MalformedXml,
   MissingRegistry,
   UnknownVersion,
 } from "./errors.ts";
 import { JsonTranspile } from "./JsonTranspile.ts";
 import { SwzCodec } from "./SwzCodec.ts";
 import { VersionKeys } from "./VersionKeys.ts";
 import { Well512 } from "./Well512.ts";
 
 export type FilePipelineOptions = {
   readonly inPath: string;
   readonly outPath: string;
   readonly version: string;
   readonly json: boolean;
 };
 
-type PipelineError = IoError | MissingRegistry | UnknownVersion | ChecksumMismatch | InvalidSwz;
+type PipelineError =
+  | IoError
+  | MissingRegistry
+  | UnknownVersion
+  | ChecksumMismatch
+  | InvalidSwz
+  | MalformedCsv
+  | MalformedXml
+  | MalformedJson;
 
 const toIoError = (path: string, error: PlatformError | unknown): IoError =>
   new IoError({
     path,
     message: error instanceof Error ? error.message : String(error),
   });
 
 export class Pipeline extends Context.Service<
   Pipeline,
   {
