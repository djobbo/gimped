# Short-lived game-server child Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On custom-room Play, spawn a short-lived `game listen` process, advertise its TCP/UDP in **2466**, and have that child answer **10405** with **10310** so the real client reaches the in-match shell without `Error_FAILED_TRANSFER`.

**Architecture:** Backend `listen` stays on TCP 23001 only. Packet **55** calls `GameRuntime.allocate`, which spawns `node --experimental-transform-types src/bin.ts game listen`, reads one Schema JSON ready line, then encodes **2466**. The child binds loopback TCP+UDP port 0, serves game frames (not login/lobby), and dies with the backend scope or `release`. The Brawlhalla client connects directly to the child.

**Tech Stack:** Effect `4.0.0-rc.109` (catalog), `@effect/platform-node` `NodeSocketServer` / `NodeSocket`, `effect/unstable/process/ChildProcess`, `@effect/vitest`, Vite+ (`vp`) in `apps/backend`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-18-game-runtime-child-design.md`. Follow-ups stay in `apps/backend/docs/later.md` — do not implement them.
- Work in `C:\Users\mrxbl\Desktop\gimped\.worktrees\feat-backend-stub` (branch `feat/backend-stub`).
- Effect.gen / Effect.fn; `Context.Service` + Layer; Schema for JSON (no `JSON.parse` / `JSON.stringify`); `ChildProcess` not `node:child_process`.
- `vp` only (`vp check --fix`, `vp test` in `apps/backend`). After each task: check, test, commit.
- Token stays `"gimped"`. `useNetworkNext` is always `false`. One match at a time (`Semaphore.make(1)`). Ready timeout **10 seconds**.
- Game hello is **10405** (`method_5889`), not **10400**. Level id **1**. User id **1**, name `Gimped`.
- ChildProcess handles must be scoped to the **listen** Layer scope, not `ingestChunk` (or the child dies before the client connects).
- Do not commit `apps/backend/captures/` or Steam tickets.
- If `apps/backend/src/**` is still untracked, commit the existing stub first (`feat: add backend TCP stub`) before Task 1. Do not mix GameRuntime into that commit.
- Source of truth for packet layout: `brawlhalla-src/dump/scripts` (`LinkUpdater.method_3206`, `class_139.method_5889` / `method_215`, `class_162.method_1563`). Prefer dump over obf.

---

## File structure

| File                                       | Role                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `apps/backend/src/packets.ts`              | Add `gameConnect` **10405**, `matchSetup` **10310**                                 |
| `apps/backend/src/match-spec.ts`           | `MatchSpec`, `GameListenReady`, JSON line Schema                                    |
| `apps/backend/src/game-connect.ts`         | **10405** packed user id + token                                                    |
| `apps/backend/src/assign-game-server.ts`   | `encodeAssignGameServer(assigned)` (no hardcoded ports)                             |
| `apps/backend/src/custom-lobby.ts`         | Export `writeTimedRuleset` for **10310**                                            |
| `apps/backend/src/match-setup.ts`          | **10310** / `method_215` encode + decode                                            |
| `apps/backend/src/game-replies.ts`         | Game-socket actions (no `repliesFor`)                                               |
| `apps/backend/src/udp-bind.ts`             | Ephemeral UDP bind (`node:dgram` + `Effect.addFinalizer`; Effect has no UDP module) |
| `apps/backend/src/game-runtime.ts`         | `GameRuntime` service, fake layer, child-process layer                              |
| `apps/backend/src/commands/game-listen.ts` | `game listen` CLI                                                                   |
| `apps/backend/src/cli.ts`                  | Subcommands `listen` + `game`                                                       |
| `apps/backend/src/replies.ts`              | Remove packet **55**                                                                |
| `apps/backend/src/stub.ts`                 | Lobby `Ref`, **55** → `allocate`                                                    |
| `apps/backend/src/commands/listen.ts`      | Drop 23011 server; provide `GameRuntime`                                            |
| `apps/backend/src/decode.ts`               | Decode **10405** / **10310** for captures                                           |
| `apps/backend/docs/next-step.md`           | Manual Play check                                                                   |

Colocate `*.test.ts` next to each module.

---

### Task 1: Parameterized **2466** and **10405** codecs

**Files:**

- Modify: `apps/backend/src/packets.ts`
- Modify: `apps/backend/src/assign-game-server.ts`
- Modify: `apps/backend/src/assign-game-server.test.ts`
- Create: `apps/backend/src/game-connect.ts`
- Create: `apps/backend/src/game-connect.test.ts`
- Modify: `apps/backend/src/packets.test.ts` (optional alias asserts)
- Modify: `apps/backend/src/decode.ts` (decode **10405** only; **10310** in Task 2)

**Interfaces:**

- Consumes: `BitWriter` / `BitReader`; `STUB_USER_ID`
- Produces:
  - `PacketType.gameConnect = 10405`, `PacketType.matchSetup = 10310`
  - `encodeAssignGameServer(assigned: Omit<AssignGameServer, "_tag">): Uint8Array`
  - `encodeGameConnect({ userId, token }): Uint8Array`
  - `decodeGameConnect(payload): { _tag: "GameConnect"; userId: number; token: string }`

- [ ] **Step 1: Write the failing tests**

Replace `apps/backend/src/assign-game-server.test.ts` with:

```ts
import { describe, expect, it } from "@effect/vitest";
import { decodeAssignGameServer, encodeAssignGameServer } from "./assign-game-server.ts";
import { STUB_USER_ID } from "./login-accepted.ts";

describe("assign game server", () => {
  it("round-trips LinkUpdater.method_3206 fields from the allocation", () => {
    const assigned = {
      userId: STUB_USER_ID,
      levelId: 1,
      token: "gimped",
      host: "127.0.0.1",
      tcpPort: 54321,
      udpPort: 54322,
      useNetworkNext: false,
    };
    expect(decodeAssignGameServer(encodeAssignGameServer(assigned))).toEqual({
      _tag: "AssignGameServer",
      ...assigned,
    });
  });
});
```

Create `apps/backend/src/game-connect.test.ts`:

```ts
import { describe, expect, it } from "@effect/vitest";
import { decodeGameConnect, encodeGameConnect } from "./game-connect.ts";
import { toHex } from "./framing.ts";

describe("game connect 10405", () => {
  it("round-trips packed user id + token (method_5889)", () => {
    expect(decodeGameConnect(encodeGameConnect({ userId: 1, token: "gimped" }))).toEqual({
      _tag: "GameConnect",
      userId: 1,
      token: "gimped",
    });
  });

  it("decodes the captured payload from method_5889", () => {
    const payload = Uint8Array.from(Buffer.from("0400199da5b5c19590", "hex"));
    expect(decodeGameConnect(payload)).toEqual({
      _tag: "GameConnect",
      userId: 1,
      token: "gimped",
    });
    expect(toHex(encodeGameConnect({ userId: 1, token: "gimped" }))).toBe("0400199da5b5c19590");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test` in `apps/backend`

Expected: FAIL (`encodeAssignGameServer` arity and `game-connect.ts` missing).

- [ ] **Step 3: Implement codecs**

In `packets.ts` add to `PacketType`:

```ts
gameConnect: 10405,
matchSetup: 10310,
```

and matching `nameForType` aliases `"gameConnect"` / `"matchSetup"`.

Change `encodeAssignGameServer` to take the allocation (keep `STUB_*` constants for defaults used by tests/docs, but do not read ports from them inside encode):

```ts
export const encodeAssignGameServer = (assigned: Omit<AssignGameServer, "_tag">): Uint8Array => {
  const bits = new BitWriter();
  bits.writePackedU32(assigned.userId);
  bits.writePackedU32(assigned.levelId);
  bits.writeString(assigned.token);
  bits.writeString(assigned.host);
  bits.writePackedU32(assigned.tcpPort);
  bits.writePackedU24(assigned.udpPort);
  bits.writeBool(assigned.useNetworkNext);
  return bits.toUint8Array();
};
```

`apps/backend/src/game-connect.ts`:

```ts
import { BitReader, BitWriter } from "./bitstream.ts";

export type GameConnect = {
  readonly _tag: "GameConnect";
  readonly userId: number;
  readonly token: string;
};

export const encodeGameConnect = (connect: {
  readonly userId: number;
  readonly token: string;
}): Uint8Array => {
  const bits = new BitWriter();
  bits.writePackedU32(connect.userId);
  bits.writeString(connect.token);
  return bits.toUint8Array();
};

export const decodeGameConnect = (payload: Uint8Array): GameConnect => {
  const bits = new BitReader(payload);
  return { _tag: "GameConnect", userId: bits.readPackedU32(), token: bits.readString() };
};
```

Update `replies.ts` `startMatch` branch temporarily to `encodeAssignGameServer({ userId: STUB_USER_ID, levelId: STUB_LEVEL_ID, token: STUB_GAME_TOKEN, host: STUB_GAME_HOST, tcpPort: STUB_GAME_TCP_PORT, udpPort: STUB_GAME_UDP_PORT, useNetworkNext: false })` so existing `replies.test.ts` still compiles until Task 6 removes it.

Wire `decodePayload` for `PacketType.gameConnect` → `decodeGameConnect`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp check --fix` then `vp test` in `apps/backend`

Expected: PASS (existing 32 tests plus new ones).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/packets.ts apps/backend/src/packets.test.ts apps/backend/src/assign-game-server.ts apps/backend/src/assign-game-server.test.ts apps/backend/src/game-connect.ts apps/backend/src/game-connect.test.ts apps/backend/src/decode.ts apps/backend/src/replies.ts
git commit -m "feat: encode 10405 and parameterized 2466"
```

---

### Task 2: **10310** match-setup snapshot (`method_215`)

**Files:**

- Modify: `apps/backend/src/custom-lobby.ts` (export `writeTimedRuleset`)
- Create: `apps/backend/src/match-setup.ts`
- Create: `apps/backend/src/match-setup.test.ts`
- Modify: `apps/backend/src/decode.ts`

**Interfaces:**

- Consumes: `writeTimedRuleset(bits: BitWriter): void` (same 15 packed u32s as today’s private `writeRuleset`); `STUB_USER_ID`, `STUB_DISPLAY_NAME`, `BOT_CONTROLLER`
- Produces:
  - `encodeMatchSetup(options: { includeBot: boolean }): Uint8Array`
  - `decodeMatchSetup(payload): { _tag: "MatchSetup"; custom: boolean; playerCount: number; hostUserId: number }`

Dump map (`class_139.method_215`, `param2=false`):

1. packed u32 `var_9713` → `0`
2. packed u32 seed `_loc3_` → `0` (`method_2858` randomizes if this were null; `0` is a real uint)
3. packed u24 `_loc4_` UDP key → `0`
4. packed u32 `var_10850` → `0` (custom, not matchmaking)
5. packed u32 `_loc5_` → `0`
6. packed u32 `_loc6_` → `0`
7. packed u32 `_loc7_` hero-slot count → `0` (skip per-player hero loop; avoids `HeroType.var_1268` lookup)
8. packed u32 `var_7564` → `0`
9. packed u32 `var_2536` → `0`
10. packed u32 `_loc8_` → `0`
11. bool `_loc9_` extra `class_179` → `false`
12. `class_162.method_1563` = `writeTimedRuleset`
13. player list: while bool true, then bool false terminator

Each player (host, then optional bot):

- packed u32 team `var_9298` → `0`
- string name (`method_3501` = UTF-16-length string)
- string `var_2899` → `""`
- packed u32 `var_2823` → `0`
- packed u32 entity `_loc14_` → `1` host / `2` bot
- packed u32 `var_14594` user id → `1` host / `0` bot
- packed u32 `var_12843` → `0`
- packed u32 `var_3241` → `0`
- bool `_loc15_` local → `true` host / `false` bot
- bool `_loc16_` spectator → `false`
- bool `_loc17_` bot-costume → `false` host / `true` bot
- packed u32 `_loc18_` controller → `0` host / `BOT_CONTROLLER` (5) bot
- packed u32 ×6 (`var_7733` … `var_11747`) → `0`
- packed u32 ×8 (`var_7838`) → `0`
- packed u24 `var_2378` → `0`
- packed u24 `var_15047` → `0`
- `class_29.method_5903(param, 2)` empty list = bool `false`
- packed u24 `var_4335` → `0`
- packed u32 `var_6424` → `0`
- packed u24 `var_6031` → `0`
- packed u24 `var_3535` → `0`
- packed u32 `var_6575` → `0`
- packed u32 `var_8737` → `0`
- string `var_7534` → `""`
- hero loop length `_loc7_` (0 iterations)

Do not invent extra fields. Level comes from **2466** (`var_8491`), not this packet.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "@effect/vitest";
import { decodeMatchSetup, encodeMatchSetup } from "./match-setup.ts";
import { STUB_USER_ID } from "./login-accepted.ts";

describe("match setup 10310", () => {
  it("round-trips a host-only custom snapshot (method_215)", () => {
    const decoded = decodeMatchSetup(encodeMatchSetup({ includeBot: false }));
    expect(decoded).toEqual({
      _tag: "MatchSetup",
      custom: true,
      playerCount: 1,
      hostUserId: STUB_USER_ID,
    });
  });

  it("includes a second player when includeBot is true", () => {
    expect(decodeMatchSetup(encodeMatchSetup({ includeBot: true })).playerCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test` in `apps/backend`

Expected: FAIL (`match-setup.ts` missing).

- [ ] **Step 3: Implement encoder/decoder**

Rename `writeRuleset` → exported `writeTimedRuleset` in `custom-lobby.ts` (update internal call sites).

`match-setup.ts`: implement `writePlayer` + `encodeMatchSetup` / `decodeMatchSetup` exactly as the dump map above. Decoder: read header through `_loc9_` and `writeTimedRuleset` (15 packed u32s), then count players until a false list bit; first player’s `var_14594` is `hostUserId`; `custom` is `var_10850 === 0`.

Add `decode.ts` branch for `PacketType.matchSetup`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp check --fix` then `vp test` in `apps/backend`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/custom-lobby.ts apps/backend/src/match-setup.ts apps/backend/src/match-setup.test.ts apps/backend/src/decode.ts
git commit -m "feat: encode custom-room match setup 10310"
```

---

### Task 3: Game-socket replies (no login challenge)

**Files:**

- Create: `apps/backend/src/game-replies.ts`
- Create: `apps/backend/src/game-replies.test.ts`

**Interfaces:**

- Consumes: `decodeGameConnect`, `encodeMatchSetup`, `PacketType`, `TcpFrame`, `MatchSpec` fields `{ userId, token, includeBot }`
- Produces:

```ts
export type GameAction =
  { readonly _tag: "Reply"; readonly frames: ReadonlyArray<TcpFrame> } | { readonly _tag: "Close" };

export const gameActionFor: (
  frame: TcpFrame,
  spec: { readonly userId: number; readonly token: string; readonly includeBot: boolean },
) => GameAction;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "@effect/vitest";
import { encodeGameConnect } from "./game-connect.ts";
import { gameActionFor } from "./game-replies.ts";
import { decodeMatchSetup } from "./match-setup.ts";
import { PacketType } from "./packets.ts";

const spec = { userId: 1, token: "gimped", includeBot: false };

describe("game replies", () => {
  it("answers valid 10405 with 10310", () => {
    const action = gameActionFor(
      {
        type: PacketType.gameConnect,
        seq: undefined,
        payload: encodeGameConnect({ userId: 1, token: "gimped" }),
      },
      spec,
    );
    expect(action._tag).toBe("Reply");
    if (action._tag !== "Reply") return;
    expect(action.frames).toHaveLength(1);
    expect(action.frames[0]?.type).toBe(PacketType.matchSetup);
    expect(decodeMatchSetup(action.frames[0]!.payload).hostUserId).toBe(1);
  });

  it("closes on token mismatch", () => {
    expect(
      gameActionFor(
        {
          type: PacketType.gameConnect,
          seq: undefined,
          payload: encodeGameConnect({ userId: 1, token: "nope" }),
        },
        spec,
      ),
    ).toEqual({ _tag: "Close" });
  });

  it("echoes keepalive 12100", () => {
    expect(
      gameActionFor(
        { type: PacketType.keepalivePing, seq: undefined, payload: new Uint8Array() },
        spec,
      ),
    ).toEqual({
      _tag: "Reply",
      frames: [{ type: PacketType.keepalivePing, seq: undefined, payload: new Uint8Array() }],
    });
  });

  it("does not send loginChallenge 12000 after clientVersion", () => {
    const action = gameActionFor(
      { type: PacketType.clientVersion, seq: 0, payload: new Uint8Array() },
      spec,
    );
    expect(action).toEqual({ _tag: "Reply", frames: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test` in `apps/backend`

Expected: FAIL (`game-replies.ts` missing).

- [ ] **Step 3: Implement `gameActionFor`**

```ts
export const gameActionFor = (
  frame: TcpFrame,
  spec: { readonly userId: number; readonly token: string; readonly includeBot: boolean },
): GameAction => {
  if (frame.type === PacketType.keepalivePing) {
    return {
      _tag: "Reply",
      frames: [{ type: PacketType.keepalivePing, seq: undefined, payload: new Uint8Array() }],
    };
  }
  if (frame.type === PacketType.gameConnect) {
    try {
      const hello = decodeGameConnect(frame.payload);
      if (hello.userId !== spec.userId || hello.token !== spec.token) return { _tag: "Close" };
      return {
        _tag: "Reply",
        frames: [
          {
            type: PacketType.matchSetup,
            seq: undefined,
            payload: encodeMatchSetup({ includeBot: spec.includeBot }),
          },
        ],
      };
    } catch {
      return { _tag: "Close" };
    }
  }
  return { _tag: "Reply", frames: [] };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp check --fix` then `vp test` in `apps/backend`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/game-replies.ts apps/backend/src/game-replies.test.ts
git commit -m "feat: game-socket replies for 10405 and keepalive"
```

---

### Task 4: `MatchSpec` / ready-line Schema and `game listen` process

**Files:**

- Create: `apps/backend/src/match-spec.ts`
- Create: `apps/backend/src/match-spec.test.ts`
- Create: `apps/backend/src/udp-bind.ts`
- Create: `apps/backend/src/commands/game-listen.ts`
- Modify: `apps/backend/src/cli.ts`
- Modify: `apps/backend/src/cli.test.ts`
- Create: `apps/backend/src/commands/game-listen.test.ts`

**Interfaces:**

- Consumes: `gameActionFor`, `NodeSocketServer.make`, `writeTimedRuleset` (indirect)
- Produces:
  - `class MatchSpec extends Schema.Class` `{ userId, token, levelId, includeBot }`
  - `class GameListenReady extends Schema.Class` `{ host, tcpPort, udpPort }`
  - `GameListenReadyLine = Schema.fromJsonString(GameListenReady)` (same pattern as `CapturedPacketLine`)
  - `bindUdp(host: string): Effect< { port: number }, Error, Scope>`
  - CLI: `backend game listen --user-id --token --level-id --bot`

UDP: wrap `node:dgram` `createSocket("udp4")` in `Effect.callback` + `Effect.addFinalizer(() => socket.close())`. Bind `0` on `127.0.0.1`. Effect has no datagram module — do not use a raw unscoped `bind`.

Ready protocol: **first** stdout line is `Schema.encodeUnknownSync(GameListenReadyLine)(ready)` via `Console.log`. No other stdout before that line. Parent (Task 5) skips non-matching lines until Schema succeeds, 10s timeout.

TCP: `const server = yield* NodeSocketServer.make({ host: "127.0.0.1", port: 0 })` from `@effect/platform-node`. Read `server.address` (`_tag === "TcpAddress"`). Then `server.run` using framing + `gameActionFor`. On `_tag: "Close"`, return from the socket handler so the TCP connection ends.

Do not call `repliesFor`. Do not write session `packets.jsonl` in this command.

- [ ] **Step 1: Write the failing tests**

`match-spec.test.ts`:

```ts
import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import { GameListenReady, GameListenReadyLine, MatchSpec } from "./match-spec.ts";

describe("match spec schemas", () => {
  it("round-trips the ready JSON line", () => {
    const ready = new GameListenReady({ host: "127.0.0.1", tcpPort: 40000, udpPort: 40001 });
    const line = Schema.encodeUnknownSync(GameListenReadyLine)(ready);
    expect(Schema.decodeUnknownSync(GameListenReadyLine)(line)).toEqual(ready);
  });

  it("round-trips MatchSpec", () => {
    const spec = new MatchSpec({ userId: 1, token: "gimped", levelId: 1, includeBot: true });
    expect(Schema.decodeUnknownSync(MatchSpec)(Schema.encodeUnknownSync(MatchSpec)(spec))).toEqual(
      spec,
    );
  });
});
```

`cli.test.ts` — expect names `["listen", "game"]`:

```ts
expect(
  root.subcommands.flatMap((group) => group.commands.map((command) => command.name)).toSorted(),
).toEqual(["game", "listen"]);
```

`game-listen.test.ts` (live Effect — spawn the same way Task 5 will):

```ts
import { NodeServices, NodeSocket } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Effect, Schema, Stream } from "effect";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import { fileURLToPath } from "node:url";
import { GameListenReadyLine } from "../match-spec.ts";

const bin = fileURLToPath(new URL("../bin.ts", import.meta.url));

layer(NodeServices.layer)("game listen", (it) => {
  it.live("prints a ready line and accepts TCP on the reported port", () =>
    Effect.gen(function* () {
      const handle = yield* ChildProcess.make(process.execPath, [
        "--experimental-transform-types",
        bin,
        "game",
        "listen",
        "--user-id",
        "1",
        "--token",
        "gimped",
        "--level-id",
        "1",
      ]);
      const line = yield* handle.stdout.pipe(
        Stream.decodeText(),
        Stream.splitLines,
        Stream.filter((text) => text.length > 0),
        Stream.mapEffect((text) => Schema.decodeUnknownEffect(GameListenReadyLine)(text)),
        Stream.take(1),
        Stream.runHead,
        Effect.flatten,
        Effect.timeout("10 seconds"),
      );
      expect(line.host).toBe("127.0.0.1");
      expect(line.tcpPort).toBeGreaterThan(0);
      expect(line.udpPort).toBeGreaterThan(0);
      const socket = yield* NodeSocket.makeNet({ host: line.host, port: line.tcpPort });
      const write = yield* socket.writer;
      yield* write(new Uint8Array([0]));
      yield* handle.kill();
    }).pipe(Effect.scoped),
  );
});
```

If `Stream.mapEffect` + decode failures drop the stream, instead scan lines with `Effect.orElseSucceed` skip until success. Prefer: `Stream.repeat` / take until decode works:

```ts
Stream.splitLines,
Stream.filter((text) => {
  try {
    Schema.decodeUnknownSync(GameListenReadyLine)(text);
    return true;
  } catch {
    return false;
  }
}),
```

Avoid `JSON.parse`. Use Schema in the filter via `Either` (`Schema.decodeUnknownEither`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test` in `apps/backend`

Expected: FAIL (missing modules / CLI still only `listen`).

- [ ] **Step 3: Implement Schema, UDP bind, CLI**

`match-spec.ts` — `Schema.Class` + `fromJsonString` for the ready line.

`udp-bind.ts` — scoped bind as specified.

`commands/game-listen.ts` — `Command.make("listen", { userId: Flag.integer("user-id"), token: Flag.string("token"), levelId: Flag.integer("level-id"), bot: Flag.boolean("bot").pipe(Flag.withDefault(false)) }, ...)`.

`cli.ts`:

```ts
import { gameListen } from "./commands/game-listen.ts";

const game = Command.make("game").pipe(
  Command.withDescription("Game-server process"),
  Command.withSubcommands([gameListen]),
);

export const root = Command.make("backend").pipe(
  Command.withDescription("Self-hosted Brawlhalla backend stub"),
  Command.withSubcommands([listen, game]),
);
```

Handler outline:

```ts
yield *
  Effect.scoped(
    Effect.gen(function* () {
      const udp = yield* bindUdp("127.0.0.1");
      const server = yield* NodeSocketServer.make({ host: "127.0.0.1", port: 0 });
      if (server.address._tag !== "TcpAddress") {
        return yield* Effect.die("game listen expected TCP address");
      }
      const ready = new GameListenReady({
        host: "127.0.0.1",
        tcpPort: server.address.port,
        udpPort: udp.port,
      });
      yield* Console.log(Schema.encodeUnknownSync(GameListenReadyLine)(ready));
      const spec = { userId: config.userId, token: config.token, includeBot: config.bot };
      yield* server.run((socket) =>
        Effect.scoped(
          Effect.gen(function* () {
            const decoder = new FrameDecoder();
            const write = yield* socket.writer;
            yield* socket.run((chunk) =>
              Effect.gen(function* () {
                for (const frame of decoder.push(chunk)) {
                  const action = gameActionFor(frame, spec);
                  if (action._tag === "Close") return yield* Effect.interrupt;
                  for (const reply of action.frames) yield* write(encodeFrame(reply));
                }
              }),
            );
          }),
        ),
      );
    }),
  );
```

Keep the UDP socket alive for the whole scoped block (do not close after printing ready).

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp check --fix` then `vp test` in `apps/backend`

Expected: PASS, including the live spawn test.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/match-spec.ts apps/backend/src/match-spec.test.ts apps/backend/src/udp-bind.ts apps/backend/src/commands/game-listen.ts apps/backend/src/commands/game-listen.test.ts apps/backend/src/cli.ts apps/backend/src/cli.test.ts
git commit -m "feat: add game listen child that binds TCP and UDP"
```

---

### Task 5: `GameRuntime` child-process layer

**Files:**

- Create: `apps/backend/src/game-runtime.ts`
- Create: `apps/backend/src/game-runtime.test.ts`

**Interfaces:**

- Consumes: `MatchSpec`, `GameListenReadyLine`, `ChildProcess.make`, `packageRoot` from `session.ts`
- Produces:

```ts
export class GameListenTimeout extends Schema.TaggedError<GameListenTimeout>()(
  "GameListenTimeout",
  {
    message: Schema.String,
  },
) {}

export type Allocation = {
  readonly id: string;
  readonly host: string;
  readonly tcpPort: number;
  readonly udpPort: number;
  readonly token: string;
};

export class GameRuntime extends Context.Service<
  GameRuntime,
  {
    readonly allocate: (spec: MatchSpec) => Effect.Effect<Allocation, GameListenTimeout>;
    readonly release: (id: string) => Effect.Effect<void>;
  }
>()("@gimped/backend/GameRuntime") {
  static readonly layerFake: Layer.Layer<GameRuntime>;
  static readonly layerChildProcess: Layer.Layer<
    GameRuntime,
    never,
    ChildProcessSpawner | Path.Path
  >;
}
```

`layerFake.allocate` succeeds immediately with `host: "127.0.0.1"`, `tcpPort: 23011`, `udpPort: 23012`, `token: spec.token`, `id: "fake"`. `release` is `Effect.void`.

`layerChildProcess`:

1. `const mutex = yield* Semaphore.make(1)` (from `effect`). `allocate` starts with `yield* mutex.take(1)`. On any failure after take, `mutex.release(1)`. Child `exitCode` (forked) also `release(1)` and clears the live `Ref`.
2. Spawn: `ChildProcess.make(process.execPath, ["--experimental-transform-types", bin, "game", "listen", "--user-id", String(spec.userId), "--token", spec.token, "--level-id", String(spec.levelId), ...(spec.includeBot ? ["--bot"] : [])], { stdout: "pipe" })`.
3. Provide `Scope.Scope` from the **layer** (`yield* Scope.Scope` inside `Layer.scoped`), not from `ingestChunk`.
4. Read stdout lines until `GameListenReadyLine` decodes; `Effect.timeout("10 seconds")` → `GameListenTimeout`, `handle.kill`.
5. Store `{ id, handle }` in `Ref<Option<Live>>`. `id` from incrementing `Ref<number>`.
6. `release(id)` kills if ids match, then release mutex if still held.

Do not auto-respawn.

- [ ] **Step 1: Write the failing tests**

Fake layer:

```ts
layer(GameRuntime.layerFake)("GameRuntime fake", (it) => {
  it.effect("allocate returns stub ports without spawning", () =>
    Effect.gen(function* () {
      const runtime = yield* GameRuntime;
      const spec = new MatchSpec({ userId: 1, token: "gimped", levelId: 1, includeBot: false });
      const allocated = yield* runtime.allocate(spec);
      expect(allocated.host).toBe("127.0.0.1");
      expect(allocated.tcpPort).toBe(23011);
      expect(allocated.token).toBe("gimped");
    }),
  );
});
```

Child layer (live): `allocate` then `NodeSocket.makeNet` to `tcpPort`, then `release`. Provide `NodeServices.layer` + `GameRuntime.layerChildProcess`. Timeout 15s.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test` in `apps/backend`

Expected: FAIL (`game-runtime.ts` missing).

- [ ] **Step 3: Implement `GameRuntime`**

Follow the spawn/scope/mutex rules above. `bin` path: `path.join(packageRoot, "src", "bin.ts")`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp check --fix` then `vp test` in `apps/backend`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/game-runtime.ts apps/backend/src/game-runtime.test.ts
git commit -m "feat: GameRuntime child-process allocator"
```

---

### Task 6: Backend Play uses `allocate`; drop dual listen

**Files:**

- Modify: `apps/backend/src/replies.ts` (delete `startMatch` branch)
- Modify: `apps/backend/src/replies.test.ts` (delete the **55** → **2466** test)
- Modify: `apps/backend/src/stub.ts`
- Modify: `apps/backend/src/stub.test.ts`
- Modify: `apps/backend/src/commands/listen.ts`
- Modify: `apps/backend/docs/next-step.md`

**Interfaces:**

- Consumes: `GameRuntime.allocate`, `encodeAssignGameServer`, `MatchSpec`, `STUB_USER_ID`, `STUB_GAME_TOKEN`, `STUB_LEVEL_ID`
- Produces: `ingestChunk` yields `GameRuntime` only for **55**; lobby `Ref<{ includeBot: boolean }>` created in `runStub`

Behavior:

- `createCustomRoom` reply path: `Ref.set(flags, { includeBot: false })`
- `addBot` when `repliesFor` returns **2449**: `Ref.set(flags, { includeBot: true })`
- `startMatch`: `allocate(new MatchSpec({ userId: STUB_USER_ID, token: STUB_GAME_TOKEN, levelId: STUB_LEVEL_ID, includeBot: (yield* Ref.get(flags)).includeBot }))`. Success → one **2466** frame from the allocation. `GameListenTimeout` → `Console.log` + `session.note`, no frames.
- `listen`: single `runStub` on `config.host`/`config.port`. Remove `STUB_GAME_TCP_PORT` server. `Effect.provide(GameRuntime.layerChildProcess)` (and existing `NodeSocketServer.layer`).
- `runStub` / `handleSocket` / `ingestChunk` take `flags: Ref<{ includeBot: boolean }>`.

`stub.test.ts` handshake test: `Effect.provide(GameRuntime.layerFake)` so the layer is present even though **55** is not sent.

Add one stub test: ingest a **55** frame with fake layer → reply type `assignGameServer` with tcpPort `23011`.

- [ ] **Step 1: Write/update failing tests**

Remove `replies.test.ts` “assigns a local game server after startMatch 55”.

In `stub.test.ts` provide `GameRuntime.layerFake` on the existing layer call:

```ts
layer(NodeServices.layer.pipe(Layer.provideMerge(GameRuntime.layerFake)))("backend stub", ...)
```

Add `it.effect("allocates a game server on startMatch 55", ...)` that pushes an encoded empty **55** frame and expects `PacketType.assignGameServer` with host `127.0.0.1` and tcpPort `23011`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `vp test` in `apps/backend`

Expected: FAIL (ingest still uses `repliesFor` for **55**, or fake layer unused).

- [ ] **Step 3: Wire stub + listen**

Delete `startMatch` from `repliesFor`.

`ingestChunk` extra args: `flags: Ref<{ includeBot: boolean }>`.

On `PacketType.createCustomRoom`, after recording, `yield* Ref.set(flags, { includeBot: false })` then `repliesFor`.

On `PacketType.addBot`, `const replies = repliesFor(frame); if (replies.some(r => r.type === PacketType.lobbyJoin)) yield* Ref.set(flags, { includeBot: true })`.

On `PacketType.startMatch`:

```ts
const runtime = yield* GameRuntime;
const { includeBot } = yield* Ref.get(flags);
const allocated = yield* runtime.allocate(
  new MatchSpec({
    userId: STUB_USER_ID,
    token: STUB_GAME_TOKEN,
    levelId: STUB_LEVEL_ID,
    includeBot,
  }),
).pipe(
  Effect.catchTag("GameListenTimeout", (error) =>
    Effect.gen(function* () {
      yield* Console.log(`game allocate failed: ${error.message}`);
      yield* session.note(`allocate failed ${error.message}`);
      return undefined;
    }),
  ),
);
if (allocated !== undefined) {
  replies.push({
    type: PacketType.assignGameServer,
    seq: undefined,
    payload: encodeAssignGameServer({
      userId: allocated /* wait: user id is spec, not allocation */,
