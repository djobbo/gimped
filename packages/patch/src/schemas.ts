import { Schema } from "effect";

export const PatchRegistry = Schema.Struct({
  steamAppId: Schema.Number,
  steamDepotId: Schema.Number,
  steamManifestId: Schema.String,
  fullDepot: Schema.Boolean,
  clientBuild: Schema.String,
  swzKey: Schema.Number,
  swf: Schema.String,
  files: Schema.Array(Schema.String),
});
export const PatchRegistryText = Schema.fromJsonString(PatchRegistry, { space: 2 });
export type PatchRegistry = typeof PatchRegistry.Type;

export const IndexEntry = Schema.Struct({
  clientBuild: Schema.String,
  swzKey: Schema.Number,
  fetchedAt: Schema.String,
});
export type IndexEntry = typeof IndexEntry.Type;

export const PatchIndex = Schema.Struct({
  latestManifestId: Schema.optionalKey(Schema.String),
  patches: Schema.Record(Schema.String, IndexEntry),
});
export const PatchIndexText = Schema.fromJsonString(PatchIndex, { space: 2 });
export type PatchIndex = typeof PatchIndex.Type;
