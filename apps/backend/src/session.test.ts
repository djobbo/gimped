import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Schema } from "effect";
import { BitWriter } from "./bitstream.ts";
import { PacketType } from "./packets.ts";
import { CapturedPacketLine, Session } from "./session.ts";

layer(NodeServices.layer)("capture session", (it) => {
  it.effect("appends decoded packets as JSON lines", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const temp = yield* fs.makeTempDirectory({ prefix: "session-" });
      yield* Effect.gen(function* () {
        const session = yield* Session;
        const payload = new BitWriter();
        payload.writeString("Brawlhalla client to server protocol 1.0");
        const captured = yield* session.record(1, {
          type: PacketType.protocolHello,
          seq: undefined,
          payload: payload.toUint8Array(),
        });
        expect(captured.name).toBe("protocolHello");
        const text = yield* fs.readFileString(session.packetsPath);
        const parsed = yield* Schema.decodeUnknownEffect(CapturedPacketLine)(text.trim());
        expect(parsed.type).toBe(PacketType.protocolHello);
        expect(parsed.decoded).toEqual({
          _tag: "ProtocolHello",
          text: "Brawlhalla client to server protocol 1.0",
        });
      }).pipe(Effect.provide(Session.layer(temp)));
    }),
  );
});
