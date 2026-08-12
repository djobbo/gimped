import { Effect, FileSystem, Path } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { IoError } from "./errors.ts";
import { detectFiletype, entryFileName, readNativeDir, writeNativeDir } from "./EntryIo.ts";
import * as swz from "./index.ts";
import { EntryIoLive } from "./layers.ts";
import { runWith } from "./test-utils.ts";

const run = runWith(EntryIoLive);

describe("EntryIo", () => {
  it("exports entry helpers from the package entry point", () => {
    expect(swz.entryFileName).toBe(entryFileName);
    expect(swz.readNativeDir).toBe(readNativeDir);
  });

  it("detects XML after leading whitespace and otherwise CSV", () => {
    expect(detectFiletype(" \n<HeroTypes/>")).toBe("xml");
    expect(detectFiletype("MyTable\na,b\n")).toBe("csv");
  });

  it("names XML from its root tag", () => {
    expect(entryFileName("<HeroTypes></HeroTypes>")).toBe("HeroTypes.xml");
  });

  it("names CSV from its first line and strips carriage returns", () => {
    expect(entryFileName("MyTable\r\na,b\r\n")).toBe("MyTable.csv");
  });

  it("sanitizes Windows-illegal filename characters", () => {
    expect(entryFileName('My<Table>:*?|"\na,b\n')).toBe("My_Table______.csv");
  });

  it("writes and reads a native directory deterministically", async () => {
    const contents = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectory({ prefix: "swz-" });
        const entries = [
          { content: "<HeroTypes><x/></HeroTypes>" },
          { content: "MyTable\na,b\n1,2\n" },
        ];

        yield* writeNativeDir(entries, dir);
        yield* fs.writeFileString(path.join(dir, "ignored.txt"), "ignored");
        const back = yield* readNativeDir(dir);
        return back.map((entry) => entry.content);
      }),
    );

    expect(contents).toEqual(["<HeroTypes><x/></HeroTypes>", "MyTable\na,b\n1,2\n"]);
  });

  it("rejects entries that resolve to the same native filename", async () => {
    const { result, expectedPath } = await run(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = yield* fs.makeTempDirectory({ prefix: "swz-" });
        const result = yield* Effect.result(
          writeNativeDir(
            [
              { content: "<HeroTypes><x/></HeroTypes>" },
              { content: "<HeroTypes><y/></HeroTypes>" },
            ],
            dir,
          ),
        );
        return { result, expectedPath: path.join(dir, "HeroTypes.xml") };
      }),
    );

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure).toBeInstanceOf(IoError);
      expect(result.failure.path).toBe(expectedPath);
    }
  });

  it("maps filesystem failures to IoError", async () => {
    const missing = `C:\\missing-swz-${crypto.randomUUID()}`;
    const result = await run(Effect.result(readNativeDir(missing)));
    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure).toBeInstanceOf(IoError);
      expect(result.failure.path).toBe(missing);
    }
  });
});
