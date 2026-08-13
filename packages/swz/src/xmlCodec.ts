import { Context, Effect, Layer } from "effect";
import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";
import { MalformedXml } from "./errors.ts";

export type XmlValue = string | number | boolean | XmlNode | ReadonlyArray<XmlValue>;

export type XmlNode = {
  readonly [key: string]: XmlValue | undefined;
};

export type XmlJsonData = {
  readonly root: XmlNode;
};

const sharedOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseAttributeValue: false,
  parseTagValue: false,
} as const;

const parser = new XMLParser({
  ...sharedOptions,
  ignoreDeclaration: true,
  ignorePiTags: true,
});

// Without suppressBooleanAttributes the builder rewrites attr="true" to a bare attr.
const builder = new XMLBuilder({ ...sharedOptions, suppressBooleanAttributes: false });

const malformed = (path: string, message: string): MalformedXml =>
  new MalformedXml({ path, message });

const requireSingleRootKey = (root: XmlNode, context: string): XmlNode => {
  if (Object.keys(root).length !== 1) {
    throw new Error(`${context} must contain exactly one root key`);
  }
  return root;
};

const parsedXmlRoot = (
  value: XmlNode | null | ReadonlyArray<XmlValue>,
  context: string,
): XmlNode => {
  if (value === null || Array.isArray(value)) {
    throw new Error(`${context} must be a non-null object`);
  }
  return requireSingleRootKey(value, context);
};

export class XmlCodec extends Context.Service<
  XmlCodec,
  {
    readonly xmlToJson: (content: string, path: string) => Effect.Effect<XmlJsonData, MalformedXml>;
    readonly jsonToXml: (data: XmlJsonData, path: string) => Effect.Effect<string, MalformedXml>;
  }
>()("@gimped/swz/XmlCodec") {
  static readonly layer: Layer.Layer<XmlCodec> = Layer.sync(XmlCodec, () => {
    const xmlToJson = Effect.fn("XmlCodec.xmlToJson")(function* (content: string, path: string) {
      return yield* Effect.try({
        try: () => {
          const validation = XMLValidator.validate(content);
          if (validation !== true) {
            throw new Error(validation.err.msg);
          }

          const parsed: XmlNode | null | ReadonlyArray<XmlValue> = parser.parse(content);
          return { root: parsedXmlRoot(parsed, "Parsed XML") };
        },
        catch: (error) =>
          malformed(path, error instanceof Error ? error.message : "Failed to parse XML content"),
      });
    });

    const jsonToXml = Effect.fn("XmlCodec.jsonToXml")(function* (data: XmlJsonData, path: string) {
      return yield* Effect.try({
        try: () => {
          return builder.build(requireSingleRootKey(data.root, "XML root"));
        },
        catch: (error) =>
          malformed(path, error instanceof Error ? error.message : "Failed to build XML content"),
      });
    });

    return { xmlToJson, jsonToXml };
  });
}

export const xmlToJson = Effect.fn("xmlToJson")(function* (content: string, path: string) {
  const codec = yield* XmlCodec;
  return yield* codec.xmlToJson(content, path);
});

export const jsonToXml = Effect.fn("jsonToXml")(function* (data: XmlJsonData, path: string) {
  const codec = yield* XmlCodec;
  return yield* codec.jsonToXml(data, path);
});
