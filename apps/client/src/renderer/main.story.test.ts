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
import {
  ClickedCancel,
  ClickedClear,
  ClickedFetch,
  ClickedSubmitGuard,
  ClearPatch,
  CompletedSubmitSteamGuard,
  FailedClear,
  FailedPatchFetch,
  FailedSubmitSteamGuard,
  GotPatchEvent,
  SubmitSteamGuard,
  SucceededClear,
  UpdatedGuardCode,
} from "./patch/index.ts";

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

  test("FailedPatchFetch moves Running to Failed", () => {
    story(
      update,
      given(initialModel),
      message(GotPatchMessage({ message: ClickedFetch() })),
      message(
        GotPatchMessage({
          message: FailedPatchFetch({
            tag: "MissingSteamCredentials",
            detail: "set credentials in Settings",
          }),
        }),
      ),
      Command.expectNone(),
      model((next) => {
        expect(next.patch.run._tag).toBe("Failed");
        if (next.patch.run._tag === "Failed") {
          expect(next.patch.run.tag).toBe("MissingSteamCredentials");
          expect(next.patch.run.detail).toBe("set credentials in Settings");
        }
      }),
    );
  });

  test("StepProgress records fraction when present and omits it otherwise", () => {
    story(
      update,
      given(initialModel),
      message(GotPatchMessage({ message: ClickedFetch() })),
      message(
        GotPatchMessage({
          message: GotPatchEvent({
            event: {
              _tag: "StepProgress",
              step: "DownloadDepot",
              detail: "downloading",
              fraction: 0.4,
            },
          }),
        }),
      ),
      message(
        GotPatchMessage({
          message: GotPatchEvent({
            event: {
              _tag: "StepProgress",
              step: "ExportScripts",
              detail: "exporting",
            },
          }),
        }),
      ),
      Command.expectNone(),
      model((next) => {
        expect(next.patch.run._tag).toBe("Running");
        expect(next.patch.steps).toEqual([
          {
            step: "DownloadDepot",
            status: "Progress",
            detail: "downloading",
            fraction: 0.4,
          },
          {
            step: "ExportScripts",
            status: "Progress",
            detail: "exporting",
          },
        ]);
      }),
    );
  });

  test("FailedSubmitSteamGuard stays Running and keeps the Guard field", () => {
    story(
      update,
      given(initialModel),
      message(GotPatchMessage({ message: ClickedFetch() })),
      message(
        GotPatchMessage({
          message: GotPatchEvent({ event: { _tag: "SteamGuardRequired" } }),
        }),
      ),
      message(GotPatchMessage({ message: UpdatedGuardCode({ value: "12345" }) })),
      message(GotPatchMessage({ message: ClickedSubmitGuard() })),
      Command.expectHas(SubmitSteamGuard({ code: "12345" })),
      Command.resolve(
        SubmitSteamGuard,
        FailedSubmitSteamGuard({
          tag: "SteamGuardNotPending",
          detail: "no pending guard",
        }),
      ),
      model((next) => {
        expect(next.patch.run._tag).toBe("Running");
        expect(showsGuardField(next)).toBe(true);
        expect(next.patch.guardError).toBe("SteamGuardNotPending: no pending guard");
      }),
    );
  });

  test("CompletedSubmitSteamGuard hides the Guard field until another SteamGuardRequired", () => {
    story(
      update,
      given(initialModel),
      message(GotPatchMessage({ message: ClickedFetch() })),
      message(
        GotPatchMessage({
          message: GotPatchEvent({ event: { _tag: "SteamGuardRequired" } }),
        }),
      ),
      message(GotPatchMessage({ message: UpdatedGuardCode({ value: "12345" }) })),
      message(GotPatchMessage({ message: ClickedSubmitGuard() })),
      Command.expectHas(SubmitSteamGuard({ code: "12345" })),
      Command.resolve(SubmitSteamGuard, CompletedSubmitSteamGuard()),
      model((next) => {
        expect(next.patch.run._tag).toBe("Running");
        expect(showsGuardField(next)).toBe(false);
        expect(next.patch.guardCode).toBe("");
        expect(next.patch.guardError).toBe("");
      }),
      message(GotPatchMessage({ message: ClickedSubmitGuard() })),
      Command.expectNone(),
    );
  });

  test("SucceededClear while Running leaves the fetch Running", () => {
    story(
      update,
      given(initialModel),
      message(GotPatchMessage({ message: ClickedFetch() })),
      message(GotPatchMessage({ message: SucceededClear() })),
      Command.expectNone(),
      model((next) => {
        expect(next.patch.run._tag).toBe("Running");
      }),
    );
  });

  test("FailedClear while Running leaves the fetch Running", () => {
    story(
      update,
      given(initialModel),
      message(GotPatchMessage({ message: ClickedFetch() })),
      message(
        GotPatchMessage({
          message: FailedClear({ tag: "NothingToClear", detail: "no patch" }),
        }),
      ),
      Command.expectNone(),
      model((next) => {
        expect(next.patch.run._tag).toBe("Running");
      }),
    );
  });

  test("ClickedClear from Idle dispatches ClearPatch and SucceededClear returns to Idle", () => {
    story(
      update,
      given(initialModel),
      message(GotPatchMessage({ message: ClickedClear() })),
      Command.expectHas(ClearPatch),
      Command.resolve(ClearPatch, SucceededClear()),
      model((next) => {
        expect(next.patch.run._tag).toBe("Idle");
        expect(next.patch.steps).toEqual([]);
      }),
    );
  });
});
