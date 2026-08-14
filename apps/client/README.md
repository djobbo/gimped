# `@gimped/client`

Electron + Foldkit desktop shell around [`@gimped/patch`](../../packages/patch). Repo-run only (no installer). Sidebar: Patch and Settings; SWZ / Replay / ANM are listed as coming soon.

Steam credentials live in Electron `safeStorage` (`steam-credentials.bin` under the app userData directory). The app does **not** read `STEAM_*` or a `.env` file — those remain CLI-only.

## Run

From the repo root (Node `>= 22.18`):

```sh
vp i
vp run --filter @gimped/client start
```

Open **Settings** first and save a non-empty Steam username and password. Then use **Patch** → Fetch.

Java must be on `PATH` when FFDec is not a self-contained exe (same as the CLI). Steam Guard codes are entered on the Patch screen when DepotDownloader prompts; they are not persisted.

| Control | Effect                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------ |
| Fetch   | Run the patch pipeline (`force` from the checkbox)                                                     |
| Force   | Same, with `force: true` (re-run download / FFDec even if a registry exists)                           |
| Cancel  | Leave the run; incomplete `patches/<id>/` is deleted if `registry.json` does not decode                |
| Clear   | Delete `patches/<id>/` for the form manifest, or `index.json` `latestManifestId` if the field is empty |

Cache root, first match: the Cache dir field, `GIMPED_CACHE`, `%LOCALAPPDATA%/gimped` (Windows), otherwise `~/.cache/gimped`. Layout matches [`@gimped/patch`](../../packages/patch).

Progress bars appear only when a tool reports a fraction. Named steps still show as running without a percent.

`version-keys.json` is merged when the app finds `pnpm-workspace.yaml` by walking up from cwd / app path and `packages/swz/src/version-keys.json` exists under that root.

## Check / test

From `apps/client`:

```sh
vp check --fix
vp test
```
