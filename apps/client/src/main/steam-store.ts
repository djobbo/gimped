import { Context, Effect, FileSystem, Path, PlatformError, Schema } from "effect";
import { SafeStorageFailed } from "../shared/client-rpc.ts";

export class SafeStorage extends Context.Service<
  SafeStorage,
  {
    readonly isEncryptionAvailable: () => boolean;
    readonly encryptString: (plain: string) => Uint8Array;
    readonly decryptString: (bytes: Uint8Array) => string;
    readonly userData: string;
  }
>()("gimped/client/SafeStorage") {}

const CredentialsFile = Schema.Struct({
  username: Schema.String,
  password: Schema.String,
});
const CredentialsFileText = Schema.fromJsonString(CredentialsFile);

const CREDENTIALS_FILE = "steam-credentials.bin";

const isNotFound = (error: PlatformError.PlatformError): boolean =>
  error.reason._tag === "NotFound";

const toSafeStorageFailed = (cause: unknown): SafeStorageFailed =>
  new SafeStorageFailed({
    detail: cause instanceof Error ? cause.message : String(cause),
  });

const credentialsPath = Effect.fn("steamStore.credentialsPath")(function* () {
  const storage = yield* SafeStorage;
  const path = yield* Path.Path;
  return path.join(storage.userData, CREDENTIALS_FILE);
});

export const readCredentials = Effect.fn("steamStore.readCredentials")(function* () {
  const storage = yield* SafeStorage;
  const fs = yield* FileSystem.FileSystem;
  const filePath = yield* credentialsPath();
  const bytes = yield* fs
    .readFile(filePath)
    .pipe(
      Effect.catch((error: PlatformError.PlatformError) =>
        isNotFound(error) ? Effect.succeed(undefined) : Effect.fail(toSafeStorageFailed(error)),
      ),
    );
  if (bytes === undefined) {
    return { username: "", password: "" };
  }
  if (!storage.isEncryptionAvailable()) {
    return yield* new SafeStorageFailed({ detail: "Encryption is not available" });
  }
  const json = yield* Effect.try({
    try: () => storage.decryptString(bytes),
    catch: toSafeStorageFailed,
  });
  return yield* Schema.decodeUnknownEffect(CredentialsFileText)(json).pipe(
    Effect.mapError(toSafeStorageFailed),
  );
});

export const get = Effect.fn("steamStore.get")(function* () {
  const creds = yield* readCredentials();
  return { username: creds.username, hasPassword: creds.password.length > 0 };
});

export const set = Effect.fn("steamStore.set")(function* (username: string, password: string) {
  if (username === "" || password === "") {
    return yield* new SafeStorageFailed({ detail: "Username and password must be non-empty" });
  }
  const storage = yield* SafeStorage;
  if (!storage.isEncryptionAvailable()) {
    return yield* new SafeStorageFailed({ detail: "Encryption is not available" });
  }
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const filePath = yield* credentialsPath();
  const json = yield* Schema.encodeUnknownEffect(CredentialsFileText)({ username, password }).pipe(
    Effect.mapError(toSafeStorageFailed),
  );
  const bytes = yield* Effect.try({
    try: () => storage.encryptString(json),
    catch: toSafeStorageFailed,
  });
  yield* fs
    .makeDirectory(path.dirname(filePath), { recursive: true })
    .pipe(Effect.mapError(toSafeStorageFailed));
  yield* fs.writeFile(filePath, bytes).pipe(Effect.mapError(toSafeStorageFailed));
});
