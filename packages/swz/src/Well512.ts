import { Context, Effect, Layer } from "effect";

export type Well512Instance = {
  readonly initState: (seed: number) => void;
  readonly next: () => number;
};

const createInstance = (): Well512Instance => {
  const state = new Uint32Array(16);
  let stateIndex = 0;

  return {
    initState(seed: number): void {
      const s = seed >>> 0;
      state[0] = s;
      stateIndex = 0;
      for (let i = 1; i < 16; i++) {
        const previous = state[i - 1]!;
        const modified = previous ^ (previous >>> 30);
        state[i] = (i + Math.imul(1812433253, modified)) >>> 0;
      }
    },
    next(): number {
      const a = state[stateIndex]!;
      const b = state[(stateIndex - 3) & 0xf]!;
      const c = (a ^ b ^ ((b ^ Math.imul(2, a)) << 15)) >>> 0;
      const e = state[(stateIndex - 7) & 0xf]!;
      const d = ((e >>> 11) ^ e) >>> 0;
      const newIndex = (stateIndex - 1) & 0xf;
      state[stateIndex] = (d ^ c) >>> 0;
      state[newIndex] =
        (state[newIndex]! ^
          d ^
          Math.imul(32, (d ^ c) & 0xfed22169) ^
          Math.imul(4, state[newIndex]! ^ ((c ^ (d << 10)) << 16))) >>>
        0;
      stateIndex = newIndex;
      return state[newIndex]! >>> 0;
    },
  };
};

export class Well512 extends Context.Service<
  Well512,
  {
    readonly create: () => Effect.Effect<Well512Instance>;
  }
>()("@gimped/swz/Well512") {
  static readonly layer = Layer.sync(Well512, () => ({
    create: Effect.fn("Well512.create")(() => Effect.sync(() => createInstance())),
  }));
}

export const createWell512 = Effect.fn("createWell512")(function* () {
  const well512 = yield* Well512;
  return yield* well512.create();
});
