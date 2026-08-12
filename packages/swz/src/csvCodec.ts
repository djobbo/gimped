import { Effect } from "effect";
import { MalformedCsv } from "./errors.ts";

export type CsvJsonData = {
  readonly name: string;
  readonly headers: readonly string[];
  readonly rows: readonly Readonly<Record<string, string>>[];
};

const malformed = (path: string, message: string): MalformedCsv =>
  new MalformedCsv({ path, message });
const HAS_TRAILING_NEWLINE = Symbol("csv.hasTrailingNewline");
type CsvJsonDataWithMeta = CsvJsonData & { readonly [HAS_TRAILING_NEWLINE]?: boolean };

const parseLine = (line: string): string[] => {
  const fields: string[] = [];
  let i = 0;

  while (true) {
    if (i > line.length) break;

    if (line[i] === '"') {
      i += 1;
      let value = "";
      let closed = false;

      while (i < line.length) {
        const char = line[i]!;
        if (char === '"') {
          if (line[i + 1] === '"') {
            value += '"';
            i += 2;
            continue;
          }
          i += 1;
          closed = true;
          break;
        }
        value += char;
        i += 1;
      }

      if (!closed) {
        throw new Error("Unterminated quoted field");
      }
      if (i < line.length && line[i] !== ",") {
        throw new Error(`Unexpected character "${line[i]}" after closing quote`);
      }

      fields.push(value);
    } else {
      const start = i;
      while (i < line.length && line[i] !== ",") {
        if (line[i] === '"') {
          throw new Error("Unexpected quote in unquoted field");
        }
        i += 1;
      }
      fields.push(line.slice(start, i));
    }

    if (i === line.length) break;

    i += 1;
    if (i === line.length) {
      fields.push("");
      break;
    }
  }

  return fields;
};

const validateHeaders = (headers: readonly string[]): void => {
  const seen = new Set<string>();
  for (const header of headers) {
    if (header.trim().length === 0) {
      throw new Error("Empty header");
    }
    if (seen.has(header)) {
      throw new Error(`Duplicate header "${header}"`);
    }
    seen.add(header);
  }
};

const validateRows = (
  headers: readonly string[],
  rows: readonly Readonly<Record<string, string>>[],
): void => {
  const headerSet = new Set(headers);
  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 1;
    for (const header of headers) {
      if (!(header in row)) {
        throw new Error(`Row ${rowNumber} missing key "${header}"`);
      }
      if (typeof row[header] !== "string") {
        throw new Error(`Row ${rowNumber} key "${header}" must be a string`);
      }
    }
    for (const key of Object.keys(row)) {
      if (!headerSet.has(key)) {
        throw new Error(`Row ${rowNumber} has unexpected key "${key}"`);
      }
    }
  }
};

const escapeCell = (cell: string): string => {
  if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
    return `"${cell.replaceAll('"', '""')}"`;
  }
  return cell;
};

export const csvToJson = (
  content: string,
  path: string,
): Effect.Effect<CsvJsonData, MalformedCsv> =>
  Effect.try({
    try: () => {
      const normalized = content.replaceAll("\r", "");
      const hasTrailingNewline = normalized.endsWith("\n");
      const lines = normalized.split("\n");
      if (lines.at(-1) === "") {
        lines.pop();
      }

      if (lines.length < 2) {
        throw new Error("CSV must include at least a name line and a header line");
      }

      const name = lines[0] ?? "";
      const headers = parseLine(lines[1]!);
      validateHeaders(headers);

      const rows = lines.slice(2).map((line, index) => {
        const fields = parseLine(line);
        if (fields.length !== headers.length) {
          throw new Error(
            `Row ${index + 1} has ${fields.length} fields but expected ${headers.length}`,
          );
        }

        const row: Record<string, string> = {};
        for (const [headerIndex, header] of headers.entries()) {
          row[header] = fields[headerIndex]!;
        }
        return row;
      });

      const result: CsvJsonDataWithMeta = { name, headers, rows };
      Object.defineProperty(result, HAS_TRAILING_NEWLINE, {
        value: hasTrailingNewline,
        enumerable: false,
      });
      return result;
    },
    catch: (error) =>
      malformed(path, error instanceof Error ? error.message : "Failed to parse CSV content"),
  });

export const jsonToCsv = (data: CsvJsonData, path: string): Effect.Effect<string, MalformedCsv> =>
  Effect.try({
    try: () => {
      validateHeaders(data.headers);
      validateRows(data.headers, data.rows);

      const lines: string[] = [];
      lines.push(data.name);
      lines.push(data.headers.map(escapeCell).join(","));
      for (const row of data.rows) {
        lines.push(data.headers.map((header) => escapeCell(row[header]!)).join(","));
      }

      const hasTrailingNewline = (data as CsvJsonDataWithMeta)[HAS_TRAILING_NEWLINE] ?? true;
      return hasTrailingNewline ? `${lines.join("\n")}\n` : lines.join("\n");
    },
    catch: (error) =>
      malformed(path, error instanceof Error ? error.message : "Failed to build CSV content"),
  });
