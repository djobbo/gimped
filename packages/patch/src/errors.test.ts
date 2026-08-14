import { describe, expect, it } from "@effect/vitest";
import {
  BuildIdNotFound,
  DepotDownloadFailed,
  FfdecFailed,
  KeyConflict,
  KeyNotFound,
  MissingJava,
  MissingSteamCredentials,
  MissingSwf,
  ToolDownloadFailed,
} from "./errors.ts";

describe("patch errors", () => {
  it("tags every pipeline error", () => {
    expect(new MissingSteamCredentials({ message: "missing" })._tag).toBe(
      "MissingSteamCredentials",
    );
    expect(new ToolDownloadFailed({ message: "gh" })._tag).toBe("ToolDownloadFailed");
    expect(new MissingJava({ message: "no java" })._tag).toBe("MissingJava");
    expect(new DepotDownloadFailed({ message: "steam" })._tag).toBe("DepotDownloadFailed");
    expect(new FfdecFailed({ message: "ffdec" })._tag).toBe("FfdecFailed");
    expect(new MissingSwf({ path: "/depot" })._tag).toBe("MissingSwf");
    expect(new KeyNotFound({ path: "/scripts" })._tag).toBe("KeyNotFound");
    expect(new BuildIdNotFound({ path: "/scripts" })._tag).toBe("BuildIdNotFound");
    expect(new KeyConflict({ version: "10090", existing: 1, actual: 2 })._tag).toBe("KeyConflict");
  });
});
