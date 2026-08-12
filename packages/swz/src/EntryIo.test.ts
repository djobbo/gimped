import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { IoError } from "./errors.ts";
import { detectFiletype, entryFileName, readNativeDir, writeNativeDir } from "./EntryIo.ts";
import * as swz from "./index.ts";

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
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "swz-"));
    const entries = [
      { content: "<HeroTypes><x/></HeroTypes>" },
      { content: "MyTable\na,b\n1,2\n" },
    ];

    try {
      await Effect.runPromise(writeNativeDir(entries, dir));
      await fs.writeFile(path.join(dir, "ignored.txt"), "ignored", "utf8");
      const back = await Effect.runPromise(readNativeDir(dir));

      expect(back.map((entry) => entry.content)).toEqual([
        "<HeroTypes><x/></HeroTypes>",
        "MyTable\na,b\n1,2\n",
      ]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects entries that resolve to the same native filename", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "swz-"));
    const entries = [
      { content: "<HeroTypes><x/></HeroTypes>" },
      { content: "<HeroTypes><y/></HeroTypes>" },
    ];

    try {
      const result = await Effect.runPromise(Effect.result(writeNativeDir(entries, dir)));

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure).toBeInstanceOf(IoError);
        expect(result.failure.path).toBe(path.join(dir, "HeroTypes.xml"));
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("maps filesystem failures to IoError", async () => {
    const missing = path.join(os.tmpdir(), `missing-swz-${crypto.randomUUID()}`);
    const result = await Effect.runPromise(Effect.result(readNativeDir(missing)));

    expect(result._tag).toBe("Failure");
    if (result._tag === "Failure") {
      expect(result.failure).toBeInstanceOf(IoError);
      expect(result.failure.path).toBe(missing);
    }
  });
});
