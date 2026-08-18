import { ByteReader, ByteWriter } from "@gimped/common";

const SEQ_FLAG = 32768;

export type TcpFrame = {
  readonly type: number;
  readonly seq: number | undefined;
  readonly payload: Uint8Array;
};

export const encodeFrame = (frame: TcpFrame): Uint8Array => {
  const writer = new ByteWriter();
  const type = frame.seq === undefined ? frame.type : frame.type | SEQ_FLAG;
  writer.writeU16BE(type);
  if (frame.seq !== undefined) writer.writeU32BE(frame.seq);
  writer.writeU16BE(frame.payload.length);
  writer.writeBytes(frame.payload);
  return writer.toUint8Array();
};

/** class_85.method_6988 streaming decoder. */
export class FrameDecoder {
  private buffer = new Uint8Array(0);

  push(chunk: Uint8Array): TcpFrame[] {
    if (chunk.length === 0) return [];
    const next = new Uint8Array(this.buffer.length + chunk.length);
    next.set(this.buffer);
    next.set(chunk, this.buffer.length);
    this.buffer = next;
    return this.take();
  }

  private take(): TcpFrame[] {
    const frames: TcpFrame[] = [];
    while (this.buffer.length > 0) {
      const reader = new ByteReader(this.buffer);
      if (reader.remaining < 2) break;
      const tagged = reader.readU16BE();
      const type = tagged & 32767;
      const hasSeq = (tagged & SEQ_FLAG) !== 0;
      let seq: number | undefined;
      if (hasSeq) {
        if (reader.remaining < 4) break;
        seq = reader.readU32BE();
      }
      if (reader.remaining < 2) break;
      const length = reader.readU16BE();
      if (reader.remaining < length) break;
      const payload = reader.readBytes(length);
      frames.push({ type, seq, payload });
      this.buffer = this.buffer.subarray(reader.offset);
    }
    return frames;
  }
}

export const toHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
