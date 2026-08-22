# Playable Custom Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the current custom-room backend + short-lived `game listen` child from "reaches the in-match shell" to a locally playable custom match with one human player and an optional bot, while keeping queues out of scope.

**Architecture:** Keep the existing backend/game-child split. The backend continues to own login, lobby, and match allocation; the spawned child becomes a minimal authoritative match runtime with explicit phases, protocol translation, a fixed tick loop, and enough state to support move / attack / hit / KO / respawn / match end. Because the exact post-`10310` packet sequence is not fully mapped yet, the first task explicitly captures and documents the next required game packet boundaries before gameplay logic is added.

**Tech Stack:** Effect `4.0.0-rc.109`, `@effect/platform-node`, `effect/unstable/process/ChildProcess`, `effect/unstable/socket`, `@effect/vitest`, Brawlhalla dump source under `brawlhalla-src/dump/scripts`, Vite+ via `vp`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-19-playable-custom-match-design.md`
- Work in `C:\Users\mrxbl\Desktop\gimped\.worktrees\feat-backend-stub` on branch `feat/backend-stub`
- Keep queues, ranked, spectate, Network Next, rollback, remote hosting, and concurrent matches out of scope
- Use Effect-native style (`Effect.gen`, `Effect.fn`, service/layer boundaries where lifecycle or replacement matters)
- Prefer dump source of truth under `brawlhalla-src/dump/scripts`; prefer dump over obf
- Use `vp check --fix` and `vp test` in `apps/backend` after each task
- Preserve the current backend/game-child split; do not move gameplay back into backend `listen`
- Do not commit `captures/`, Steam tickets, or transient protocol traces unless the task explicitly calls for a checked-in doc
- Manual Brawlhalla runs are expected as part of validation; use the real game client rather than inventing packet flows

---

## File Structure

| File                                           | Role                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| `apps/backend/src/commands/game-listen.ts`     | Child bootstrap only; create runtime + protocol loop             |
| `apps/backend/src/game-replies.ts`             | Transitional handshake helper to be slimmed or removed           |
| `apps/backend/src/game-runtime.ts`             | Backend-side child allocator (`allocate` / `release`)            |
| `apps/backend/src/game-child-runtime.ts`       | New authoritative match runtime service for one child process    |
| `apps/backend/src/game-child-model.ts`         | New pure-ish match state model and phase helpers                 |
| `apps/backend/src/game-child-protocol.ts`      | New child-side frame dispatch / reply encoding                   |
| `apps/backend/src/game-child-loop.ts`          | New fixed tick loop and outbound state emission                  |
| `apps/backend/src/game-input.ts`               | New decoders/types for gameplay-relevant inbound packets         |
| `apps/backend/src/game-sync.ts`                | New initial sync packet builders beyond `10310`                  |
| `apps/backend/src/decode.ts`                   | Add decode helpers for newly mapped game packets                 |
| `apps/backend/src/packets.ts`                  | Add names for newly identified packet ids                        |
| `apps/backend/src/stub.ts`                     | Expand `MatchSpec` inputs only if proven necessary               |
| `apps/backend/src/match-spec.ts`               | Extend `MatchSpec` only when child startup truly needs more data |
| `apps/backend/docs/playable-match-protocol.md` | Checked-in packet/state inventory from the first live trace task |
| `apps/backend/docs/next-step.md`               | Manual validation instructions for each milestone                |

Colocate `*.test.ts` next to each source module.

---

### Task 1: Capture and document the post-`10310` packet inventory

**Files:**

- Modify: `apps/backend/src/decode.ts`
- Modify: `apps/backend/src/packets.ts`
- Modify: `apps/backend/src/stub.ts`
- Modify: `apps/backend/src/commands/game-listen.ts`
- Create: `apps/backend/src/game-observe.ts`
- Create: `apps/backend/src/game-observe.test.ts`
- Create: `apps/backend/docs/playable-match-protocol.md`
- Modify: `apps/backend/docs/next-step.md`

**Interfaces:**

- Consumes: current `FrameDecoder`, `decodePayload(type, payload)`, `nameForType(type)`, `Session.note()`
- Produces:
  - `observeGameFrame(frame: TcpFrame): { readonly summary: string; readonly known: boolean }`
  - `recordUnknownGamePacket(args: { readonly dir: "client" | "server"; readonly type: number; readonly payload: Uint8Array }): Effect.Effect<void>`
  - checked-in doc `apps/backend/docs/playable-match-protocol.md` listing the first packet sequence after `10310`, direction, names/ids, and whether each packet is required for active play

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/game-observe.test.ts`:

