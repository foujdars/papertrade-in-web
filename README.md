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
2. Click **Use my EMA 21** or **Use my EMA 5 reversal**, or choose EMA crossover, RSI reversal or range breakout. Select up to four entry timeframes: 1m, 3m, 5m, 15m, 30m, 1H, 4H or 1D. The EMA presets initially select 5m and 15m.
3. Optionally add a higher-timeframe EMA trend filter. For example, watch 5m and 15m entries while requiring longs above the completed 1H EMA 21 and shorts below it. The filter timeframe must exceed every entry timeframe; missing or stale filter history blocks entries.
4. Choose fixed USD notional or a **USD stop-risk budget** with a maximum notional cap. Use percentage exits or a signal-candle stop with a reward/risk target (the presets use 2R). Signal stops sit beyond the trigger candle low for longs or high for shorts, with an adjustable tick buffer. Planned risk excludes fees, funding and gaps; it is not a maximum-loss guarantee. Lots round down and the notional cap always applies.
5. Set leverage, daily entry/realised-loss limits and cooldown in candles of the smallest selected timeframe. **Check latest setup** previews current rules, stops, targets and size without placing an order.
6. Select **Save & start bot**. Only a newly completed candle after starting can trigger a trade. Entry uses current bid/ask with margin, fees and liquidity checks. Existing positions and pending orders block additional bot entries for that asset. Review the **Timeframe monitor** and **Strategy decision log** for entries, missing data, rejected orders and skipped signals.
7. Use **Pause this bot**, **Pause all**, or **Close position & pause**. Pausing stops new entries; existing position protection continues while the app monitors live prices. **View Global P&L** opens the existing analytics with the USD scope.

**Your EMA 21 setup** reuses the chart rule: an EMA cross, opposite-colour pullback in the permitted window, then a trigger candle breaking that pullback candle. The bot confirms a completed candle; the chart's live entry notification can arrive earlier. **Your EMA 5 reversal** defaults to long-only: the previous candle touches EMA 5, then a candle of either colour finishes with its entire low above EMA 5. Short-only or both-direction mode explicitly enables the mirrored short rule (entire high below EMA after a touch). Both EMA strategies wait five seconds after close for candle settlement.

Each entry timeframe runs independently. Simultaneous signals in the same direction favour the highest timeframe and create one trade. Opposing signals skip that evaluation. Evaluated signals, including those blocked by a filter or risk limit, are consumed once; a later new candle is required to retry. The decision log retains the latest 40 decisions (the workspace displays 12). Restarting the strategy does not replay candles that closed before starting.

The engine runs while the app is open and visible, including when navigating away from Bot. It pauses when the browser is hidden, the device sleeps or the app closes. There is no background worker or 24/7 execution. Saved enabled strategies resume on returning, without replaying missed signals or pretending to fill missed stops/targets. TP/SL execute at subsequently observed live prices, so gaps can change the simulated exit price. Daily limits use the India calendar day and block new entries; the loss limit includes realised P&L, entry/exit fees and observed funding, excludes unrealised losses and is not a guaranteed loss cap.

Bot configurations, candle consumption and trades are stored together in this browser's account-scoped dollar wallet under a Web Lock. This makes concurrent browser tabs consume a signal atomically. Data is local to the browser/device and is not a hosted bot or cloud execution service. One strategy per asset is supported. Stops and targets manage exits; opposite signals do not automatically reverse an open position. Manual increases to bot-owned positions are blocked; manual reduce-only exits remain available.

Run `npm run test:bot` for EMA setups across all eight timeframes, trend filters, signal stops, risk sizing, freshness/gap checks, multi-timeframe conflicts and duplicate prevention, persisted state, daily limits, cooldown, protected exits and all four assets. Run `node tests/browser/paper-bot.cjs` against a preview with `TEST_BASE_URL` (default `http://localhost:3232`), `PLAYWRIGHT_MODULE_PATH` and optional `CHROMIUM_PACKAGE` for the browser checks.

## Notification controls and IPO context

Open the notification bell to switch **EMA 21 alerts** (BTC, ETH and Gold, 5m/15m) and **EMA 5 alerts** (BTC, 5m/15m) on or off independently. Both remain on by default for existing installations. Choices persist on the current browser/device, sync to its registered push token, and are checked by server dispatch, browser push, Android delivery and the in-app inbox. Custom chart alerts retain their own settings. A failed background sync is shown with a retry option; local preferences still apply and registration uses the saved choices when reconnecting.

IPO notification titles begin with **IPO**. Descriptions name the full issuer and event, relevant bidding/allotment/listing dates, available price context and the destination for details or official results. GMP includes its update time, is identified as unofficial, and is omitted when stale or future-dated. A listing does not by itself claim that allotment results have been published. Existing server evidence checks, freshness windows and duplicate prevention remain in place.

Run `npm run test:notifications` for notification policies, device registration, independent EMA delivery and IPO wording. The optional native helper check uses `javac` and skips when a JDK is unavailable. Run `node tests/browser/notification-controls.cjs` against a preview with `TEST_BASE_URL`, `PLAYWRIGHT_MODULE_PATH` and optional `CHROMIUM_PACKAGE` for panel controls, persistence, cross-tab updates and viewport checks. Native receiver and legacy worker changes require an Android rebuild to reach installed APKs.
