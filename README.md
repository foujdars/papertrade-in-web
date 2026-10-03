# PaperTrade IN

A responsive Indian-market paper-trading simulator built with Next.js, vinext and TradingView Lightweight Charts.

## Features

- Dynamic TradingView Lightweight Charts candlesticks with pan, mouse-wheel/pinch zoom, OHLC crosshair magnet, right-side INR price scale and bottom time scale
- Dedicated `/chart` workspace with symbol search, full-screen mode, ranges, live Indian time and quick paper buy/sell
- Authenticated Upstox candles and quote snapshots for 1m, 5m, 15m, 1H, 3H, 4H, 1D, 1W, 1M and 1Y intervals
- Clean candlestick-only default view with independent EMA 5, EMA 21 and RSI 14 switches (no volume)
- All 67 tools registered by the current drawing extension, covering lines, channels, Fibonacci, Gann, pitchforks, measurements, shapes, annotations and long/short position planning
- Mobile-first tap-to-place drawings with OHLC magnet snapping, touch selection, anchor/whole-drawing movement, lock, hide, undo, redo, delete and per-symbol persistence
- Complete daily Upstox NSE equity master with official NIFTY 50, BANK NIFTY and NIFTY 500 constituent membership, search and paged watchlists
- Live top-15 NSE cash volume watchlist using `Daily Volume > 5 × SMA(Volume, 20)`, with Upstox live volume and adjusted daily candle history
- Current NSE F&O universe with searchable indices and stocks, live Upstox expiry-wise Call/Put option chains, strike selection, OI, IV, Greeks and lot sizes
- Mobile-friendly vertical spot and option candlestick charts with a wide-range draggable divider; tapping an F&O symbol opens its nearest live ATM contract, while the chart's Option Chain button opens a resizable slide-up Call/Put selector
- Local INR paper orders, cash balance and order book
- Real-time long/short position P&L with weighted average entry, realized P&L, unrealized P&L, return percentage, custom-quantity exits and exit-all
- NSE intraday order lock outside the regular weekday 09:15–15:30 IST session; Delivery remains available from the main ticket
- Server-only Upstox access-token handling with visible live/fallback feed status
- Responsive desktop and mobile layouts
- Capacitor 8 Android app project that opens the full-screen chart and uses the same local paper-order engine
- Optional Supabase Google authentication with Android deep-link return through the system browser
- Per-user Supabase cloud sync for virtual balance, paper orders, protections, watchlists, chart preference and theme

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production build

```bash
npm run build
npm run start
```

## Android APK

The Android app uses the stable hosted web application so it can reach the secure Upstox server routes. It therefore requires an internet connection. When Supabase is configured, paper orders and preferences are synchronized to the signed-in user while retaining a local copy for responsive use.

```bash
npm run android:sync
npm run android:apk
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Set `PAPERTRADE_APP_URL` before syncing to point a personal build at another HTTPS deployment. Android Google login opens the secure system browser and returns through `in.papertrade.app://auth/callback`; add that exact URL to Supabase Authentication → URL Configuration → Redirect URLs.

## Hosting

Vercel uses the native Next.js build configured in `vercel.json`. Add `UPSTOX_ACCESS_TOKEN` as a Production environment variable and redeploy. Do not prefix it with `NEXT_PUBLIC_`; the browser must never receive the token. To enable Google login, also add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, then follow `SETUP_FROM_SCRATCH.md`.

## Data and safety

The server merges Upstox historical candles with the official current-trading-day intraday OHLC feed. It refreshes true intraday candles every ten seconds, polls the selected symbol's LTP every five seconds, and refreshes watchlist quotes every ten seconds. LTP values are never used to invent candle opens, highs or lows. If the token is missing, expired or rejected, the chart visibly identifies the unavailable feed; paper orders are blocked when a fresh Upstox price is unavailable. The F&O list, option chain and contract charts use official active Upstox instruments and never invent contracts or option prices. Paper orders stay in browser/cloud storage and are never submitted to Upstox or an exchange. This is an educational simulator, not investment advice.

## Attribution

