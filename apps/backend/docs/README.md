# @gimped/backend

TCP backend stub for capturing the Brawlhalla login/lobby protocol.

Final goal: a patched client that runs without Steam against a self-hosted backend + game server. This app is the first slice: **listen, decode `class_85` frames, record sessions, tell you what to do next**.

## Run

From the repo (or this worktree) after `vp i`:

```
vp run --filter @gimped/backend start
```

Equivalent:

```
node --experimental-transform-types apps/backend/src/bin.ts listen --host 127.0.0.1 --port 23001
```

### Tailscale / remote client

Pass your Tailscale IP as `--host` (binds on `0.0.0.0`, advertises that IP in launch help + game 2466):

```
node --experimental-transform-types apps/backend/src/bin.ts listen --host 100.x.y.z --port 23001
```

Remote Steam launch options:

```
-h 100.x.y.z -p 23001 -diagnosticlog
```

Sessions write under `apps/backend/captures/<timestamp>/` (gitignored). Packet payloads may include auth tickets — do not commit them.

## First capture (do this now)

1. Leave the stub running.
2. In Steam, set Brawlhalla launch options to:

   `-h 127.0.0.1 -p 23001 -diagnosticlog`

   (`class_42.as` parses `-h` / `-p` / `-diagnosticlog`; `class_139.method_3356` then connects to that host/port instead of `class_50.method_7696`.)

3. Start Brawlhalla and wait at the main menu. **Do not queue or create a custom room yet.**
4. Tell the agent the capture is done (or that it failed). The stub should have printed `protocolHello` then `clientVersion`.

If Steam is wrapping the exe, those same flags can be passed to `Brawlhalla.exe` directly.

## Wireshark

If Wireshark + Npcap are installed, `listen` tries `tshark` on the loopback interface (`tcp port 23001`) and writes `capture.pcapng` into the session folder. Disable with `--tshark false`.

This machine currently has no `tshark` on PATH and no Wireshark install under `C:\Program Files\Wireshark`. The stub's `packets.jsonl` is the primary capture until tshark is installed.

## Layout

| Path               | Role                                       |
| ------------------ | ------------------------------------------ |
| `src/framing.ts`   | `class_85` TCP frames                      |
| `src/bitstream.ts` | `class_30` / `class_279` bit packing       |
| `src/packets.ts`   | `LinkUpdater` type IDs from `class_725.as` |
| `src/stub.ts`      | accept / decode / log                      |
| `docs/protocol.md` | protocol notes from the dumps              |
| `docs/findings.md` | living capture log                         |
