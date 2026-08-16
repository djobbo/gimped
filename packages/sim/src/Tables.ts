import { Context, Layer } from "effect";
import type { TablesData } from "./domain.ts";

export class Tables extends Context.Service<Tables, TablesData>()("@gimped/sim/Tables") {
  static readonly make = (data: TablesData) => Layer.succeed(Tables, Tables.of(data));
}
