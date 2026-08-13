import { ByteReader, ByteWriter } from "@gimped/common";
import { Context, Effect, Layer } from "effect";
import type { AnimDef, BoneValue, FrameValue, MoveValue } from "./AnimDefJson.ts";
import { InvalidAnm } from "./errors.ts";

const invalid = (reason: string) => new InvalidAnm({ reason });

const sameMatrix = (a: BoneValue, b: BoneValue): boolean =>
  a.a === b.a && a.b === b.b && a.c === b.c && a.d === b.d;

const sameTranslation = (a: BoneValue, b: BoneValue): boolean => a.tx === b.tx && a.ty === b.ty;

const copyFromPrevFrame = (prev: BoneValue, next: BoneValue): boolean =>
  prev.id === next.id &&
  sameMatrix(prev, next) &&
  sameTranslation(prev, next) &&
  prev.alpha === next.alpha;

const isIdentity = (b: BoneValue): boolean => b.a === 1 && b.b === 0 && b.c === 0 && b.d === 1;

const isRotationOnly = (b: BoneValue): boolean => b.c === b.b && b.d === -b.a;

const stripName = (bone: BoneValue): BoneValue => ({
  id: bone.id,
  a: bone.a,
  b: bone.b,
  c: bone.c,
  d: bone.d,
  tx: bone.tx,
  ty: bone.ty,
  alpha: bone.alpha,
  gfxFrame: bone.gfxFrame,
});

export class AnmCodec extends Context.Service<
  AnmCodec,
  {
    readonly decode: (payload: Uint8Array) => Effect.Effect<readonly AnimDef[], InvalidAnm>;
    readonly encode: (defs: readonly AnimDef[]) => Effect.Effect<Uint8Array, InvalidAnm>;
  }
>()("@gimped/anm/AnmCodec") {
  static readonly layer: Layer.Layer<AnmCodec> = Layer.sync(AnmCodec, () => {
    const decodeSync = (payload: Uint8Array): readonly AnimDef[] => {
      const reader = new ByteReader(payload);
      const defs: AnimDef[] = [];
      while (reader.readBool()) {
        defs.push(readDef(reader));
      }
      return defs;
    };

    const encodeSync = (defs: readonly AnimDef[]): Uint8Array => {
      const writer = new ByteWriter();
      for (const def of defs) {
        writer.writeBool(true);
        writeDef(writer, def);
      }
      writer.writeBool(false);
      return writer.toUint8Array();
    };

    return AnmCodec.of({
      decode: Effect.fn("AnmCodec.decode")(function* (payload: Uint8Array) {
        return yield* Effect.try({
          try: () => decodeSync(payload),
          catch: (error) =>
            error instanceof InvalidAnm
              ? error
              : invalid(error instanceof RangeError ? "truncated" : String(error)),
        });
      }),
      encode: Effect.fn("AnmCodec.encode")(function* (defs: readonly AnimDef[]) {
        return yield* Effect.try({
          try: () => encodeSync(defs),
          catch: (error) =>
            error instanceof InvalidAnm
              ? error
              : invalid(
                  error instanceof RangeError
                    ? error.message.includes("UTF")
                      ? "UTF exceeds 65535 bytes"
                      : "truncated"
                    : String(error),
                ),
        });
      }),
    });
  });
}

function readPoint(reader: ByteReader): { x: number; y: number } | undefined {
  if (!reader.readBool()) return undefined;
  return { x: reader.readF64LE(), y: reader.readF64LE() };
}

function writePoint(writer: ByteWriter, point: { x: number; y: number } | undefined): void {
  if (point === undefined) {
    writer.writeBool(false);
    return;
  }
  writer.writeBool(true);
  writer.writeF64LE(point.x);
  writer.writeF64LE(point.y);
}

function readBone(reader: ByteReader, prev: BoneValue | undefined): BoneValue {
  const id = reader.readI16LE();
  const alphaIsOne = reader.readBool();
  let a: number;
  let b: number;
  let c: number;
  let d: number;
  const copyMatrix = reader.readBool();
  if (copyMatrix) {
    if (prev === undefined) throw invalid("copy-matrix without previous bone");
    a = prev.a;
    b = prev.b;
    c = prev.c;
    d = prev.d;
  } else {
    const compactMatrix = reader.readBool();
    if (compactMatrix) {
      const identity = reader.readBool();
      if (identity) {
        a = 1;
        b = 0;
        c = 0;
        d = 1;
      } else {
        a = reader.readF32LE();
        b = reader.readF32LE();
        c = b;
        d = -a;
      }
    } else {
      a = reader.readF32LE();
      b = reader.readF32LE();
      c = reader.readF32LE();
      d = reader.readF32LE();
    }
  }
  let tx: number;
  let ty: number;
  if (reader.readBool()) {
    if (prev === undefined) throw invalid("copy-translation without previous bone");
    tx = prev.tx;
    ty = prev.ty;
  } else {
    tx = reader.readF32LE();
    ty = reader.readF32LE();
  }
  let gfxFrame = 1;
  if (reader.readBool()) gfxFrame = reader.readI8();
  const alpha = alphaIsOne ? 1 : reader.readU8() / 255;
  return { id, a, b, c, d, tx, ty, alpha, gfxFrame };
}

