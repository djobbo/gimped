# Next step

Play in a custom room sends empty packet **55**. The stub now answers with **2466**, pointing the client at a local game-server TCP port (`127.0.0.1:23011`) plus UDP `23012`.

**Right now:** create a custom room again (or stay in the current one if play is still clickable) and click **Play**. Do not expect a real match.

Tell the agent whether you see:

- a connecting / transferring overlay,
- `Error_FAILED_TRANSFER` or a similar popup,
- still no feedback,
- or a crash / drop to offline

The next slice is the game-server handshake (`10400` then match setup **10310**), not ranked or Steam-off.
