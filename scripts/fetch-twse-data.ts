import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const outputPath = join(projectRoot, "public", "data", "tw-stock-summary.json");

const snapshot = {
  generatedAt: new Date().toISOString(),
  source: "TODO: replace with TWSE/TPEX data source",
  indices: [
    {
      name: "TAIEX",
      value: 0,
      change: 0,
      changePercent: 0,
    },
  ],
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

console.log(`Wrote ${outputPath}`);
