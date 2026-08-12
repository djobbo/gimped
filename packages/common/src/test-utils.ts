import { Effect, type Layer } from "effect";

/** Run an Effect after providing a fully satisfied Layer. */
export const runWith =
  <ROut>(layer: Layer.Layer<ROut>) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> =>
    Effect.runPromise(Effect.provide(effect, layer) as Effect.Effect<A, E>);