Charts use the open-source [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) library under Apache 2.0 and the MIT-licensed [lightweight-charts-drawing](https://github.com/deepentropy/lightweight-charts-drawing) extension. TradingView attribution remains visible in the chart.

## Automatic virtual trading bot

The **Bot** tab sits to the right of **P&L** on desktop and mobile. It uses the existing Global USD paper wallet, order rules and [Delta India public market-data endpoints](https://docs.delta.exchange/). No exchange credentials, AI subscription, paid bot service or new backend account is required.

1. Open **Bot**, then choose Bitcoin (`BTCUSD`), Ethereum (`ETHUSD`), Solana (`SOLUSD`) or tokenised Gold (`XAUTUSD`). Unavailable contracts remain disabled by the existing market-data validation.
2. Choose EMA crossover, RSI reversal or range breakout; set the indicator periods, candle timeframe (1m, 5m, 15m or 1H) and long/short direction.
3. Set USD notional per trade, leverage, stop-loss and take-profit percentages, daily entry and realised loss limits, and entry cooldown. Contract lots round down; prices use the exchange tick size.
4. Select **Save & start bot**. Only a newly completed candle after starting can trigger a trade. Entry uses current bid/ask with margin, fees and liquidity checks. Existing positions and pending orders block additional bot entries for that asset.
5. Use **Pause this bot**, **Pause all**, or **Close position & pause**. Pausing stops new entries; existing position protection continues while the app monitors live prices. **View Global P&L** opens the existing analytics with the USD scope.

The engine runs while the app is open and visible, including when navigating away from Bot. It pauses when the browser is hidden, the device sleeps or the app closes. There is no background worker or 24/7 execution. Saved enabled strategies resume on returning, without replaying missed signals or pretending to fill missed stops/targets. TP/SL execute at subsequently observed live prices, so gaps can change the simulated exit price. Daily limits use the India calendar day and block new entries; the loss limit includes realised P&L, entry/exit fees and observed funding, excludes unrealised losses and is not a guaranteed loss cap.

Bot configurations, candle consumption and trades are stored together in this browser's account-scoped dollar wallet under a Web Lock. This makes concurrent browser tabs consume a signal atomically. Data is local to the browser/device and is not a hosted bot or cloud execution service. One strategy per asset is supported. Stops and targets manage exits; opposite signals do not automatically reverse an open position. Manual increases to bot-owned positions are blocked; manual reduce-only exits remain available.

Run `npm run test:bot` for strategy signals, freshness/gap checks, duplicate prevention, persisted state, daily limits, cooldown, protected exits and all four assets. Run `node tests/browser/paper-bot.cjs` against a preview with `TEST_BASE_URL` (default `http://localhost:3232`), `PLAYWRIGHT_MODULE_PATH` and optional `CHROMIUM_PACKAGE` for the browser checks.

## Notification controls and IPO context

Open the notification bell to switch **EMA 21 alerts** (BTC, ETH and Gold, 5m/15m) and **EMA 5 alerts** (BTC, 5m/15m) on or off independently. Both remain on by default for existing installations. Choices persist on the current browser/device, sync to its registered push token, and are checked by server dispatch, browser push, Android delivery and the in-app inbox. Custom chart alerts retain their own settings. A failed background sync is shown with a retry option; local preferences still apply and registration uses the saved choices when reconnecting.

IPO notification titles begin with **IPO**. Descriptions name the full issuer and event, relevant bidding/allotment/listing dates, available price context and the destination for details or official results. GMP includes its update time, is identified as unofficial, and is omitted when stale or future-dated. A listing does not by itself claim that allotment results have been published. Existing server evidence checks, freshness windows and duplicate prevention remain in place.

Run `npm run test:notifications` for notification policies, device registration, independent EMA delivery and IPO wording. The optional native helper check uses `javac` and skips when a JDK is unavailable. Run `node tests/browser/notification-controls.cjs` against a preview with `TEST_BASE_URL`, `PLAYWRIGHT_MODULE_PATH` and optional `CHROMIUM_PACKAGE` for panel controls, persistence, cross-tab updates and viewport checks. Native receiver and legacy worker changes require an Android rebuild to reach installed APKs.

## Research and bot improvements

The Bot tab now includes **Wallet risk limits**, **Portfolio equity**, advanced strategy settings, and **Backtest & compare**. Existing strategies keep their prior behavior until advanced features or wallet limits are enabled.

| Improvement | Behavior |
| --- | --- |
| Account-wide risk | Combined daily entries and realised net loss, total estimated stop risk, asset notional concentration, and observed equity drawdown pause new USD perpetual entries. Every entry requires a stop in this mode. Exits remain available. New option exposure is paused because options need a separate risk model. |
| Historical comparison | Uses the same signal, order, sizing and exit engines in a separate temporary wallet. Compares configured features against the original fixed-notional/percentage-stop policy on the same history. |
| Risk sizing and stops | Equity risk budget includes estimated entry/exit fees, rounds lots down and respects the configured notional cap. ATR stops, fee-adjusted breakeven and ATR trails are optional. |
| Partial exits | Two configurable targets use multiples of original stop distance (R) and percentages of original lots. A runner remains. Partial fills retain bot attribution and do not inflate backtest trade counts. Exit plans keep their original timeframe and settings when the strategy is reconfigured. |
| Ranked scanners | Technical scanner rows receive peer-percentile momentum, EMA distance and volume scores; matching setups sort first, then by score. The daily NSE research universe also includes matched-date NIFTY relative strength and dated news. |
| Market conditions | Bots can require trend or range using asset EMA/ATR and reject stress conditions. Daily NSE research separately reports NIFTY trend, scan-universe breadth and India VIX. |
| Portfolio equity | USD Bot and Global P&L show daily observed equity including open perpetual P&L, return, drawdown and a BTC hold comparison on matching observation dates. Missing days and unavailable marks are not fabricated. This history is browser/account local and excludes unsupported option exposure. |
| Fundamental screening | Dated Screener reports show P/E, ROE, debt/equity, sales growth and profit margin with review flags. Annual margin/debt and reported ROE/TTM growth can have different periods. Unavailable current ratio or other values remain unknown; financial-sector leverage is contextual. |
| Dated news sentiment | Headlines retain their publication time, publisher and source link. A financial-word lexicon applies recency weighting, deduplication, negation and sample-size shrinkage over five days. Undated, stale and future news is excluded. Missing news is not scored as neutral evidence. |
| Scheduled scanning | GitHub Actions scans the curated NSE universe at **16:15 IST Monday–Friday**, after changes to scan configuration, or with **Run workflow**. Results persist in `public/research/daily.json` and the deployed `/research` page fetches the latest main-branch snapshot without needing a rebuild. |

Open **NSE daily research** from Bot or the market scanner, or visit `/research`. Edit `config/research-universe.json` to change the 20-stock default universe (maximum 100). The collector uses public Yahoo Finance chart endpoints, Screener reports and Google News RSS, with no broker, AI or paid-data credentials. GitHub schedules can be delayed; holidays may return the last session. Each result shows coverage, session/report dates and source failures. A failed scan with no usable prices preserves the previous published snapshot; results older than four days are marked stale. These end-of-day inputs are research data, not live execution quotes.

Wallet risk is a USD perpetual feature; per-asset bot limits also remain in force. Daily realised loss includes fees and observed funding, while the equity drawdown gate also reflects observed open P&L. Stops estimate risk rather than guaranteeing a loss cap. Automatic partials and trailing protection continue for paused bot positions while live monitoring is active, but closing or backgrounding the app suspends them.

Backtests enter at the next bar open, apply configured spread/slippage and current contract fees/rules, and traverse the adverse extreme before the favorable extreme. Funding and historical order-book depth are unavailable and excluded; gaps in historical candles fail explicitly. Results assess the combined configuration on one asset and do not establish profitability or reproduce a historical multi-asset wallet.

Validation: `npm run test:research`, `npx tsc --noEmit`, and the Vercel build `npx next build`. Browser checks: `node tests/browser/research-bot.cjs` with `TEST_BASE_URL`, `PLAYWRIGHT_MODULE_PATH` and optional `CHROMIUM_PACKAGE`, using the same conventions as the existing bot browser tests. For the collector, install `beautifulsoup4>=4.13,<5`, run `python scripts/collect-research.py`, then `node --experimental-strip-types scripts/daily-research.ts`.
