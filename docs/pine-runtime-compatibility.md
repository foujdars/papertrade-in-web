# Pine runtime compatibility

Shared desktop/mobile/native runtime: **PineTS 0.11.1**, pinned in the lockfile, with version-specific application compatibility corrections. Status below describes this application adapter and its tests, not all upstream PineTS claims. No complete TradingView language, compiler, broker or cloud parity is claimed.

**Verified** means a checked-in fixture exercises the stated case. **Implemented / approximate** means an adapter/rendering path exists with the listed limitations. **Unavailable** means the product rejects it or supplies no corresponding service.

| Area | Status | Evidence and limits |
| --- | --- | --- |
| Native v5/v6 indicator execution | Verified cases | Version annotation required. SMA/EMA/Wilder RSI fixtures and causal prefixes; broader upstream language support remains experimental. |
| Functions, loops, persistent arrays, tuple TA | Verified cases | Actual PineTS executes representative scripts; this is no longer the legacy expression-only interpreter. Infinite loops and oversized allocations produce errors. |
| Other arrays, maps, matrices, user types | Implemented through upstream runtime | No exhaustive namespace/overload conformance fixture. Unsupported runtime behavior must remain a diagnostic, not a fabricated result. |
| Native input metadata and overrides | Verified cases | Numeric bounds, bool/color validation, option lists and metadata/variable/title override keys. Rich widgets depend on upstream metadata; invalid keys/values fail. |
| Strategy market orders | Verified cases | Subsequent-open market entries/closes, long-to-short reversal, closed-trade accounting, percent fees and tick slippage. |
| Strategy stop/limit/bracket orders | Verified representative fixture | Actual PineTS broker produces fills, not log-only stubs. Intrabar OHLC path, liquidity and cost assumptions can differ from TradingView and markets. |
| Equity and strategy tester | Implemented / approximate | Equity sampled from the real PineTS strategy state. Closed-trade net profit and open-equity P/L are distinct. No live execution, exchange reconciliation or tick-level certification. |
| Plot/hline output and pane placement | Verified cases | Line/histogram/columns/point outputs, per-bar colors and horizontal levels coexist with built-in studies; overlay or a separate pane. Width is clamped to 1–4. |
| Plot visual semantics | Verified core geometry | Area baseline fills, stepped lines, line-break gaps, circle/cross/diamond points, histogram bases and price tracking. Plot offset/calendar behavior depends on loaded chart data. Complex visual details remain independent approximations. |
| `fill`, `bgcolor` | Verified core geometry | Per-bar colors, coordinate mapping, source offsets, missing-value gaps, gradient interpolation and `fillgaps` bridging. Pixel-perfect TradingView rendering is not certified. |
| Line, box, label, table objects | Verified core geometry | Actual serialized PineTS handles normalize to canvas objects; deleted objects are omitted, table row-major cells are transposed, visible price geometry can expand scale. Exact label pointers, text fonts and all alignment/formatting options are approximate. |
| `plotshape`, `plotchar`, `plotarrow` | Verified core geometry | Above/below-bar anchoring and arrow/shape/text paths tested. Exact proportional arrow scaling and every glyph style are not certified. |
| `linefill`, polyline | Verified core geometry | Nested line endpoints, closed fills and curved canvas paths tested. Curve interpolation is host-side approximation. |
| `plotbar`, `plotcandle`, `barcolor` | Verified core geometry | OHLC arrays, wick/border/body colors and timestamp color extraction tested. Main chart style transformations can differ from raw script OHLC rendering. |
| Visual lifecycle and pane scale | Verified | Snapshot replacement, missing-value gaps, clipping, deleted objects, table/object bounds, clear and detach behavior. Per-output `force_overlay` routes supported plots/drawings to the price pane while remaining outputs stay in the script pane. Visual-only pane scales exclude transparent anchors; crosshair and drawing interactions use the series in the correct pane. |
| `request.security` | Verified constrained cases | Same-timeframe values and completed higher-timeframe buckets with supplied data. Exact connected NSE/BSE/Delta symbols and supported indices can be resolved, retaining exchange identity and symbol metadata. Other exchanges remain unavailable. |
| Other timeframes during replay | Unavailable | Host refuses additional timeframe requests. Same-chart data already supplied to the runtime remains bounded by the revealed replay history. |
| `lookahead_on` | Verified constrained cases | Accepted for historical-offset expressions whose causality can be established, including `close[1]`. Unoffset and unproven expressions remain rejected. Source and runtime guards prevent dynamic or positional flags from bypassing the restriction. |
| Lower-timeframe security | Upstream path exposed, not certified | The gate admits `request.security_lower_tf`; actual feed availability and PineTS support can reject a request. No complete intrabar-array/replay fixture establishes parity. |
| Financial/economic/dividend/custom remote requests | Unavailable | Non-security `request.*` names are rejected; no arbitrary network provider is exposed. |
| Exchange metadata/session timing | Implemented / approximate | Chart host supplies symbol, timezone, session and tick size. Daily closes use session context. Weekly/monthly closes are calendar estimates; holiday and early-close calendars are absent. |
| Live tick/rollback/repainting semantics | Unavailable as parity claim | Runs recalculate loaded OHLCV snapshots. Historical final bars are now classified using their close time and replay context rather than automatically marked realtime. This does not provide tick-for-tick rollback or `varip` parity. |
| Alert conditions and logs | Verified representative cases | Historical alert events and bounded logs reach the editor. Closed-bar preview excludes the newest candle. No cloud alert persistence, scheduling, push or webhook service is created. |
| Script management | Implemented, fixtures cover local workflows | Named scripts, import/export and local revisions; one active custom script per chart. No shared account/cloud synchronization. |
| Library imports / library publishing | Unavailable | Source gate rejects imports/exports; declaring a TradingView library or publishing protected/invite-only scripts is not supported. |
| TradingView account/publishing | Unavailable | No connection to TradingView compiler, login, saved scripts, marketplace, protected sources or publish APIs. |
| Mobile browser / native Android | Shared runtime | Native Pine execution and strategy simulation use the same runtime across devices. Desktop gets Monaco and chart docking; touch/native gets the full-screen touch editor. Script storage is local to each device. |

