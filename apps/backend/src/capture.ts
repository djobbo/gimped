import { Console, Effect, FileSystem, Option, Path, Stream } from "effect";
import * as ChildProcess from "effect/unstable/process/ChildProcess";

const windowsTshark = "C:\\Program Files\\Wireshark\\tshark.exe";

export const resolveTshark = Effect.fn("resolveTshark")(function* () {
  const fs = yield* FileSystem.FileSystem;
  if (yield* fs.exists(windowsTshark)) return windowsTshark;
  return "tshark";
});

const loopbackName = (listing: string): string | undefined => {
  const lines = listing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const loopback = lines.find((line) => /loopback/i.test(line));
  const chosen = loopback ?? lines[0];
  const match = chosen?.match(/^(\d+)\./);
  return match?.[1];
};

export const startTshark = Effect.fn("startTshark")(function* (port: number, pcapPath: string) {
  const bin = yield* resolveTshark();
  const list = yield* ChildProcess.make(bin, ["-D"]).pipe(
    Effect.flatMap((handle) => Stream.mkString(Stream.decodeText(handle.stdout))),
    Effect.catchCause(() => Effect.succeed("")),
  );
  if (list.length === 0) {
    yield* Console.log("tshark not available; install Wireshark + Npcap for pcap capture");
    return Option.none();
  }
  const iface = loopbackName(list);
  if (iface === undefined) {
    yield* Console.log("tshark found no capture interfaces");
    return Option.none();
  }
  yield* Console.log(`tshark capturing tcp port ${port} on interface ${iface} -> ${pcapPath}`);
  yield* ChildProcess.make(bin, ["-i", iface, "-f", `tcp port ${port}`, "-w", pcapPath]).pipe(
    Effect.flatMap((handle) => handle.exitCode),
    Effect.forkScoped,
  );
  return Option.some(pcapPath);
});

export const watchDiagnostics = Effect.fn("watchDiagnostics")(function* (
  sessionDir: string,
  documents: string,
  note: (line: string) => Effect.Effect<void>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (!(yield* fs.exists(documents))) {
    yield* Console.log(`no Documents directory at ${documents}; skip diagnostic-log watch`);
    return;
  }
  const dest = path.join(sessionDir, "diagnostics");
  yield* fs.makeDirectory(dest, { recursive: true });
  yield* Console.log(`watching ${documents} for Brawlhalla-Diagnostic-Log-*.txt`);

  const copyLog = Effect.fn("copyDiagnostic")(function* (filePath: string) {
    const base = path.basename(filePath);
    if (!base.startsWith("Brawlhalla-Diagnostic-Log-") || !base.endsWith(".txt")) return;
    const target = path.join(dest, base);
    const bytes = yield* fs.readFile(filePath);
    yield* fs.writeFile(target, bytes);
    yield* Console.log(`copied diagnostic log ${base}`);
    yield* note(`diagnostic ${base}`);
  });

  const existing = yield* fs.readDirectory(documents);
  for (const name of existing) {
    yield* copyLog(path.join(documents, name)).pipe(Effect.ignore);
  }

  yield* fs.watch(documents).pipe(
    Stream.runForEach((event) => {
      if (event._tag === "Remove") return Effect.void;
      return copyLog(event.path).pipe(Effect.ignore);
    }),
    Effect.forkScoped,
  );
});
