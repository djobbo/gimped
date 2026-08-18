import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, FileSystem, Schema } from "effect";
import { BitWriter } from "./bitstream.ts";
import { encodeFrame, FrameDecoder } from "./framing.ts";
import { PacketType } from "./packets.ts";
import { CapturedPacketLine, createSession } from "./session.ts";
import { ingestChunk } from "./stub.ts";

layer(NodeServices.layer)("backend stub", (it) => {
  it.effect("ingests concatenated handshake frames into the session log", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const temp = yield* fs.makeTempDirectory({ prefix: "backend-" });
      const session = yield* createSession(temp);
      const hello = new BitWriter();
      hello.writeString("Brawlhalla client to server protocol 1.0");
      const version = new BitWriter();
      version.writePackedU32(1009000000);
      version.writePackedU32(1);
      const bytes = Uint8Array.from([
        ...encodeFrame({
          type: PacketType.protocolHello,
          seq: undefined,
          payload: hello.toUint8Array(),
        }),
        ...encodeFrame({
          type: PacketType.clientVersion,
          seq: 1,
          payload: version.toUint8Array(),
        }),
      ]);
      const replies = yield* ingestChunk(new FrameDecoder(), session, 1, bytes);
      expect(replies.map((reply) => reply.type)).toEqual([PacketType.loginChallenge]);
      const text = yield* fs.readFileString(session.packetsPath);
      const lines = text
        .trim()
        .split(/\n/)
        .filter((line) => line.length > 0);
      const first = yield* Schema.decodeUnknownEffect(CapturedPacketLine)(lines[0]!);
      const second = yield* Schema.decodeUnknownEffect(CapturedPacketLine)(lines[1]!);
      expect(first.name).toBe("protocolHello");
      expect(first.decoded).toEqual({
        _tag: "ProtocolHello",
        text: "Brawlhalla client to server protocol 1.0",
      });
      expect(second.name).toBe("clientVersion");
      expect(second.seq).toBe(1);
      expect(second.decoded).toEqual({
        _tag: "ClientVersion",
        versionStamp: 1009000000,
        platformId: 1,
      });
    }),
  );
});
