import { Schema } from "effect";

export class UnsupportedMatch extends Schema.TaggedError<UnsupportedMatch>()("UnsupportedMatch", {
  reason: Schema.String,
}) {}

export class MissingTables extends Schema.TaggedError<MissingTables>()("MissingTables", {
  reason: Schema.String,
}) {}

export class MissingCollision extends Schema.TaggedError<MissingCollision>()("MissingCollision", {
  levelId: Schema.Number,
}) {}

export class SimulationFault extends Schema.TaggedError<SimulationFault>()("SimulationFault", {
  reason: Schema.String,
}) {}
