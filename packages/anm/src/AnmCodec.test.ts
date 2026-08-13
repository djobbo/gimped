import { ByteWriter, runWith } from "@gimped/common";
import { Effect, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { AnmCodec } from "./AnmCodec.ts";
import { AnimDefJson, type AnimDef } from "./AnimDefJson.ts";
import { InvalidAnm } from "./errors.ts";

const run = runWith(AnmCodec.layer);

const identityBone = (id: number) => ({
  id,
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  tx: 0,
  ty: 0,
  alpha: 1,
  gfxFrame: 1,
});

const oneDef = (overrides?: Partial<AnimDef["moves"][number]["frames"][number]>): AnimDef => ({
  key: "anims/Foo.swf/a__Foo",
  name: "a__Foo",
  file: "anims/Foo.swf",
  moves: [
    {
      name: "Ready",
      startFrame: 1,
      duration: 1,
      loop: 0,
      recover: 0,
      free: 0,
      iconUI: 0,
      runEnds: [],
      frames: [
        {
          index: 0,
          bones: [identityBone(12)],
          ...overrides,
        },
      ],
    },
  ],
});

describe("AnmCodec", () => {
  it("round-trips a one-def identity bone without names", async () => {
    const input = oneDef();
    const { decoded } = await run(
      Effect.gen(function* () {
        const codec = yield* AnmCodec;
        const payload = yield* codec.encode([input]);
        const decoded = yield* codec.decode(payload);
        return { decoded };
      }),
    );
    expect(Schema.encodeUnknownSync(Schema.Array(AnimDefJson))(decoded)).toEqual(
      Schema.encodeUnknownSync(Schema.Array(AnimDefJson))([input]),
    );
  });

  it("expands copy-from-prev-frame and gfxFrame override", async () => {
    const input: AnimDef = {
      ...oneDef(),
      moves: [
        {
          name: "Ready",
          startFrame: 1,
          duration: 2,
          loop: 0,
          recover: 0,
          free: 0,
          iconUI: 0,
          runEnds: [],
          frames: [
            { index: 0, bones: [identityBone(3)] },
            { index: 1, bones: [{ ...identityBone(3), gfxFrame: 4 }] },
          ],
        },
      ],
    };
    const decoded = await run(
      Effect.gen(function* () {
        const codec = yield* AnmCodec;
        return yield* codec.decode(yield* codec.encode([input]));
      }),
    );
    expect(decoded[0]?.moves[0]?.frames[1]?.bones[0]?.gfxFrame).toBe(4);
    expect(decoded[0]?.moves[0]?.frames[1]?.bones[0]?.id).toBe(3);
  });

  it("round-trips rotation-only, alpha, fireSocket, and runEnds", async () => {
    const input: AnimDef = {
      key: "k",
      name: "n",
      file: "f",
      moves: [
        {
          name: "Swing",
          startFrame: 2,
          duration: 1,
          loop: 1,
          recover: 2,
          free: 3,
          iconUI: 4,
          runEnds: [5, 6],
          frames: [
            {
              index: 7,
              fireSocket: { x: 1.5, y: -3 },
              bones: [
                {
                  id: 1,
                  a: 0.5,
                  b: 0,
                  c: 0,
                  d: -0.5,
                  tx: 10,
                  ty: 20,
                  alpha: 128 / 255,
                  gfxFrame: 2,
                },
              ],
            },
          ],
        },
      ],
    };
    const decoded = await run(
      Effect.gen(function* () {
        const codec = yield* AnmCodec;
        return yield* codec.decode(yield* codec.encode([input]));
      }),
    );
    const bone = decoded[0]?.moves[0]?.frames[0]?.bones[0];
    expect(bone?.a).toBeCloseTo(0.5, 5);
    expect(bone?.b).toBeCloseTo(0, 5);
    expect(bone?.c).toBeCloseTo(0, 5);
    expect(bone?.d).toBeCloseTo(-0.5, 5);
    expect(bone?.alpha).toBe(128 / 255);
    expect(decoded[0]?.moves[0]?.frames[0]?.fireSocket).toEqual({ x: 1.5, y: -3 });
    expect(decoded[0]?.moves[0]?.runEnds).toEqual([5, 6]);
  });

  it("fails when copy-from-prev-frame has no previous frame", async () => {
    const writer = new ByteWriter();
    writer.writeBool(true);
    writer.writeUTFLE("k");
    writer.writeUTFLE("n");
    writer.writeUTFLE("f");
    writer.writeU32LE(1);
    writer.writeUTFLE("Ready");
    writer.writeU32LE(1);
    writer.writeU32LE(0);
    writer.writeU32LE(0);
    writer.writeU32LE(0);
    writer.writeU32LE(0);
    writer.writeU32LE(1);
    writer.writeU32LE(0);
    const frames = new ByteWriter();
    frames.writeI16LE(0);
    frames.writeBool(false);
    frames.writeBool(false);
    frames.writeI16LE(1);
    frames.writeBool(true);
    const blob = frames.toUint8Array();
    writer.writeU32LE(blob.byteLength);
    writer.writeBytes(blob);
    writer.writeBool(false);
    const error = await run(
      Effect.gen(function* () {
        const codec = yield* AnmCodec;
        return yield* codec.decode(writer.toUint8Array()).pipe(Effect.flip);
      }),
    );
    expect(error).toBeInstanceOf(InvalidAnm);
    expect(error.reason).toBe("copy-from-prev-frame without previous");
  });

  it("fails when frame blob size does not match", async () => {
    const writer = new ByteWriter();
    writer.writeBool(true);
    writer.writeUTFLE("k");
    writer.writeUTFLE("n");
    writer.writeUTFLE("f");
    writer.writeU32LE(1);
    writer.writeUTFLE("Ready");
    writer.writeU32LE(0);
    writer.writeU32LE(0);
    writer.writeU32LE(0);
    writer.writeU32LE(0);
    writer.writeU32LE(0);
    writer.writeU32LE(1);
    writer.writeU32LE(0);
    writer.writeU32LE(4);
    writer.writeBytes(Uint8Array.from([1, 2, 3, 4]));
    writer.writeBool(false);
    const error = await run(
      Effect.gen(function* () {
        const codec = yield* AnmCodec;
        return yield* codec.decode(writer.toUint8Array()).pipe(Effect.flip);
      }),
    );
    expect(error).toBeInstanceOf(InvalidAnm);
    expect(error.reason).toBe("frame blob size mismatch");
  });
});
