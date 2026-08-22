import fs from "node:fs";
import path from "node:path";

const dump = path.resolve("C:/Users/mrxbl/Desktop/gimped/brawlhalla-src/dump/scripts/class_725.as");
const src = fs.readFileSync(dump, "utf8");
let id = 15;
const byId = new Map();
for (const line of src.split(/\n/)) {
  const match = line.match(
    /LinkUpdater\.(var_\d+|PKTTYPE_[A-Z0-9_]+)\s*=\s*LinkUpdater\.var_7032\s*=\s*(?:uint\(LinkUpdater\.var_7032 \+ 1\)|(\d+))/,
  );
  if (match === null) continue;
  id = match[2] !== undefined ? Number(match[2]) : id + 1;
  if (!byId.has(id)) byId.set(id, match[1]);
}

const entries = [...byId.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([n, name]) => `  ${n}: "${name}"`)
  .join(",\n");

const out = `/** Generated from class_725.as LinkUpdater.var_7032 assignments. */
export const dumpNameByType = {
${entries},
} as const;
`;

const dest = path.resolve("apps/backend/src/dump-names.ts");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log(`wrote ${byId.size} names to ${dest}`);
