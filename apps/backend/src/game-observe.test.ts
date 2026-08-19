import { describe, expect, it } from "@effect/vitest";
import { observeGameFrame } from "./game-observe.ts";
import { PacketType } from "./packets.ts";

describe("game observe", () => {
  it("marks known gameConnect as known with a stable summary", () => {
    const observed = observeGameFrame({
      type: PacketType.gameConnect,
      seq: 1,
      payload: new Uint8Array([0x04, 0x00, 0x19, 0x9d, 0xa5, 0xb5, 0xc1, 0x95, 0x90]),
    });
    expect(observed.known).toBe(true);
    expect(observed.summary).toContain("gameConnect");
  });

  it("marks unmapped ids as unknown", () => {
    const observed = observeGameFrame({
      type: 9999,
      seq: undefined,
      payload: Uint8Array.from([1, 2, 3]),
    });
    expect(observed.known).toBe(false);
    expect(observed.summary).toContain("type_9999");
  });
});
