import { describe, expect, it } from "@effect/vitest";
import { humanPlayerCount } from "./match-players.ts";
import { MatchSetupSpec } from "./match-spec.ts";

describe("match players", () => {
  it("counts host plus lobby guests as humans", () => {
    expect(humanPlayerCount(MatchSetupSpec.default)).toBe(1);
    expect(
      humanPlayerCount(
        new MatchSetupSpec({
          ...MatchSetupSpec.default,
          guests: [
            {
              controller: 1,
              entityId: 2,
              heroId: 3,
              costumeId: 3,
              heroSlots: [],
            },
          ],
        }),
      ),
    ).toBe(2);
  });
});
