import { Effect } from "effect";
import { UnknownVersion } from "./errors.ts";
import raw from "./version-keys.json" with { type: "json" };

export type VersionKeyMap = {
  readonly keys: Readonly<Record<string, number>>;
  readonly aliases: Readonly<Record<string, string>>;
};

export const defaultVersionKeyMap: VersionKeyMap = raw as VersionKeyMap;

export const resolveKey = (
  version: string,
  map: VersionKeyMap = defaultVersionKeyMap,
): Effect.Effect<number, UnknownVersion> =>
  Effect.gen(function* () {
    const buildId = map.aliases[version] ?? version;
    const key = map.keys[buildId];
    if (key === undefined) {
      return yield* new UnknownVersion({ version });
    }
    return key >>> 0;
  });
