export { ByteReader, ByteWriter } from "@gimped/common";

export const rotr = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0;