```ts
import { describe, expect, it } from "@effect/vitest";
import { observeGameFrame } from "./game-observe.ts";
import { PacketType } from "./packets.ts";

describe("game observe", () => {
  it("marks known gameConnect as known with a stable summary", () => {
    const observed = observeGameFrame({
      type: PacketType.gameConnect,
      seq: 1,
      payload: new Uint8Array([0x04, 0x00, 0x19, 0x9d, 0xa5, 0xb5, 0xc1, 0x95, 0x90]),
    });
    expect(observed.known).toBe(true);
    expect(observed.summary).toContain("gameConnect");
  });

  it("marks unmapped ids as unknown", () => {
    const observed = observeGameFrame({
      type: 9999,
      seq: undefined,
      payload: Uint8Array.from([1, 2, 3]),
    });
    expect(observed.known).toBe(false);
    expect(observed.summary).toContain("type_9999");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/game-observe.test.ts`

Expected: FAIL because `game-observe.ts` does not exist.

- [ ] **Step 3: Implement minimal observability**

Create `apps/backend/src/game-observe.ts`:

```ts
import { decodePayload } from "./decode.ts";
import type { TcpFrame } from "./framing.ts";
import { nameForType } from "./packets.ts";

export const observeGameFrame = (
  frame: TcpFrame,
): {
  readonly summary: string;
  readonly known: boolean;
} => {
  const decoded = decodePayload(frame.type, frame.payload);
  const known = decoded._tag !== "Unknown";
  const size = `${frame.payload.length} bytes`;
  const summary = `${nameForType(frame.type)} seq=${frame.seq ?? "-"} ${known ? decoded._tag : size}`;
  return { summary, known };
};
```

In `commands/game-listen.ts`, log both inbound and outbound game frames through `observeGameFrame()`. In `stub.ts`, when `startMatch` allocates a child, note the allocation id/ports in the session log so manual traces are tied to a specific game child.

Add names in `packets.ts` only for packet ids confirmed during the trace session; do not invent ids. Extend `decode.ts` only when a packet’s basic field shape is understood enough to beat `Unknown`.

- [ ] **Step 4: Produce the checked-in protocol inventory**

Manual steps:

1. Run backend `listen`
2. Launch Brawlhalla
3. Create a custom room, optionally add a bot, click Play
4. Stay in the match path long enough to capture the first post-`10310` packets
5. Record the ordered list in `apps/backend/docs/playable-match-protocol.md`

The doc must include, for each observed packet:

- direction (`client -> child` or `child -> client`)
- packet id
- current name or `unknown`
- whether the packet appears required to move into active play
- whether a decoder exists

- [ ] **Step 5: Run tests to verify they pass**

Run: `vp check --fix` then `vp test`

