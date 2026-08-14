import { fetch, PatchRegistryText } from "@gimped/patch";
import { Console, Effect, FileSystem, Option, Path, Schema } from "effect";
import { Command, Flag } from "effect/unstable/cli";

export const fetchCmd = Command.make(
  "fetch",
  {
    manifest: Flag.string("manifest").pipe(
      Flag.optional,
      Flag.withDescription("Steam manifest id (omit for public latest)"),
    ),
    full: Flag.boolean("full").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Download full depot instead of filelist"),
    ),
    cacheDir: Flag.string("cache-dir").pipe(
      Flag.optional,
      Flag.withDescription("Cache root directory"),
    ),
    versionKeys: Flag.string("version-keys").pipe(
      Flag.optional,
      Flag.withDescription("Path to version-keys.json"),
    ),
  },
  Effect.fn("fetch")(function* (config) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    let versionKeysPath = Option.getOrUndefined(config.versionKeys);
    if (versionKeysPath === undefined) {
      const candidate = path.join(process.cwd(), "packages", "swz", "src", "version-keys.json");
      if (yield* fs.exists(candidate)) {
        versionKeysPath = candidate;
      }
    }

    const registry = yield* fetch({
      cacheDir: Option.getOrUndefined(config.cacheDir),
      manifestId: Option.getOrUndefined(config.manifest),
      full: config.full,
      versionKeysPath,
    });

    yield* Console.log(Schema.encodeUnknownSync(PatchRegistryText)(registry));
  }),
).pipe(Command.withDescription("Fetch a Brawlhalla patch into the cache"));
