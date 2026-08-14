---
name: browsing-brawlhalla-source-code
description: Use when reading, searching, or citing Brawlhalla client source, ActionScript 3 (AS3) dumps, obfuscated identifiers, brawlhalla-src, dump vs obf, or matching game behavior to codecs/CLIs in this repo.
---

# Browsing Brawlhalla source code

Obfuscated source code can be available under `brawlhalla-src`. It is AS3 (ActionScript 3).

Subfolder `dump` has variable names transformed to alphanumeric, while `obf` has haxed variable names. Prefer alphanumeric to use less tokens.

| Tree                  | Identifiers                                          | When                                                    |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| `brawlhalla-src/dump` | alphanumeric (`class_42`, `var_7467`, `method_2882`) | Default. Search and read here.                          |
| `brawlhalla-src/obf`  | haxed (`§_-R35§`, `_-42u`)                           | Only to match ABC/p-code or docs that cite haxed names. |

AS3 lives under `dump/scripts/` and `obf/scripts/`. Some files keep readable names in both trees (`ANE_*`, `flash/`, `haxe/`).

`brawlhalla-src/` is gitignored and may be missing. Workspace glob/grep often skip it — search with Shell (`rg --no-ignore`). If the tree is absent, say so; do not invent AS3.

## Search

1. Restrict to `brawlhalla-src/dump` first.
2. Grep for symbols; do not read whole `.as` files (many are thousands of lines).
3. Open `obf` only when dump is not enough for a haxed name.
