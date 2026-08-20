import { Context, Effect, FileSystem, Layer, Path, Schema } from "effect";
import { fileURLToPath } from "node:url";
import { decodePayload } from "./decode.ts";
import type { TcpFrame } from "./framing.ts";
import { toHex } from "./framing.ts";
import { nameForType, PacketType } from "./packets.ts";

export const packageRoot = fileURLToPath(new URL("..", import.meta.url));

export class CapturedPacket extends Schema.Class<CapturedPacket>("CapturedPacket")({
  at: Schema.String,
  connection: Schema.Number,
  type: Schema.Number,
  name: Schema.String,
  seq: Schema.optionalKey(Schema.Number),
  payloadHex: Schema.String,
  decoded: Schema.Unknown,
}) {}

export const CapturedPacketLine = Schema.fromJsonString(CapturedPacket);

const stamp = () => new Date().toISOString().replaceAll(":", "-");

export class Session extends Context.Service<
  Session,
  {
    readonly dir: string;
    readonly packetsPath: string;
    readonly record: (connection: number, frame: TcpFrame) => Effect.Effect<CapturedPacket>;
    readonly note: (line: string) => Effect.Effect<void>;
  }
>()("@gimped/backend/Session") {
  static readonly layer = (
    outDir: string,
  ): Layer.Layer<Session, never, FileSystem.FileSystem | Path.Path> =>
    Layer.effect(
      Session,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const dir = path.join(outDir, stamp());
        yield* fs.makeDirectory(dir, { recursive: true });
        const packetsPath = path.join(dir, "packets.jsonl");
        yield* fs.writeFileString(packetsPath, "");
        const notesPath = path.join(dir, "notes.txt");
        yield* fs.writeFileString(notesPath, "");

        const record = Effect.fn("session.record")(function* (connection: number, frame: TcpFrame) {
          const redacted =
            frame.type === PacketType.loginRequest || frame.type === PacketType.loginRequestAlt;
          const base = {
            at: new Date().toISOString(),
            connection,
            type: frame.type,
            name: nameForType(frame.type),
            payloadHex: redacted ? `redacted:${frame.payload.length}` : toHex(frame.payload),
            decoded: decodePayload(frame.type, frame.payload),
          };
          const captured =
            frame.seq === undefined
              ? new CapturedPacket(base)
              : new CapturedPacket({ ...base, seq: frame.seq });
          const line = `${Schema.encodeUnknownSync(CapturedPacketLine)(captured)}\n`;
          yield* fs.writeFileString(packetsPath, line, { flag: "a" });
          return captured;
        });

        const note = Effect.fn("session.note")(function* (line: string) {
          yield* fs.writeFileString(notesPath, `${new Date().toISOString()} ${line}\n`, {
            flag: "a",
          });
        });

        return Session.of({ dir, packetsPath, record, note });
      }),
    );
}