```

Use **spec** user/level/token plus allocation host/ports:

```ts
payload: encodeAssignGameServer({
  userId: STUB_USER_ID,
  levelId: STUB_LEVEL_ID,
  token: allocated.token,
  host: allocated.host,
  tcpPort: allocated.tcpPort,
  udpPort: allocated.udpPort,
  useNetworkNext: false,
}),
```

`listen.ts`: remove the second `runStub` / `STUB_GAME_TCP_PORT` import. Provide `GameRuntime.layerChildProcess`.

`next-step.md` — replace with: Play should spawn a child, send **2466** with ephemeral ports, then **10310**. Expect in-match shell, not `Error_FAILED_TRANSFER`. Still no real match. Do not queue ranked.

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp check --fix` then `vp test` in `apps/backend`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/replies.ts apps/backend/src/replies.test.ts apps/backend/src/stub.ts apps/backend/src/stub.test.ts apps/backend/src/commands/listen.ts apps/backend/docs/next-step.md
git commit -m "feat: spawn game listen on custom-room Play"
```

---

## Self-review

- Spec allocate/release, child ready line, 10s timeout, one-at-a-time wait, no 2466 on failure, 10405/10310, no login on game socket, 12100 echo, UDP bind without gameplay, fake + live tests, CLI `listen`+`game`, drop 23011, parameterized 2466, later.md items not implemented — each has a task.
- `encodeAssignGameServer` signature is consistent from Task 1 through Task 6.
- Child scope is called out so `ingestChunk` cannot kill the process.
- No TBD. `protocol.md` **10400** correction stays in `later.md`.
