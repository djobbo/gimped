import { expect, it } from "@effect/vitest";
import { MissingCollision, MissingTables, SimulationFault, UnsupportedMatch } from "./errors.ts";

it("constructs tagged sim errors", () => {
  expect(new UnsupportedMatch({ reason: "not stock" })._tag).toBe("UnsupportedMatch");
  expect(new MissingTables({ reason: "hero 3" })._tag).toBe("MissingTables");
  expect(new MissingCollision({ levelId: 12 })._tag).toBe("MissingCollision");
  expect(new SimulationFault({ reason: "NaN" })._tag).toBe("SimulationFault");
});
