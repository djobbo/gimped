import { describe, expect, test } from "vitest";
import { rpcPortFromEvent } from "./client-api-live.ts";

describe("rpcPortFromEvent", () => {
  test("reads the first transferred port from a Chromium ports array", () => {
    const port = { name: "renderer" };
    expect(rpcPortFromEvent({ data: "rpc-port", ports: [port] })).toBe(port);
  });

  test("returns undefined when no port was transferred", () => {
    expect(rpcPortFromEvent({ data: "rpc-port", ports: [] })).toBeUndefined();
  });

  test("ignores messages that are not the rpc-port handshake", () => {
    const port = { name: "other" };
    expect(rpcPortFromEvent({ data: "other", ports: [port] })).toBeUndefined();
  });
});
