import { describe, expect, it } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { RpcSerialization } from "effect/unstable/rpc";
import { PatchEvent } from "@gimped/patch/schemas";
import { ClientRpcs } from "./client-rpc.ts";

describe("ClientRpcs contract", () => {
  it("exposes the expected RPC tags", () => {
    const tags = new Set(ClientRpcs.requests.keys());
    const expected = ["PatchFetch", "PatchClear", "SubmitSteamGuard", "SettingsGet", "SettingsSet"];
    for (const tag of expected) {
      expect(tags.has(tag)).toBe(true);
    }
    expect(tags.size).toBe(expected.length);
  });

  it.effect("MsgPack round-trips a PatchEvent", () =>
    Effect.gen(function* () {
      const serialization = yield* RpcSerialization.RpcSerialization;
      const parser = serialization.makeUnsafe();
      const event = {
        _tag: "StepStarted" as const,
        step: "DownloadDepot" as const,
      };
      const wire = yield* Schema.encodeUnknownEffect(PatchEvent)(event);
      const packed = parser.encode(wire);
      if (!(packed instanceof Uint8Array)) {
        return yield* Effect.die("MsgPack encoder did not return Uint8Array");
      }
      const [unpacked] = parser.decode(packed);
      const decoded = yield* Schema.decodeUnknownEffect(PatchEvent)(unpacked);
      expect(decoded).toStrictEqual(event);
    }).pipe(Effect.provide(RpcSerialization.layerMsgPack)),
  );
});
