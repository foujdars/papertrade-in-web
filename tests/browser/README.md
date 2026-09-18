# Live chart regression

Run from the repository root with Playwright and its Chromium browser installed:

```sh
node tests/browser/live-chart.cjs
```

The test uses esbuild from the project dependencies. `PLAYWRIGHT_MODULE_PATH` can point to an existing Playwright installation instead of a local dependency. `CHART_TEST_SCREENSHOT` optionally names a screenshot output file.

It runs the actual MarketChart and chart library with a fake clock and controlled broker responses on localhost:3224. It checks price-axis dragging, panning while ticks arrive, delayed candle reconciliation, stalled-stream quote recovery, stale-trade rejection, recovery after request errors, historical viewport retention, new-bar following, and explicit Reset. Broker data is mocked; it does not require credentials or place orders.

## Alerts

`node tests/browser/alerts.cjs` uses the same Playwright setup on localhost:3225. It covers List/Log, search, creating alerts, cancellation, triggered history, persisted chart price lines, symbol isolation, hiding annotations, scale adjustment, light/dark themes, keyboard controls, responsive footer alignment, and paper-order quantity validation/fills. Set `ALERT_SCREENSHOTS=1` to save screenshots under `outputs/`.

## P&L analytics

`node tests/browser/pnl.cjs` runs the real analytics components on localhost:3226 with deterministic completed exits. It checks exact totals, intersecting date/market/product filters, calendar day selection, breakeven and empty states, keyboard chart inspection, chart-to-trade drill-down, invalid date ranges, and light/dark layouts at 320, 390, 768 and 1280px. Set `PNL_SCREENSHOTS=1` to save full-page screenshots under `outputs/`. No account or trade records are modified.

With `npx next dev -p 3220` running, `node --experimental-strip-types tests/browser/pnl-dashboard.cjs` checks the complete dashboard integration: totals from actual order accounting, trade review navigation, clearing chart/day selections, the Trading Coach link, responsive containment and unchanged order storage. Broker responses are mocked. `PNL_APP_URL` can override the local server URL.
