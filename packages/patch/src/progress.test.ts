import { expect, it } from "@effect/vitest";
import { isSteamGuardPrompt, onDepotLine, parseDepotPercent } from "./progress.ts";

it("parses DepotDownloader percent lines", () => {
  expect(parseDepotPercent(" 45.00% BrawlhallaAir.swf")).toBe(0.45);
  expect(parseDepotPercent("100.00% Game.swz")).toBe(1);
  expect(parseDepotPercent("nope")).toBeUndefined();
});

it("detects Steam Guard prompts", () => {
  expect(isSteamGuardPrompt("This account is protected by Steam Guard.")).toBe(true);
  expect(
    isSteamGuardPrompt("Please enter your 2 factor auth code from your authenticator app: "),
  ).toBe(true);
  expect(
    isSteamGuardPrompt("Please enter the authentication code sent to your email address: "),
  ).toBe(true);
  expect(isSteamGuardPrompt(" 45.00% BrawlhallaAir.swf")).toBe(false);
});

it("onDepotLine returns guard for Steam Guard prompts", () => {
  expect(onDepotLine("This account is protected by Steam Guard.", "DownloadDepot")).toEqual({
    kind: "guard",
  });
  expect(
    onDepotLine(
      "Please enter your 2 factor auth code from your authenticator app: ",
      "ResolveManifest",
    ),
  ).toEqual({ kind: "guard" });
});

it("onDepotLine returns progress with fraction for percent lines", () => {
  expect(onDepotLine(" 45.00% BrawlhallaAir.swf", "DownloadDepot")).toEqual({
    kind: "progress",
    event: {
      _tag: "StepProgress",
      step: "DownloadDepot",
      fraction: 0.45,
      detail: "45.00% BrawlhallaAir.swf",
    },
  });
});

it("onDepotLine omits fraction when the line has no percent", () => {
  expect(onDepotLine("Downloading depot 291551", "ResolveManifest")).toEqual({
    kind: "progress",
    event: {
      _tag: "StepProgress",
      step: "ResolveManifest",
      detail: "Downloading depot 291551",
    },
  });
});

it("onDepotLine ignores blank lines", () => {
  expect(onDepotLine("   ", "DownloadDepot")).toEqual({ kind: "ignore" });
  expect(onDepotLine("", "DownloadDepot")).toEqual({ kind: "ignore" });
});
