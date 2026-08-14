import { expect, it } from "@effect/vitest";
import { isSteamGuardPrompt, parseDepotPercent } from "./progress.ts";

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
