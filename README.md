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

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Set `PAPERTRADE_APP_URL` before syncing to point a personal build at another HTTPS deployment.

## Hosting

Vercel uses the native Next.js build configured in `vercel.json`. Add `UPSTOX_ACCESS_TOKEN` as a Production environment variable and redeploy. Do not prefix it with `NEXT_PUBLIC_`; the browser must never receive the token. To enable Google login, also add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, then follow `SETUP_FROM_SCRATCH.md`.

## Data and safety

The server merges Upstox historical candles with the official current-trading-day intraday OHLC feed. It refreshes true intraday candles every ten seconds, polls the selected symbol's LTP every five seconds, and refreshes watchlist quotes every ten seconds. LTP values are never used to invent candle opens, highs or lows. If the token is missing, expired or rejected, the chart visibly switches to simulated fallback data and shows the reason in its status bar. Paper orders stay in browser storage and are never submitted to Upstox or an exchange. This is an educational simulator, not investment advice.

## Attribution

Charts use the open-source [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) library under Apache 2.0 and the MIT-licensed [lightweight-charts-drawing](https://github.com/deepentropy/lightweight-charts-drawing) extension. TradingView attribution remains visible in the chart.
