import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Well512Live } from "./layers.ts";
import { runWith } from "./test-utils.ts";
import { createWell512 } from "./Well512.ts";

const run = runWith(Well512Live);

describe("Well512", () => {
  it("matches known sequence for seed 0x12345678", async () => {
    const prng = await run(createWell512());
    prng.initState(0x12345678);
    expect(prng.next()).toBe(0x7f031c96);
    expect(prng.next()).toBe(0xe5ec2c73);
    expect(prng.next()).toBe(0xe7bbd603);
  });
});
