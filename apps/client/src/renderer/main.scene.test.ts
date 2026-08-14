import { expect, given, role, scene, text } from "foldkit/scene";
import { describe, test } from "vitest";
import { init, update, view } from "./main.ts";

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
});
