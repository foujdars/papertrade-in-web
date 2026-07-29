import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the PaperTrade IN terminal", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /PaperTrade IN/);
  assert.match(html, /Interactive candlestick chart/);
  assert.match(html, /EMA 5/);
  assert.match(html, /EMA 21/);
  assert.match(html, /RSI 14/);
  assert.match(html, /Broker API/);
  assert.match(html, /No real money/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("ships project assets and removes the starter preview", async () => {
  const [page, dashboard, chart, readme] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/TradingDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/MarketChart.tsx", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<TradingDashboard \/>/);
  assert.match(dashboard, /papertrade-orders/);
  assert.match(dashboard, /Fibonacci/);
  assert.match(chart, /CandlestickSeries/);
  assert.match(readme, /Lightweight Charts/);
  await access(new URL("../public/papertrade-social.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});