Expected: PASS, plus a checked-in `playable-match-protocol.md` with at least the first post-`10310` sequence documented.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/game-observe.ts apps/backend/src/game-observe.test.ts apps/backend/src/decode.ts apps/backend/src/packets.ts apps/backend/src/stub.ts apps/backend/src/commands/game-listen.ts apps/backend/docs/playable-match-protocol.md apps/backend/docs/next-step.md
git commit -m "docs: map post-10310 custom-match packet flow"
```

---

### Task 2: Split the child into runtime, protocol, and loop boundaries

**Files:**

- Create: `apps/backend/src/game-child-model.ts`
- Create: `apps/backend/src/game-child-model.test.ts`
- Create: `apps/backend/src/game-child-runtime.ts`
- Create: `apps/backend/src/game-child-runtime.test.ts`
- Create: `apps/backend/src/game-child-protocol.ts`
- Create: `apps/backend/src/game-child-protocol.test.ts`
- Create: `apps/backend/src/game-child-loop.ts`
- Modify: `apps/backend/src/commands/game-listen.ts`
- Modify: `apps/backend/src/game-replies.ts`

**Interfaces:**

- Consumes: `MatchSpec`, `PacketType`, `TcpFrame`, `encodeFrame`, Task 1 packet inventory
- Produces:
  - `GameChildPhase = "waitingForConnect" | "syncingIntoMatch" | "activeMatch" | "matchOver"`
  - `GameChildState` with `phase`, `includeBot`, `connected`, `tick`, `stocks`, and minimal per-entity state
  - `GameChildRuntime` service with:
    - `connect(): Effect.Effect<void>`
    - `ingest(frame: TcpFrame): Effect.Effect<ReadonlyArray<TcpFrame>>`
    - `tick(): Effect.Effect<ReadonlyArray<TcpFrame>>`
    - `disconnect(): Effect.Effect<void>`

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/game-child-runtime.test.ts`:

```ts
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { GameChildRuntime } from "./game-child-runtime.ts";

describe("game child runtime", () => {
  it.effect("starts in waitingForConnect and moves to syncingIntoMatch on connect", () =>
    Effect.gen(function* () {
      const runtime = yield* GameChildRuntime.make({ includeBot: false });
      expect(yield* runtime.phase).toBe("waitingForConnect");
      yield* runtime.connect();
      expect(yield* runtime.phase).toBe("syncingIntoMatch");
    }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/game-child-runtime.test.ts`

Expected: FAIL because the runtime module does not exist.

- [ ] **Step 3: Implement minimal runtime boundaries**

`apps/backend/src/game-child-model.ts`:

```ts
export type GameChildPhase = "waitingForConnect" | "syncingIntoMatch" | "activeMatch" | "matchOver";

export type EntityState = {
  readonly entityId: number;
  readonly userId: number;
  readonly stocks: number;
  readonly damage: number;
};

export type GameChildState = {
  readonly phase: GameChildPhase;
  readonly includeBot: boolean;
  readonly connected: boolean;
  readonly tick: number;
  readonly entities: ReadonlyArray<EntityState>;
};
```

`apps/backend/src/game-child-runtime.ts` should create a `Ref<GameChildState>` and implement the four methods above. `connect()` only advances phase; `tick()` only increments `tick`; `ingest()` delegates protocol decisions but keeps phase ownership in the runtime.

In `commands/game-listen.ts`, replace direct `gameActionFor()` usage with construction of one `GameChildRuntime`, one `GameChildProtocol`, and one forked `GameChildLoop`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp check --fix` then `vp test`

Expected: PASS with child behavior unchanged from the current shell milestone.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/game-child-model.ts apps/backend/src/game-child-model.test.ts apps/backend/src/game-child-runtime.ts apps/backend/src/game-child-runtime.test.ts apps/backend/src/game-child-protocol.ts apps/backend/src/game-child-protocol.test.ts apps/backend/src/game-child-loop.ts apps/backend/src/commands/game-listen.ts apps/backend/src/game-replies.ts
git commit -m "refactor: split child match runtime boundaries"
```

---

### Task 3: Implement the required sync packets to enter active match

**Files:**

