# Later (out of current game-runtime spec)

Logged follow-ups so they are not forgotten. **Not** in the child-process `GameRuntime` slice whose success is: Play → spawn → **2466** → **10405** → **10310** → in-match shell without `Error_FAILED_TRANSFER`.

Add items here when we cut scope. Do not treat this file as a commitment to build them next.

## Gameplay

- Rollback / UDP gameplay on the advertised UDP port (`var_5009`). v1 binds the socket so the port exists; datagrams may be captured or dropped.
- Spectate path **10306** (`method_3718` → `method_215(..., true)`). v1 is the play path only (**10310** / `method_8488`).
- Ranked queues and server-only playlist XML in **2431**. Custom room Play is the only start-match path in v1.
- Network Next (`useNetworkNext` bool in **2466**, UDP `mbUseNetworkNext`). v1 always sends `false`.

## Capacity / ops

- More than one match at a time. v1 `allocate` waits until the previous child is released.
- `GameRuntime` EC2 (or similar) layer: same `allocate` / `release`, `RunInstances` instead of `spawn`. Client still connects directly to the advertised host/ports.
- Rotate the game-session token instead of the stub string `"gimped"`.
- Capture the child’s TCP/UDP in the session folder (tshark on ephemeral ports, or the child writing its own `packets.jsonl`). v1 capture stays on backend **23001**.

## Client / protocol docs

- Fix `docs/protocol.md` still saying game-server hello is **10400**. After **2466** / `method_1011(..., true)` the client sends **10405** (`method_5889`).
