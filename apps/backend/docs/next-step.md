# Next step

## Milestone: post-10310 packet inventory (Task 1)

Play in a custom room spawns a short-lived `game listen` child, then answers **55** with **2466** using that child's ephemeral TCP/UDP ports. The child answers **10405** with match-setup **10310** and now logs every game frame via `observeGameFrame()`.

See `apps/backend/docs/playable-match-protocol.md` for the dump-inferred post-10310 inventory. A live trace is still needed to confirm order and payload shapes before Task 2 sync implementation.

### Manual validation

1. From `apps/backend`, start the backend stub:
   ```bash
   vp run start
   ```
2. Launch Brawlhalla (Steam app 291550). Steam launch options:
   ```
   -h 127.0.0.1 -p 23001 -diagnosticlog
   ```
   Or: `Start-Process "steam://launch/291550"` after setting those launch options in Steam.
3. Log in, create a **custom room**, optionally **add bot**, click **Play**.
4. Watch the terminal for:
   - `game allocate id=… tcp=127.0.0.1:… udp=…` in session notes
   - child `game inbound` / `game outbound` lines after **10310**
   - `game unknown …` lines for unmapped ids
5. Session artifacts land under `apps/backend/captures/<timestamp>/` (`packets.jsonl`, `notes.txt`). Do not commit `captures/`.

### What to report

Tell the agent whether you see:

- the in-match character-select / loading shell,
- `Error_NEVER_RECEIVED_GAMESERVER_READY` or `Error_FAILED_TRANSFER`,
- post-10310 `game inbound` packet ids (copy the ordered list),
- still no feedback,
- or a crash / drop to offline

Do not queue ranked.
