Base: 62f886d6313361ba980b692c530a99d573702da7
Head: 5de602a809f217be676e8d46627c8cf7fe8af6a1

## Commits
5de602a fix(swz): preserve CSV trailing newline round-trip
693c83f feat(swz): add exact CSV JSON codec with header validation
## Stat
 packages/swz/src/csvCodec.test.ts |  51 +++++++++++
 packages/swz/src/csvCodec.ts      | 175 ++++++++++++++++++++++++++++++++++++++
 2 files changed, 226 insertions(+)
## Diff
diff --git a/packages/swz/src/csvCodec.test.ts b/packages/swz/src/csvCodec.test.ts
new file mode 100644
index 0000000..6174832
--- /dev/null
+++ b/packages/swz/src/csvCodec.test.ts
@@ -0,0 +1,51 @@
+import { Effect } from "effect";
+import { describe, expect, it } from "vite-plus/test";
+import { MalformedCsv } from "./errors.ts";
+import { csvToJson, jsonToCsv } from "./csvCodec.ts";
+
+const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
+const runFail = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.result(effect));
+
+describe("csvCodec", () => {
+  it("round-trips exact native CSV including quoted cells", async () => {
+    const native = 'MyTable\na,b\n1,"x,y"\n';
+    const data = await run(csvToJson(native, "MyTable.csv"));
+    expect(data).toEqual({
+      name: "MyTable",
+      headers: ["a", "b"],
+      rows: [{ a: "1", b: "x,y" }],
+    });
+    expect(await run(jsonToCsv(data, "MyTable.csv"))).toBe(native);
+  });
+
+  it("round-trips exact native CSV without trailing newline", async () => {
+    const native = "MyTable\na,b\n1,2";
+    const data = await run(csvToJson(native, "MyTable.csv"));
+    expect(data).toEqual({
+      name: "MyTable",
+      headers: ["a", "b"],
+      rows: [{ a: "1", b: "2" }],
+    });
+    expect(await run(jsonToCsv(data, "MyTable.csv"))).toBe(native);
+  });
+
+  it("rejects empty and duplicate headers", async () => {
+    const empty = await runFail(csvToJson("T\n,a\n1,2\n", "t.csv"));
+    const dup = await runFail(csvToJson("T\na,a\n1,2\n", "t.csv"));
+    expect(empty._tag).toBe("Failure");
+    expect(dup._tag).toBe("Failure");
+    if (empty._tag === "Failure") expect(empty.failure).toBeInstanceOf(MalformedCsv);
+    if (dup._tag === "Failure") expect(dup.failure).toBeInstanceOf(MalformedCsv);
+  });
+
+  it("rejects row width / key mismatches on rebuild", async () => {
+    const result = await runFail(
+      jsonToCsv(
+        { name: "T", headers: ["a", "b"], rows: [{ a: "1" }] },
+        "t.csv",
+      ),
+    );
+    expect(result._tag).toBe("Failure");
+    if (result._tag === "Failure") expect(result.failure).toBeInstanceOf(MalformedCsv);
+  });
+});
diff --git a/packages/swz/src/csvCodec.ts b/packages/swz/src/csvCodec.ts
new file mode 100644
index 0000000..9016a86
--- /dev/null
+++ b/packages/swz/src/csvCodec.ts
@@ -0,0 +1,175 @@
+import { Effect } from "effect";
+import { MalformedCsv } from "./errors.ts";
+
+export type CsvJsonData = {
+  readonly name: string;
+  readonly headers: readonly string[];
+  readonly rows: readonly Readonly<Record<string, string>>[];
+};
+
+const malformed = (path: string, message: string): MalformedCsv => new MalformedCsv({ path, message });
+const HAS_TRAILING_NEWLINE = Symbol("csv.hasTrailingNewline");
+type CsvJsonDataWithMeta = CsvJsonData & { readonly [HAS_TRAILING_NEWLINE]?: boolean };
+
+const parseLine = (line: string): string[] => {
+  const fields: string[] = [];
+  let i = 0;
+
+  while (true) {
+    if (i > line.length) break;
+
+    if (line[i] === "\"") {
+      i += 1;
+      let value = "";
+      let closed = false;
+
+      while (i < line.length) {
+        const char = line[i]!;
+        if (char === "\"") {
+          if (line[i + 1] === "\"") {
+            value += "\"";
+            i += 2;
+            continue;
+          }
+          i += 1;
+          closed = true;
+          break;
+        }
+        value += char;
+        i += 1;
+      }
+
+      if (!closed) {
+        throw new Error("Unterminated quoted field");
+      }
+      if (i < line.length && line[i] !== ",") {
+        throw new Error(`Unexpected character "${line[i]}" after closing quote`);
+      }
+
+      fields.push(value);
+    } else {
+      const start = i;
+      while (i < line.length && line[i] !== ",") {
+        if (line[i] === "\"") {
+          throw new Error("Unexpected quote in unquoted field");
+        }
+        i += 1;
+      }
+      fields.push(line.slice(start, i));
+    }
+
+    if (i === line.length) break;
+
+    i += 1;
+    if (i === line.length) {
+      fields.push("");
+      break;
+    }
+  }
+
+  return fields;
+};
+
+const validateHeaders = (headers: readonly string[]): void => {
+  const seen = new Set<string>();
+  for (const header of headers) {
+    if (header.trim().length === 0) {
+      throw new Error("Empty header");
+    }
+    if (seen.has(header)) {
+      throw new Error(`Duplicate header "${header}"`);
+    }
+    seen.add(header);
+  }
+};
+
+const validateRows = (headers: readonly string[], rows: readonly Readonly<Record<string, string>>[]): void => {
+  const headerSet = new Set(headers);
+  for (const [index, row] of rows.entries()) {
+    const rowNumber = index + 1;
+    for (const header of headers) {
+      if (!(header in row)) {
+        throw new Error(`Row ${rowNumber} missing key "${header}"`);
+      }
+      if (typeof row[header] !== "string") {
+        throw new Error(`Row ${rowNumber} key "${header}" must be a string`);
+      }
+    }
+    for (const key of Object.keys(row)) {
+      if (!headerSet.has(key)) {
+        throw new Error(`Row ${rowNumber} has unexpected key "${key}"`);
+      }
+    }
+  }
+};
+
+const escapeCell = (cell: string): string => {
+  if (cell.includes(",") || cell.includes("\"") || cell.includes("\n")) {
+    return `"${cell.replaceAll("\"", "\"\"")}"`;
+  }
+  return cell;
+};
+
+export const csvToJson = (content: string, path: string): Effect.Effect<CsvJsonData, MalformedCsv> =>
+  Effect.try({
+    try: () => {
+      const normalized = content.replaceAll("\r", "");
+      const hasTrailingNewline = normalized.endsWith("\n");
+      const lines = normalized.split("\n");
+      if (lines.at(-1) === "") {
+        lines.pop();
+      }
+
+      if (lines.length < 2) {
+        throw new Error("CSV must include at least a name line and a header line");
+      }
+
+      const name = lines[0] ?? "";
+      const headers = parseLine(lines[1]!);
+      validateHeaders(headers);
+
+      const rows = lines.slice(2).map((line, index) => {
+        const fields = parseLine(line);
+        if (fields.length !== headers.length) {
+          throw new Error(
+            `Row ${index + 1} has ${fields.length} fields but expected ${headers.length}`,
+          );
+        }
+
+        const row: Record<string, string> = {};
+        for (const [headerIndex, header] of headers.entries()) {
+          row[header] = fields[headerIndex]!;
+        }
+        return row;
+      });
+
+      const result: CsvJsonDataWithMeta = { name, headers, rows };
+      Object.defineProperty(result, HAS_TRAILING_NEWLINE, {
+        value: hasTrailingNewline,
+        enumerable: false,
+      });
+      return result;
+    },
+    catch: (error) =>
+      malformed(path, error instanceof Error ? error.message : "Failed to parse CSV content"),
+  });
+
+export const jsonToCsv = (data: CsvJsonData, path: string): Effect.Effect<string, MalformedCsv> =>
+  Effect.try({
+    try: () => {
+      validateHeaders(data.headers);
+      validateRows(data.headers, data.rows);
+
+      const lines: string[] = [];
+      lines.push(data.name);
+      lines.push(data.headers.map(escapeCell).join(","));
+      for (const row of data.rows) {
+        lines.push(data.headers.map((header) => escapeCell(row[header]!)).join(","));
+      }
+
+      const hasTrailingNewline = (data as CsvJsonDataWithMeta)[HAS_TRAILING_NEWLINE] ?? true;
+      return hasTrailingNewline ? `${lines.join("\n")}\n` : lines.join("\n");
+    },
+    catch: (error) =>
+      malformed(path, error instanceof Error ? error.message : "Failed to build CSV content"),
+  });
