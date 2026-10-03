import { readFile, writeFile, mkdir } from "node:fs/promises";
import { buildDailyResearch } from "../lib/research.ts";
const input = JSON.parse(await readFile(new URL("../.research-input.json", import.meta.url), "utf8"));
const result = buildDailyResearch(input.inputs, input.index, input.vix, input.now, input.requested, input.errors);
if (!result.scanned) throw new Error("No usable price histories; preserving the previous published scan.");
await mkdir(new URL("../public/research/", import.meta.url), { recursive: true });
await writeFile(new URL("../public/research/daily.json", import.meta.url), JSON.stringify(result, null, 2) + "\n");
console.log(`Published ${result.scanned}/${result.requested} ranked stocks; partial=${result.partial}`);
