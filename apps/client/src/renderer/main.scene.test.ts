import { expect, given, role, scene, text } from "foldkit/scene";
import { describe, test } from "vitest";
import { GotPatchMessage, init, update, view } from "./main.ts";
import { ClickedFetch, GotPatchEvent } from "./patch/index.ts";

const [initialModel] = init();

describe("view", () => {
  test("Fetch button exists on the Patch screen", () => {
    scene(
      { update, view },
      given(initialModel),
      expect(role("button", { name: "Fetch" })).toExist(),
    );
  });

  test("coming-soon sidebar items exist", () => {
    scene(
      { update, view },
      given(initialModel),
      expect(text("SWZ")).toExist(),
      expect(text("Replay")).toExist(),
      expect(text("ANM")).toExist(),
    );
  });

  test("renders depot StepProgress without crashing", () => {
    let [model] = init();
    [model] = update(model, GotPatchMessage({ message: ClickedFetch() }));
    [model] = update(
      model,
      GotPatchMessage({
        message: GotPatchEvent({
          event: { _tag: "StepStarted", step: "DownloadDepot" },
        }),
      }),
    );
    [model] = update(
      model,
      GotPatchMessage({
        message: GotPatchEvent({
          event: {
            _tag: "StepProgress",
            step: "DownloadDepot",
            detail: "45.00% BrawlhallaAir.swf",
            fraction: 0.45,
          },
        }),
      }),
    );
    scene({ update, view }, given(model), expect(role("button", { name: "Fetch" })).toExist());
  });

  test("renders a progress step when detail is omitted", () => {
    let [model] = init();
    [model] = update(model, GotPatchMessage({ message: ClickedFetch() }));
    [model] = update(
      model,
      GotPatchMessage({
        message: GotPatchEvent({
          event: {
            _tag: "StepProgress",
            step: "DownloadDepot",
            detail: "45.00% BrawlhallaAir.swf",
            fraction: 0.45,
          },
        }),
      }),
    );
    const row = model.patch.steps[0];
    if (row === undefined) {
      throw new Error("expected a DownloadDepot step row");
    }
    const { detail: _detail, ...withoutDetail } = row;
    const broken = {
      ...model,
      patch: { ...model.patch, steps: [withoutDetail] },
    };
    scene({ update, view }, given(broken), expect(role("button", { name: "Fetch" })).toExist());
  });
});
