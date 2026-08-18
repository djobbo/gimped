import { expect, it } from "@effect/vitest";
import { root } from "./cli.ts";

it("exposes listen subcommand", () => {
  expect(
    root.subcommands.flatMap((group) => group.commands.map((command) => command.name)),
  ).toEqual(["listen"]);
});
