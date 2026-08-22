# Next step

## Milestone: full custom-match lifecycle (Task 5)

The backend stub now carries a minimal authoritative match lifecycle: active play ticks, deterministic KO checks at lethal damage, stock loss with respawn when stocks remain, and a final `matchOver` transition when the player loses the last stock.

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
4. Confirm the client reaches active play, then force a few obvious combat outcomes:
   - damage climbs until a KO occurs,
   - with stocks remaining, the KO'd entity respawns at a reset position with one fewer stock,
   - with the final player stock lost, the child transitions to `matchOver` and the match drops cleanly.
5. If a bot is present, verify it follows the same stock-loss and respawn rules as the player.

### What to report

Tell the agent whether you see:

- active control after loading,
- player KO -> respawn while stocks remain,
- final-stock loss ending the match,
- bot KO following the same stock rules,
- or a crash / stuck state / premature offline drop.
