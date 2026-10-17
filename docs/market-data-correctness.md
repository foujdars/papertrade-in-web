# Market data correctness and freshness

## AKIKO incident: 16 October 2026 at 09:34 IST

The user reported approximately +17% in Papertrade movers against approximately +9% in Groww. Akiko Global Services is NSE symbol AKIKO, SME series SM, instrument key `NSE_EQ|INE0PMR01017`. Its identity is independently recorded in the [NSE filing](https://nsearchives.nseindia.com/corporate/ixbrl/INTEGRATED_FILING_NONINDAS_159461_20052026213052_iXBRL_WEB.html) and was checked against the live Upstox NSE instrument directory on 17 October.

The deployed app's broker-backed historical API returned these observations:

| Observation | Price | Change from previous close |
| --- | ---: | ---: |
| 15 October daily close | 415.50 | — |
| 16 October 09:17 trade | 490.00 | +17.9302% |
| 16 October 09:20 trade, carried through the zero-volume 09:34 candle | 455.00 | +9.5066% |
| 16 October 09:35 trade | 438.95 | +5.6438% |

This closely matches an older opening-price snapshot being displayed after the price moved. That is an inference: the original scanner response at 09:34 was not retained, and Groww's historical screen was not recovered. The historical prices and URLs are preserved in `tests/fixtures/akiko-2026-10-16.json`. The regression test reconstructs an outdated opening scanner quote and checks replacement by the broker quote, exact SME instrument mapping and agreement between movers/search. It does not label a reconstructed scanner payload as an original capture.

## Fixes

- Upstox LTPC `cp` now survives decoding into the dashboard. Daily percentage uses the provider's previous close rather than an old catalogue or prior-session baseline. The [stream contract](https://upstox.com/developer/api-documentation/v3/get-market-data-feed/) and [full quote contract](https://upstox.com/developer/api-documentation/get-full-market-quote/) define previous close, absolute `net_change` and provider timestamps.
- REST normalization handles missing/invalid values and timestamps without inventing a new exchange timestamp. A later provider observation can repair the daily baseline while retaining a newer streamed trade price. Previous-session snapshots cannot overwrite current-session comparisons.
- Quote freshness checks both provider observation and receipt. Watchlists, chart/F&O headers and preview/search rows show an unavailable daily change as a dash. A stale quote receipt cannot become a fresh executable quote merely because it was downloaded again.
- NSE movers and NSE search share a server implementation/cache contract. Scanner candidates are resolved to exact NSE equity keys, including SME series, then verified with one bounded broker batch. Percentages use matching last price and previous close; rankings and category filters are applied again afterward. Summary includes the advertised 52-week-high row.
- Search no longer adds a public CDN cache over the server cache. Visible quotes refresh every five seconds; movers/search poll every fifteen seconds and refresh on resume/reconnect. The native app-state bridge triggers the same bounded polling lifecycle after returning to the app.
- Snapshot metadata distinguishes checked time from quote time. Scanner fallback stays explicitly delayed; old/missing broker timestamps also remain delayed. Failed requests retain a bounded last successful snapshot without renewing its time. Older overlapping summary/full-list requests cannot overwrite newer quotes or clear newer failure state.
- All clients share these server and quote helpers: desktop, mobile web and the native shell.

## Operational limits

NSE candidate discovery still begins with the scanner's top 40 candidates per category (80 for circuit-band candidates). Verified ranking is within that candidate pool, not a guarantee of a complete exchange-wide real-time ranking. A valid production Upstox token and a usable NSE instrument directory are required for verification. On failure the UI discloses delayed/unavailable data instead of presenting it as live. US/crypto search boards still use the scanner and are labeled delayed. Prices can differ across exchanges, timestamps and provider conditions.

The server bounds scanner requests to 4.5 seconds and total broker verification to 5.5 seconds, within the client's twelve-second timeout. Cache durations are ten seconds in-session and sixty seconds when closed; failed snapshots expire after ten minutes. Browser storage and polling do not override upstream rate-limit backoff.

## Validation

`npm run test:market-data` covers arithmetic, AKIKO SME mapping, source freshness, delayed/failure behavior, request ordering, previous-close rollover, REST/stream reconciliation, native resume and polling recovery. The browser test `tests/browser/market-data-freshness.cjs` exercises actual MarketMovers and HomeWorkspace rendering, polling, stale retention, resume, unknown daily-change display and responsive layouts. Browser responses are controlled fixtures; the historical AKIKO audit is a separate read-only production API check.
