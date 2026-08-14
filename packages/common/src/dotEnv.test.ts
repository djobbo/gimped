import { expect, it } from "@effect/vitest";
import { Config, ConfigProvider, Effect, FileSystem, Option } from "effect";
import { dotEnvLayer, loadDotEnv } from "./dotEnv.ts";

const withFs = (fileSystem: FileSystem.FileSystem) =>
  Effect.provideService(FileSystem.FileSystem, fileSystem);

it.effect("loadDotEnv returns empty provider when the file is missing", () =>
  Effect.gen(function* () {
    const fs = FileSystem.makeNoop({
      exists: () => Effect.succeed(false),
    });
    const provider = yield* loadDotEnv().pipe(withFs(fs));
    const value = yield* Config.string("UNIQUE_DOTENV_MISSING").pipe(
      Config.option,
      Effect.provide(ConfigProvider.layer(provider)),
    );
    expect(Option.isNone(value)).toBe(true);
  }),
);

it.effect("loadDotEnv reads keys from a .env file", () =>
  Effect.gen(function* () {
    const fs = FileSystem.makeNoop({
      exists: (path) => Effect.succeed(path === ".env"),
      readFileString: (path) =>
        path === ".env" ? Effect.succeed("UNIQUE_DOTENV_FILE=from-file\n") : Effect.succeed(""),
    });
    const provider = yield* loadDotEnv().pipe(withFs(fs));
    const value = yield* Config.string("UNIQUE_DOTENV_FILE").pipe(
      Effect.provide(ConfigProvider.layer(provider)),
    );
    expect(value).toBe("from-file");
  }),
);

it.effect("dotEnvLayer fills keys that are absent from process env", () =>
  Effect.gen(function* () {
    const fs = FileSystem.makeNoop({
      exists: () => Effect.succeed(true),
      readFileString: () => Effect.succeed("UNIQUE_DOTENV_FALLBACK=from-file\n"),
    });
    const value = yield* Config.string("UNIQUE_DOTENV_FALLBACK").pipe(
      Effect.provide(dotEnvLayer),
      Effect.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} }))),
      withFs(fs),
    );
    expect(value).toBe("from-file");
  }),
);

it.effect("dotEnvLayer does not override existing process env", () =>
  Effect.gen(function* () {
    const fs = FileSystem.makeNoop({
      exists: () => Effect.succeed(true),
      readFileString: () => Effect.succeed("UNIQUE_DOTENV_OVERRIDE=from-file\n"),
    });
    const value = yield* Config.string("UNIQUE_DOTENV_OVERRIDE").pipe(
      Effect.provide(dotEnvLayer),
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromEnv({ env: { UNIQUE_DOTENV_OVERRIDE: "from-process" } }),
        ),
      ),
      withFs(fs),
    );
    expect(value).toBe("from-process");
  }),
);
