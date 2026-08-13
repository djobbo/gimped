import { MalformedJson, toMalformedJson } from "@gimped/common";
import { Context, Effect, Layer, Schema } from "effect";

export const Point = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
});

export const Bone = Schema.Struct({
  id: Schema.Int,
  name: Schema.optionalKey(Schema.String),
  a: Schema.Number,
  b: Schema.Number,
  c: Schema.Number,
  d: Schema.Number,
  tx: Schema.Number,
  ty: Schema.Number,
  alpha: Schema.Number,
  gfxFrame: Schema.Int,
});

export const Frame = Schema.Struct({
  index: Schema.Int,
  fireSocket: Schema.optionalKey(Point),
  platform: Schema.optionalKey(Point),
  bones: Schema.Array(Bone),
});

export const Move = Schema.Struct({
  name: Schema.String,
  startFrame: Schema.Number,
  duration: Schema.Number,
  loop: Schema.Number,
  recover: Schema.Number,
  free: Schema.Number,
  iconUI: Schema.Number,
  runEnds: Schema.Array(Schema.Number),
  frames: Schema.Array(Frame),
});

export const AnimDefJson = Schema.Struct({
  key: Schema.String,
  name: Schema.String,
  file: Schema.String,
  moves: Schema.Array(Move),
});

export const IndexEntry = Schema.Struct({
  file: Schema.String,
  key: Schema.String,
});

export const IndexJson = Schema.Struct({
  files: Schema.Array(IndexEntry),
});

export type AnimDef = typeof AnimDefJson.Type;
export type IndexFile = typeof IndexJson.Type;
export type BoneValue = typeof Bone.Type;
export type FrameValue = typeof Frame.Type;
export type MoveValue = typeof Move.Type;

export class AnimDefJsonService extends Context.Service<
  AnimDefJsonService,
  {
    readonly encodeDef: (def: AnimDef) => Effect.Effect<unknown>;
    readonly decodeDef: (text: string, path: string) => Effect.Effect<AnimDef, MalformedJson>;
    readonly encodeIndex: (index: IndexFile) => Effect.Effect<unknown>;
    readonly decodeIndex: (text: string, path: string) => Effect.Effect<IndexFile, MalformedJson>;
  }
>()("@gimped/anm/AnimDefJson") {
  static readonly layer: Layer.Layer<AnimDefJsonService> = Layer.sync(AnimDefJsonService, () =>
    AnimDefJsonService.of({
      encodeDef: Effect.fn("AnimDefJson.encodeDef")(function* (def: AnimDef) {
        return yield* Schema.encodeUnknownEffect(AnimDefJson)(def).pipe(Effect.orDie);
      }),
      decodeDef: Effect.fn("AnimDefJson.decodeDef")(function* (text: string, path: string) {
        return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(AnimDefJson))(text).pipe(
          Effect.mapError((error) => toMalformedJson(path, error)),
        );
      }),
      encodeIndex: Effect.fn("AnimDefJson.encodeIndex")(function* (index: IndexFile) {
        return yield* Schema.encodeUnknownEffect(IndexJson)(index).pipe(Effect.orDie);
      }),
      decodeIndex: Effect.fn("AnimDefJson.decodeIndex")(function* (text: string, path: string) {
        return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(IndexJson))(text).pipe(
          Effect.mapError((error) => toMalformedJson(path, error)),
        );
      }),
    }),
  );
}
