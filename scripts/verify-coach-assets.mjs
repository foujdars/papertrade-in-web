import { readdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import path from "node:path";

async function cssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? cssFiles(path.join(directory, entry.name))
    : entry.name.endsWith(".css") ? [path.join(directory, entry.name)] : []));
  return nested.flat();
}
const files = await cssFiles(".next/static");
const css = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
for (const selector of [".coach-modal", ".coach-tabs", ".coach-header", ".coach-content", ".coach-trade-heading", ".coach-insight-cards", ".coach-candle-canvas", ".coach-limit-grid", ".coach-payoff", ".coach-launch-button", ".ticket-risk-sizing", ".ticket-risk-grid", ".plan-picker", ".plan-confidence"]) {
  assert.ok(css.includes(selector), `Production stylesheet is missing ${selector}`);
}
console.log("Production toolkit CSS verified.");
for (const selector of [".bar-replay", ".bar-replay-dialog", ".bar-replay-chart", ".bar-replay-playback", ".bar-replay-orders", ".chart-replay-link", ".header-coach-button"]) {
  assert.ok(css.includes(selector), `Production stylesheet is missing ${selector}`);
}
