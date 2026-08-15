import { Context, Effect, Layer } from "effect";

export class Items extends Context.Service<
  Items,
  {
    readonly step: () => Effect.Effect<void>;
  }
>()("@gimped/sim/Items") {
  static readonly layer = Layer.succeed(
    Items,
    Items.of({
      step: Effect.fn("Items.step")(() => Effect.void),
    }),
  );
}
