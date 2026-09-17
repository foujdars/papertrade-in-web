# Live chart regression

Run from the repository root with Playwright and its Chromium browser installed:

```sh
node tests/browser/live-chart.cjs
```

The test uses esbuild from the project dependencies. `PLAYWRIGHT_MODULE_PATH` can point to an existing Playwright installation instead of a local dependency. `CHART_TEST_SCREENSHOT` optionally names a screenshot output file.

It runs the actual MarketChart and chart library with a fake clock and controlled broker responses on localhost:3224. It checks price-axis dragging, panning while ticks arrive, delayed candle reconciliation, stalled-stream quote recovery, stale-trade rejection, recovery after request errors, historical viewport retention, new-bar following, and explicit Reset. Broker data is mocked; it does not require credentials or place orders.

## Alerts

`node tests/browser/alerts.cjs` uses the same Playwright setup on localhost:3225. It covers List/Log, search, creating alerts, cancellation, triggered history, persisted chart price lines, symbol isolation, hiding annotations, scale adjustment, light/dark themes, keyboard controls, responsive footer alignment, and paper-order quantity validation/fills. Set `ALERT_SCREENSHOTS=1` to save screenshots under `outputs/`.
