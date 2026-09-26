# Live chart regression

## PSBB Trading watchlist

`npm run test:psbb` checks divergence/MSS, swing-extreme stops, fixed 1R outcomes, full monthly ledgers, calendar boundaries, category membership and the history endpoint with mocked upstream data.

`node tests/browser/psbb.cjs` checks chart entry/stop/target placement on all six chart intervals. `node tests/browser/trading-watchlist.cjs` checks the real watchlist component at mobile width: five categories, five intraday frames, status filters, monthly totals, search, refresh, errors and chart links. Optional screenshot variables: `PSBB_SCREENSHOT`, `WATCHLIST_SCREENSHOT`.

With a production server at localhost:3228 (`TEST_BASE_URL` overrides it), `node tests/browser/trading-watchlist-dashboard.cjs` checks second-place placement in the full app, scrolling and opening Sensex at the chosen timeframe/setup date. All broker responses in these browser tests are mocked; they do not place orders or change cloud data.

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
