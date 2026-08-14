import { expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { Completed, PatchEvent, StepProgress, StepStarted } from "./schemas.ts";

it("round-trips StepStarted", () => {
  const event = { _tag: "StepStarted" as const, step: "DownloadDepot" as const };
  const encoded = Schema.encodeSync(StepStarted)(event);
  expect(Schema.decodeSync(StepStarted)(encoded)).toEqual(event);
});

it("round-trips StepProgress without fraction", () => {
  const event = {
    _tag: "StepProgress" as const,
    step: "ExportScripts" as const,
    detail: "running",
  };
  expect(Schema.decodeSync(StepProgress)(Schema.encodeSync(StepProgress)(event))).toEqual(event);
});

it("round-trips StepProgress with fraction", () => {
  const event = {
    _tag: "StepProgress" as const,
    step: "DownloadDepot" as const,
    fraction: 0.45,
    detail: "45.00% BrawlhallaAir.swf",
  };
  expect(Schema.decodeSync(StepProgress)(Schema.encodeSync(StepProgress)(event))).toEqual(event);
});

it("PatchEvent union accepts Completed and SteamGuardRequired", () => {
  const guard = { _tag: "SteamGuardRequired" as const };
  expect(Schema.decodeSync(PatchEvent)(Schema.encodeSync(PatchEvent)(guard))).toEqual(guard);
  const completed = {
    _tag: "Completed" as const,
    registry: {
      steamAppId: 291550,
      steamDepotId: 291551,
      steamManifestId: "1",
      fullDepot: false,
      clientBuild: "10090",
      swzKey: 762411009,
      swf: "BrawlhallaAir.swf",
      files: ["BrawlhallaAir.swf"],
    },
  };
  expect(Schema.decodeSync(Completed)(Schema.encodeSync(Completed)(completed))).toEqual(completed);
});
