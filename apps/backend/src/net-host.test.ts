import { describe, expect, it } from "@effect/vitest";
import { resolveListenHosts } from "./net-host.ts";

describe("net-host", () => {
  it("keeps loopback bind and advertise local", () => {
    expect(resolveListenHosts("127.0.0.1")).toEqual({
      bindHost: "127.0.0.1",
      advertiseHost: "127.0.0.1",
    });
  });

  it("uses --host as the client address and widens bind for remote IPs", () => {
    expect(resolveListenHosts("100.64.1.2")).toEqual({
      bindHost: "0.0.0.0",
      advertiseHost: "100.64.1.2",
    });
  });

  it("falls back advertise to loopback when binding the wildcard", () => {
    expect(resolveListenHosts("0.0.0.0")).toEqual({
      bindHost: "0.0.0.0",
      advertiseHost: "127.0.0.1",
    });
  });
});
