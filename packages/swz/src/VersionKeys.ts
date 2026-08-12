import { Context, Effect, Layer, Schema } from "effect";
import { UnknownVersion } from "./errors.ts";
import raw from "./version-keys.json" with { type: "json" };

export const VersionKeyMap = Schema.Struct({
  keys: Schema.Record(Schema.String, Schema.Number),
  aliases: Schema.Record(Schema.String, Schema.String),
});
export type VersionKeyMap = typeof VersionKeyMap.Type;

export const defaultVersionKeyMap: VersionKeyMap = Schema.decodeUnknownSync(VersionKeyMap)(raw);

export class VersionKeys extends Context.Service<
  VersionKeys,
  {
    readonly resolveKey: (
      version: string,
      map?: VersionKeyMap,
    ) => Effect.Effect<number, UnknownVersion>;
  }
>()("@gimped/swz/VersionKeys") {
  static readonly layer = Layer.sync(VersionKeys, () => ({
    resolveKey: Effect.fn("VersionKeys.resolveKey")(function* (
      version: string,
      map: VersionKeyMap = defaultVersionKeyMap,
    ) {
      const buildId = map.aliases[version] ?? version;
      const key = map.keys[buildId];
      if (key === undefined) {
        return yield* new UnknownVersion({ version });
      }
      return key >>> 0;
    }),
  }));
}

export const resolveKey = Effect.fn("resolveKey")(function* (version: string, map?: VersionKeyMap) {
  const keys = yield* VersionKeys;
  return yield* keys.resolveKey(version, map);
});
