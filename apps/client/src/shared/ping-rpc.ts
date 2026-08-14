import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

export class PingRpcs extends RpcGroup.make(
  Rpc.make("Ping", {
    success: Schema.String,
  }),
  Rpc.make("Ticks", {
    success: Schema.Number,
    stream: true,
  }),
) {}
