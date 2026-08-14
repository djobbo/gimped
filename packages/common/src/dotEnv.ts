import { ConfigProvider, Effect, FileSystem } from "effect";

export const loadDotEnv = Effect.fn("loadDotEnv")(function* (path = ".env") {
  const fs = yield* FileSystem.FileSystem;
  if (!(yield* fs.exists(path))) {
    return ConfigProvider.fromUnknown({});
  }
  return yield* ConfigProvider.fromDotEnv({ path });
});

export const dotEnvLayer = ConfigProvider.layerAdd(loadDotEnv());
