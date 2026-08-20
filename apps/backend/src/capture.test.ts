import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";
import { Capture } from "./capture.ts";
import { Session } from "./session.ts";

layer(NodeServices.layer)("capture service", (it) => {
  it.effect("copies existing diagnostics and writes a session note", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const outRoot = yield* fs.makeTempDirectory({ prefix: "capture-out-" });
      const documents = yield* fs.makeTempDirectory({ prefix: "capture-docs-" });
      const diagnosticName = "Brawlhalla-Diagnostic-Log-001.txt";
      yield* fs.writeFileString(path.join(documents, diagnosticName), "hello diagnostic");
      yield* fs.writeFileString(path.join(documents, "not-a-diagnostic.txt"), "ignore me");

      yield* Effect.gen(function* () {
        const session = yield* Session;
        const capture = yield* Capture;

        yield* capture.watchDiagnostics(session.dir, documents);

        const copiedPath = path.join(session.dir, "diagnostics", diagnosticName);
        expect(yield* fs.exists(copiedPath)).toBe(true);
        expect(yield* fs.readFileString(copiedPath)).toBe("hello diagnostic");
        expect(
          yield* fs.exists(path.join(session.dir, "diagnostics", "not-a-diagnostic.txt")),
        ).toBe(false);
        const notes = yield* fs.readFileString(path.join(session.dir, "notes.txt"));
        expect(notes).toContain(`diagnostic ${diagnosticName}`);
      }).pipe(Effect.provide(Capture.layer), Effect.provide(Session.layer(outRoot)), Effect.scoped);
    }),
  );
});