- Create: `apps/backend/src/game-sync.ts`
- Create: `apps/backend/src/game-sync.test.ts`
- Modify: `apps/backend/src/game-child-protocol.ts`
- Modify: `apps/backend/src/decode.ts`
- Modify: `apps/backend/src/packets.ts`
- Modify: `apps/backend/docs/playable-match-protocol.md`

**Interfaces:**

- Consumes: Task 1 packet inventory, `encodeMatchSetup()`, `GameChildRuntime`
- Produces:
  - `buildInitialSync(state: GameChildState): ReadonlyArray<TcpFrame>`
  - decoders/names for the first required post-`10310` packet ids
  - protocol transition from `"syncingIntoMatch"` to `"activeMatch"`

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/game-sync.test.ts` with one test per packet sequence identified in Task 1. For example, if Task 1 proves the child must emit two packets after `10310`, encode that exact sequence:

```ts
import { describe, expect, it } from "@effect/vitest";
import { buildInitialSync } from "./game-sync.ts";

describe("game sync", () => {
  it("emits the exact required post-10310 sync sequence", () => {
    const frames = buildInitialSync({
      phase: "syncingIntoMatch",
      includeBot: false,
      connected: true,
      tick: 0,
      entities: [],
    });
    expect(frames.map((frame) => frame.type)).toEqual([/* exact packet ids from Task 1 */]);
  });
});
```

Replace the array literal with the exact ids captured in Task 1 before implementation.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/game-sync.test.ts`

Expected: FAIL because `game-sync.ts` does not exist or the sequence is incomplete.

- [ ] **Step 3: Implement the sync builder and protocol transition**

`buildInitialSync()` should emit:

- the existing `matchSetup` frame
- every additional child-to-client sync packet proven required by Task 1, in the captured order

In `game-child-protocol.ts`, when the runtime is in `"syncingIntoMatch"`, use `buildInitialSync()` and advance to `"activeMatch"` only after the required sync sequence is sent.

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp check --fix` then `vp test`

Expected: PASS, and a manual Brawlhalla run should move beyond shell-only state toward actual player control.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/game-sync.ts apps/backend/src/game-sync.test.ts apps/backend/src/game-child-protocol.ts apps/backend/src/decode.ts apps/backend/src/packets.ts apps/backend/docs/playable-match-protocol.md
git commit -m "feat: sync child into active custom match"
```

---

### Task 4: Decode gameplay-relevant client inputs and drive a fixed tick

**Files:**

- Create: `apps/backend/src/game-input.ts`
- Create: `apps/backend/src/game-input.test.ts`
- Modify: `apps/backend/src/game-child-protocol.ts`
- Modify: `apps/backend/src/game-child-runtime.ts`
- Modify: `apps/backend/src/game-child-loop.ts`
- Modify: `apps/backend/src/decode.ts`
- Modify: `apps/backend/src/packets.ts`

**Interfaces:**

- Consumes: Task 1 packet inventory, `GameChildState`, `GameChildRuntime`
- Produces:
  - `decodeGameInput(type: number, payload: Uint8Array): GameInput | undefined`
  - `GameInput = Move | Attack | Jump | Dodge | UnknownInput`
  - runtime method `applyInput(input: GameInput): Effect.Effect<void>`
  - loop cadence `runGameLoop(runtime): Effect.Effect<never>`

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/game-input.test.ts` with one fixture-backed test per first required inbound gameplay packet captured in Task 1. Each test should assert that the payload decodes into a stable tagged input type instead of `undefined`.

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/game-input.test.ts`

Expected: FAIL because gameplay input decoding does not exist yet.

- [ ] **Step 3: Implement minimal input support**

Implement `decodeGameInput()` only for the first inbound packet types needed to produce obvious local play. For each supported input:

- give it a tagged shape
- preserve any raw fields that are not yet understood
- route it through `game-child-protocol.ts` into `runtime.applyInput()`

In `game-child-loop.ts`, fork a fixed-rate loop that calls `runtime.tick()` and writes any returned frames. Keep the first cadence simple and explicit, for example:

