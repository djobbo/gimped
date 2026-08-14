import { Command, given, message, model, story } from "foldkit/story";
import { describe, expect, test } from "vitest";
import {
  ClickedComingSoon,
  ClickedSettings,
  GotPatchMessage,
  init,
  showsGuardField,
  update,
} from "./main.ts";
import { ClickedCancel, ClickedFetch, GotPatchEvent } from "./patch/index.ts";

const sampleRegistry = {
  steamAppId: 291550,
  steamDepotId: 291551,
  steamManifestId: "1",
  fullDepot: false,
  clientBuild: "10090",
  swzKey: 762411009,
  swf: "BrawlhallaAir.swf",
  files: ["BrawlhallaAir.swf"],
};

const [initialModel] = init();

describe("update", () => {
  test("ClickedFetch from Idle starts a Running fetch", () => {
    story(
      update,
      given(initialModel),
      message(GotPatchMessage({ message: ClickedFetch() })),
      Command.expectNone(),
      model((next) => {
        expect(next.patch.run._tag).toBe("Running");
        if (next.patch.run._tag === "Running") {
          expect(next.patch.run.runId).toBe(0);
          expect(next.patch.run.payload.full).toBe(false);
          expect(next.patch.run.payload.force).toBe(false);
        }
        expect(next.patch.runId).toBe(1);
        expect(next.patch.steps).toEqual([]);
      }),
    );
  });

  test("GotPatchEvent Completed moves Running to Succeeded", () => {
    story(
      update,
      given(initialModel),
      message(GotPatchMessage({ message: ClickedFetch() })),
      message(
        GotPatchMessage({
          message: GotPatchEvent({
            event: { _tag: "Completed", registry: sampleRegistry },
          }),
        }),
      ),
      Command.expectNone(),
      model((next) => {
        expect(next.patch.run._tag).toBe("Succeeded");
        if (next.patch.run._tag === "Succeeded") {
          expect(next.patch.run.registry).toEqual(sampleRegistry);
        }
      }),
    );
  });

  test("ClickedCancel leaves Running as Cancelled", () => {
    story(
      update,
      given(initialModel),
      message(GotPatchMessage({ message: ClickedFetch() })),
      message(GotPatchMessage({ message: ClickedCancel() })),
      Command.expectNone(),
      model((next) => {
        expect(next.patch.run._tag).toBe("Cancelled");
      }),
    );
  });

  test("SteamGuardRequired shows the Guard field in the view model", () => {
    story(
      update,
      given(initialModel),
      message(GotPatchMessage({ message: ClickedFetch() })),
      model((next) => {
        expect(showsGuardField(next)).toBe(false);
      }),
      message(
        GotPatchMessage({
          message: GotPatchEvent({ event: { _tag: "SteamGuardRequired" } }),
        }),
      ),
      model((next) => {
        expect(next.patch.run._tag).toBe("Running");
        expect(showsGuardField(next)).toBe(true);
      }),
    );
  });

  test("ClickedComingSoon does not change the screen", () => {
    story(
      update,
      given(initialModel),
      message(ClickedComingSoon()),
      Command.expectNone(),
      model((next) => {
        expect(next.screen).toBe("Patch");
      }),
    );
  });

  test("ClickedSettings switches the screen without leaving a Running fetch", () => {
    story(
      update,
      given(initialModel),
      message(GotPatchMessage({ message: ClickedFetch() })),
      message(ClickedSettings()),
      Command.expectNone(),
      model((next) => {
        expect(next.screen).toBe("Settings");
        expect(next.patch.run._tag).toBe("Running");
      }),
    );
  });
});
