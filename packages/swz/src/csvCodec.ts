import { Context, Effect, Layer, Predicate } from "effect";
import { MalformedCsv } from "./errors.ts";

export type CsvJsonData = {
  readonly name: string;
  readonly headers: readonly string[];
  readonly rows: readonly Readonly<Record<string, string>>[];
};

const malformed = (path: string, message: string): MalformedCsv =>
  new MalformedCsv({ path, message });

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

const validateNoNewline = (value: string, context: string): void => {
  if (value.includes("\n") || value.includes("\r")) {
    throw new Error(`${context} must not contain a newline character`);
  }
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
    validateNoNewline(header, `Header "${header}"`);
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
      if (!Predicate.isString(row[header])) {
        throw new Error(`Row ${rowNumber} key "${header}" must be a string`);
      }
      validateNoNewline(row[header]!, `Row ${rowNumber} key "${header}"`);
    }
    for (const key of Object.keys(row)) {
      if (!headerSet.has(key)) {
        throw new Error(`Row ${rowNumber} has unexpected key "${key}"`);
      }
    }
  }
};

const escapeCell = (cell: string): string => {
  if (cell.includes(",") || cell.includes('"')) {
    return `"${cell.replaceAll('"', '""')}"`;
  }
  return cell;
};

/** Split on newlines outside quotes so quoted cells may contain LF (Game.swz powerTypes). */
const splitLogicalLines = (normalized: string): string[] => {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]!;
    if (char === '"') {
      if (inQuotes && normalized[i + 1] === '"') {
        current += '""';
        i += 1;
      } else {
        inQuotes = !inQuotes;
        current += '"';
      }
      continue;
    }
    if (char === "\n" && !inQuotes) {
      lines.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines;
};

const parseCsv = (content: string): CsvJsonData => {
  const normalized = content.replaceAll("\r", "");
  const lines = splitLogicalLines(normalized);
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

  return { name, headers, rows };
};

const buildCsv = (data: CsvJsonData): string => {
  validateNoNewline(data.name, "Name line");
  validateHeaders(data.headers);
  validateRows(data.headers, data.rows);

  const lines: string[] = [];
  lines.push(data.name);
  lines.push(data.headers.map(escapeCell).join(","));
  for (const row of data.rows) {
    lines.push(data.headers.map((header) => escapeCell(row[header]!)).join(","));
  }

  // Canonical form: CSV rebuilt from JSON always ends with a trailing newline,
  // regardless of whether the original entry had one.
  return `${lines.join("\n")}\n`;
};

export class CsvCodec extends Context.Service<
  CsvCodec,
  {
    readonly csvToJson: (content: string, path: string) => Effect.Effect<CsvJsonData, MalformedCsv>;
    readonly jsonToCsv: (data: CsvJsonData, path: string) => Effect.Effect<string, MalformedCsv>;
  }
>()("@gimped/swz/CsvCodec") {
  static readonly layer: Layer.Layer<CsvCodec> = Layer.sync(CsvCodec, () => {
    const csvToJson = Effect.fn("CsvCodec.csvToJson")(function* (content: string, path: string) {
      return yield* Effect.try({
        try: () => parseCsv(content),
        catch: (error) =>
          malformed(path, error instanceof Error ? error.message : "Failed to parse CSV content"),
      });
    });

    const jsonToCsv = Effect.fn("CsvCodec.jsonToCsv")(function* (data: CsvJsonData, path: string) {
      return yield* Effect.try({
        try: () => buildCsv(data),
        catch: (error) =>
          malformed(path, error instanceof Error ? error.message : "Failed to build CSV content"),
      });
    });

    return { csvToJson, jsonToCsv };
  });
}

export const csvToJson = Effect.fn("csvToJson")(function* (content: string, path: string) {
  const codec = yield* CsvCodec;
  return yield* codec.csvToJson(content, path);
});

export const jsonToCsv = Effect.fn("jsonToCsv")(function* (data: CsvJsonData, path: string) {
  const codec = yield* CsvCodec;
  return yield* codec.jsonToCsv(data, path);
});