```ts
yield *
  Effect.forever(
    runtime.tick().pipe(
      Effect.flatMap((frames) => Effect.forEach(frames, (frame) => write(encodeFrame(frame)))),
      Effect.zipRight(Effect.sleep("16 millis")),
    ),
  );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp check --fix` then `vp test`

Expected: PASS, and manual play should show at least one obvious control loop (move and/or attack) instead of a static shell.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/game-input.ts apps/backend/src/game-input.test.ts apps/backend/src/game-child-protocol.ts apps/backend/src/game-child-runtime.ts apps/backend/src/game-child-loop.ts apps/backend/src/decode.ts apps/backend/src/packets.ts
git commit -m "feat: decode local gameplay inputs"
```

---

### Task 5: Add minimal authoritative match state, KO/respawn, and match end

**Files:**

- Modify: `apps/backend/src/game-child-model.ts`
- Modify: `apps/backend/src/game-child-model.test.ts`
- Modify: `apps/backend/src/game-child-runtime.ts`
- Modify: `apps/backend/src/game-child-runtime.test.ts`
- Modify: `apps/backend/src/game-child-loop.ts`
- Modify: `apps/backend/src/game-sync.ts`
- Modify: `apps/backend/docs/next-step.md`

**Interfaces:**

- Consumes: `GameInput`, `GameChildState`, active-match loop from Task 4
- Produces:
  - entity damage/stocks updates
  - KO -> respawn transition
  - `phase: "matchOver"` transition and final outbound packet sequence

- [ ] **Step 1: Write the failing tests**

Add runtime/model tests that assert:

- an entity with 1 stock and lethal damage transitions to KO then `matchOver`
- an entity with more than 1 stock loses a stock and respawns
- the bot path uses the same stock rules

Example test:

```ts
it.effect("drops to matchOver when the final stock is lost", () =>
  Effect.gen(function* () {
    const runtime = yield* GameChildRuntime.make({ includeBot: false });
    yield* runtime.forceState({
      phase: "activeMatch",
      includeBot: false,
      connected: true,
      tick: 10,
      entities: [{ entityId: 1, userId: 1, stocks: 1, damage: 999 }],
    });
    yield* runtime.tick();
    expect(yield* runtime.phase).toBe("matchOver");
  }),
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vp test src/game-child-runtime.test.ts src/game-child-model.test.ts`

Expected: FAIL because KO/respawn/match-over logic is not implemented.

- [ ] **Step 3: Implement minimal authoritative rules**

In `game-child-runtime.ts`, add:

- damage accumulation
- stock decrement on KO
- respawn reset when stocks remain
- match-over when no stocks remain for the player side

Only model as much entity state as the client needs to reflect these transitions. Keep the first rule-set minimal and deterministic.

- [ ] **Step 4: Run tests to verify they pass**

Run: `vp check --fix` then `vp test`

Expected: PASS, and manual play should allow a complete match lifecycle from start to finish.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/game-child-model.ts apps/backend/src/game-child-model.test.ts apps/backend/src/game-child-runtime.ts apps/backend/src/game-child-runtime.test.ts apps/backend/src/game-child-loop.ts apps/backend/src/game-sync.ts apps/backend/docs/next-step.md
git commit -m "feat: add custom-match KO and match end flow"
```

---

## Self-Review

- **Spec coverage:** this plan covers discovery of the remaining protocol, child-side runtime decomposition, entry into active match, gameplay input handling, fixed tick simulation, and match end. Queues and rollback remain explicitly out of scope.
- **Placeholder scan:** the only variable content is the exact post-`10310` and gameplay packet ids, which are made an explicit deliverable of Task 1 rather than left implicit.
- **Type consistency:** later tasks consume `GameChildRuntime`, `GameChildState`, `GameInput`, and `buildInitialSync()` exactly as defined earlier in the plan.
