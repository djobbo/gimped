import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { SafeStorageFailed } from "../shared/client-rpc.ts";
import { get, SafeStorage, set } from "./steam-store.ts";

const identityStorage = (userData: string, available = true): SafeStorage["Service"] => ({
  isEncryptionAvailable: () => available,
  encryptString: (plain) => new TextEncoder().encode(plain),
  decryptString: (bytes) => new TextDecoder().decode(bytes),
  userData,
});

const withStore = <A, E>(
  use: Effect.Effect<A, E, SafeStorage | FileSystem.FileSystem | Path.Path>,
  storage: (userData: string) => SafeStorage["Service"],
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const userData = yield* fs.makeTempDirectoryScoped({ prefix: "steam-store-" });
    return yield* use.pipe(Effect.provide(Layer.succeed(SafeStorage, storage(userData))));
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped);

describe("steam-store", () => {
  it.effect("get returns empty status when the credentials file is missing", () =>
    withStore(
      Effect.gen(function* () {
        expect(yield* get()).toEqual({ username: "", hasPassword: false });
      }),
      identityStorage,
    ),
  );

  it.effect("set then get returns username and hasPassword without the password", () =>
    withStore(
      Effect.gen(function* () {
        yield* set("alice", "s3cret");
        const status = yield* get();
        expect(status).toEqual({ username: "alice", hasPassword: true });
        expect(status).not.toHaveProperty("password");
      }),
      identityStorage,
    ),
  );

  it.effect("set rejects empty username", () =>
    withStore(
      Effect.gen(function* () {
        const error = yield* Effect.flip(set("", "s3cret"));
        expect(error).toBeInstanceOf(SafeStorageFailed);
      }),
      identityStorage,
    ),
  );

  it.effect("set rejects empty password", () =>
    withStore(
      Effect.gen(function* () {
        const error = yield* Effect.flip(set("alice", ""));
        expect(error).toBeInstanceOf(SafeStorageFailed);
      }),
      identityStorage,
    ),
  );

  it.effect("set fails when encryption is unavailable", () =>
    withStore(
      Effect.gen(function* () {
        const error = yield* Effect.flip(set("alice", "s3cret"));
        expect(error).toBeInstanceOf(SafeStorageFailed);
      }),
      (userData) => identityStorage(userData, false),
    ),
  );

  it.effect("get fails when decrypting an existing file without encryption", () =>
    withStore(
      Effect.gen(function* () {
        yield* set("alice", "s3cret");
        const storage = yield* SafeStorage;
        const error = yield* Effect.flip(
          get().pipe(
            Effect.provide(
              Layer.succeed(SafeStorage, {
                ...storage,
                isEncryptionAvailable: () => false,
              }),
            ),
          ),
        );
        expect(error).toBeInstanceOf(SafeStorageFailed);
      }),
      identityStorage,
    ),
  );

  it.effect("writes encrypted bytes to steam-credentials.bin", () =>
    withStore(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const storage = yield* SafeStorage;
        yield* set("alice", "s3cret");
        const filePath = path.join(storage.userData, "steam-credentials.bin");
        expect(yield* fs.exists(filePath)).toBe(true);
        const bytes = yield* fs.readFile(filePath);
        expect(new TextDecoder().decode(bytes)).toContain("alice");
        expect(new TextDecoder().decode(bytes)).toContain("s3cret");
      }),
      identityStorage,
    ),
  );
});