function writeFullBone(writer: ByteWriter, bone: BoneValue, prev: BoneValue | undefined): void {
  writer.writeI16LE(bone.id);
  writer.writeBool(bone.alpha === 1);
  if (prev !== undefined && sameMatrix(prev, bone)) {
    writer.writeBool(true);
  } else {
    writer.writeBool(false);
    if (isIdentity(bone)) {
      writer.writeBool(true);
      writer.writeBool(true);
    } else if (isRotationOnly(bone)) {
      writer.writeBool(true);
      writer.writeBool(false);
      writer.writeF32LE(bone.a);
      writer.writeF32LE(bone.b);
    } else {
      writer.writeBool(false);
      writer.writeF32LE(bone.a);
      writer.writeF32LE(bone.b);
      writer.writeF32LE(bone.c);
      writer.writeF32LE(bone.d);
    }
  }
  if (prev !== undefined && sameTranslation(prev, bone)) {
    writer.writeBool(true);
  } else {
    writer.writeBool(false);
    writer.writeF32LE(bone.tx);
    writer.writeF32LE(bone.ty);
  }
  if (bone.gfxFrame === 1) {
    writer.writeBool(false);
  } else {
    writer.writeBool(true);
    writer.writeI8(bone.gfxFrame);
  }
  if (bone.alpha !== 1) {
    writer.writeU8(Math.round(bone.alpha * 255));
  }
}

function readFrame(reader: ByteReader, prevFrame: FrameValue | undefined): FrameValue {
  const index = reader.readI16LE();
  const fireSocket = readPoint(reader);
  const platform = readPoint(reader);
  const boneCount = reader.readI16LE();
  const bones: BoneValue[] = [];
  for (let i = 0; i < boneCount; i++) {
    if (reader.readBool()) {
      if (prevFrame === undefined) throw invalid("copy-from-prev-frame without previous");
      const copied = prevFrame.bones[i];
      if (copied === undefined) throw invalid("copy-from-prev-frame missing bone");
      const bone = stripName(copied);
      if (!reader.readBool()) {
        bones.push({ ...bone, gfxFrame: reader.readI8() });
      } else {
        bones.push(bone);
      }
    } else {
      bones.push(readBone(reader, i > 0 ? bones[i - 1] : undefined));
    }
  }
  const frame: FrameValue = { index, bones };
  const withFire = fireSocket === undefined ? frame : { ...frame, fireSocket };
  return platform === undefined ? withFire : { ...withFire, platform };
}

function writeFrame(
  writer: ByteWriter,
  frame: FrameValue,
  prevFrame: FrameValue | undefined,
): void {
  writer.writeI16LE(frame.index);
  writePoint(writer, frame.fireSocket);
  writePoint(writer, frame.platform);
  writer.writeI16LE(frame.bones.length);
  for (let i = 0; i < frame.bones.length; i++) {
    const bone = stripName(frame.bones[i]!);
    const prevFrameBone = prevFrame?.bones[i];
    if (prevFrameBone !== undefined && copyFromPrevFrame(stripName(prevFrameBone), bone)) {
      writer.writeBool(true);
      if (bone.gfxFrame === prevFrameBone.gfxFrame) {
        writer.writeBool(true);
      } else {
        writer.writeBool(false);
        writer.writeI8(bone.gfxFrame);
      }
    } else {
      writer.writeBool(false);
      writeFullBone(writer, bone, i > 0 ? stripName(frame.bones[i - 1]!) : undefined);
    }
  }
}

function readMove(reader: ByteReader): MoveValue {
  const name = reader.readUTFLE();
  const duration = reader.readU32LE();
  const loop = reader.readU32LE();
  const recover = reader.readU32LE();
  const free = reader.readU32LE();
  const iconUI = reader.readU32LE();
  const startFrame = reader.readU32LE();
  const runEndCount = reader.readU32LE();
  const runEnds: number[] = [];
  for (let i = 0; i < runEndCount; i++) runEnds.push(reader.readU32LE());
  const blobSize = reader.readU32LE();
  const start = reader.offset;
  const frames: FrameValue[] = [];
  for (let i = 0; i < duration; i++) {
    frames.push(readFrame(reader, i > 0 ? frames[i - 1] : undefined));
  }
  if (reader.offset - start !== blobSize) throw invalid("frame blob size mismatch");
  return { name, startFrame, duration, loop, recover, free, iconUI, runEnds, frames };
}

function writeMove(writer: ByteWriter, defKey: string, move: MoveValue): void {
  if (move.duration !== move.frames.length) {
    throw invalid(
      `duration/frame count mismatch at ${defKey} / ${move.name} (duration=${move.duration}, frames=${move.frames.length})`,
    );
  }
  writer.writeUTFLE(move.name);
  writer.writeU32LE(move.duration);
  writer.writeU32LE(move.loop);
  writer.writeU32LE(move.recover);
  writer.writeU32LE(move.free);
  writer.writeU32LE(move.iconUI);
  writer.writeU32LE(move.startFrame);
  writer.writeU32LE(move.runEnds.length);
  for (const value of move.runEnds) writer.writeU32LE(value);
  const blob = new ByteWriter();
  for (let i = 0; i < move.frames.length; i++) {
    writeFrame(blob, move.frames[i]!, i > 0 ? move.frames[i - 1] : undefined);
  }
  const bytes = blob.toUint8Array();
  writer.writeU32LE(bytes.byteLength);
  writer.writeBytes(bytes);
}

function readDef(reader: ByteReader): AnimDef {
  const key = reader.readUTFLE();
  const name = reader.readUTFLE();
  const file = reader.readUTFLE();
  const moveCount = reader.readU32LE();
  const moves: MoveValue[] = [];
  for (let i = 0; i < moveCount; i++) moves.push(readMove(reader));
  return { key, name, file, moves };
}

function writeDef(writer: ByteWriter, def: AnimDef): void {
  writer.writeUTFLE(def.key);
  writer.writeUTFLE(def.name);
  writer.writeUTFLE(def.file);
  writer.writeU32LE(def.moves.length);
  for (const move of def.moves) writeMove(writer, def.key, move);
}