## Data scope

Supported host feed requests map Pine `1,2,3,5,10,15,30,60,120,180,240,D,1D,W,1W,M,1M` to existing application candle endpoints. These labels do not guarantee that every instrument has usable history. Requests accept the current instrument and exact symbols available through the connected instrument directories, never arbitrary URLs. Additional dataset fetching is unavailable in replay. Missing histories and unknown symbols fail explicitly. Explicitly supplied datasets in direct runtime tests do not expand the end-user chart host's permissions.

No engine API can create a paper or real brokerage order through this adapter. Strategy orders remain broker simulation records. Prices, adjusted history, unavailable candles, session context and corporate-action handling affect results.

## Actual bounds

| Boundary | Current value |
| --- | --- |
| Native source | 50,000 characters; version 5 or 6 declaration and indicator/strategy required |
| Supplied dataset | 20,000 candles per dataset; finite valid positive OHLC, nonnegative volume, strictly increasing timestamps |
| Input metadata | 100 inputs; unknown overrides fail |
| Worker wall timeout | 12 seconds in the browser sandbox client; abort terminates the worker/frame |
| Upstream loop setting | 10,000 loop iterations via `setMaxLoops`; not a claim of a global instruction or memory quota |
| Runtime provider request budget | 32; browser message bridge permits at most 12 data requests |
| Unique additional host symbol/timeframe datasets | 8 per run |
| Raw output series / points | 256 series, 1,500,000 accumulated raw data entries |
| Logs / alert groups | 500 logs; 100 alert groups |
| Rendered drawing categories | Last 1,000 objects per category; polyline points capped at 1,000 each |
| Fills / background/OHLC history | 64 plot fills; bounded recent 20,000 background/OHLC entries per source |
| Tables / text | 9 tables, at most 400 cells per table, dimensions clamped to 40; 512 text characters per rendered value |
| Local storage | 30 named scripts, 20 revisions per script and 120 revisions total |

A timeout is a wall-clock execution cutoff, not a hard memory-process quota. Browser allocation pressure can occur before a timeout; do not describe this as a general-purpose trusted-code environment. Some per-source render caps can omit excess output. The desktop UI shows runtime warnings for unsupported styles and known approximation cases.

## Isolation and stale state

PineTS generates JavaScript, so the product does not claim to be a non-evaluating AST interpreter on desktop. Generated code runs only in a dedicated worker created by a sandboxed opaque-origin iframe (`allow-scripts`, without same-origin access). CSP blocks direct network connections. A private MessagePort carries supplied candles, a constrained market-data request protocol and results. Native-source validation rejects JavaScript mode, imports and host access names; it is one defense layer, not a proof against every compiler/runtime vulnerability.

The UI validates the returned result shape, cancels superseded runs, scopes cached results to script/chart/symbol/timeframe/history and clears stale visuals/errors. Desktop, mobile and native use the shared advanced active-script selection on the same device. These boundaries require browser tests as well as direct runtime fixtures.

## Validation and source

Run the commands in [pine-editor.md](pine-editor.md#developer-validation). Tests include `pine-runtime.test.mjs`, `pine-visual-layer.test.mjs`, `pine-workspace-advanced.test.mjs`, renderer/legacy tests and browser sandbox/editor fixtures. The [reference comparison tool](pine-reference-comparison.md) compares supplied exports against the same runtime and includes a hand-calculated fixture that exposed an EMA initialization difference. That correction follows TradingView's documented recurrence; it is not an authenticated live TradingView comparison. Numerical, trade and canvas fixtures are targeted evidence; no full TradingView reference corpus has been certified.

Actual REA observations and reused Ghidra evidence are documented in [pine-rebuild-rea.md](pine-rebuild-rea.md). The owner approved AGPL publication and PineTS integration; see [source and licensing](source-and-licensing.md). Upstream [PineTS](https://github.com/LuxAlgo/PineTS) feature claims should be read alongside this narrower application contract.
