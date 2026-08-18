import { expect, it } from "@effect/vitest";
import { root } from "./cli.ts";

it("exposes listen and game subcommands", () => {
  expect(
    root.subcommands.flatMap((group) => group.commands.map((command) => command.name)).toSorted(),
  ).toEqual(["game", "listen"]);
});
