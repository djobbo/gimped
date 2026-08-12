import { Effect } from "effect";
import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";
import { MalformedXml } from "./errors.ts";

export type XmlJsonData = {
  readonly root: Readonly<Record<string, unknown>>;
};

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseAttributeValue: false,
  parseTagValue: false,
} as const;

const parser = new XMLParser(parserOptions);
const builder = new XMLBuilder(parserOptions);

const malformed = (path: string, message: string): MalformedXml => new MalformedXml({ path, message });

const validateSingleRootObject = (value: unknown, context: string): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be a non-null object`);
  }

  const keys = Object.keys(value);
  if (keys.length !== 1) {
    throw new Error(`${context} must contain exactly one root key`);
  }

  return value as Readonly<Record<string, unknown>>;
};

export const xmlToJson = (content: string, path: string): Effect.Effect<XmlJsonData, MalformedXml> =>
  Effect.try({
    try: () => {
      const validation = XMLValidator.validate(content);
      if (validation !== true) {
        throw new Error(validation.err.msg);
      }

      const parsed = parser.parse(content);
      const root = validateSingleRootObject(parsed, "Parsed XML");
      return { root };
    },
    catch: (error) =>
      malformed(path, error instanceof Error ? error.message : "Failed to parse XML content"),
  });

export const jsonToXml = (data: XmlJsonData, path: string): Effect.Effect<string, MalformedXml> =>
  Effect.try({
    try: () => {
      const root = validateSingleRootObject(data.root, "XML root");
      return builder.build(root);
    },
    catch: (error) =>
      malformed(path, error instanceof Error ? error.message : "Failed to build XML content"),
  });
