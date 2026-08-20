export type ResolvedListenHosts = {
  readonly bindHost: string;
  readonly advertiseHost: string;
};

/**
 * `--host` is the address clients use (-h / 2466).
 * Non-loopback hosts bind on 0.0.0.0 so Tailscale/LAN can connect.
 */
export const resolveListenHosts = (host: string): ResolvedListenHosts => {
  if (host === "0.0.0.0" || host === "::" || host === "[::]") {
    return { bindHost: host, advertiseHost: "127.0.0.1" };
  }
  if (host === "127.0.0.1" || host === "::1") {
    return { bindHost: host, advertiseHost: host };
  }
  return { bindHost: "0.0.0.0", advertiseHost: host };
};
