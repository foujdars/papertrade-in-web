# PaperTrade IN

A responsive Indian-market paper-trading simulator built with Next.js, vinext and KLineChart.

## Features

- Dynamic KLineChart candlesticks with pan, mouse-wheel/pinch zoom, crosshair, right-side INR price scale and bottom time scale
- Dedicated `/chart` workspace with symbol search, full-screen mode, ranges, live Indian time and quick paper buy/sell
- Authenticated Upstox candles and quote snapshots for 1m, 5m, 15m, 1H, 3H, 4H and 1D intervals
- EMA 5, EMA 21 and RSI 14 (no volume)
- Trend line, horizontal line/ray, parallel channel, rectangle with midline, Fibonacci, price range and long/short drawing tools
- Native zoom-synchronised drawings with magnet, lock, hide, undo, redo and delete controls
- NIFTY 50, BANK NIFTY, NIFTY 500 and demo All NSE watchlists
- Local INR paper orders, cash balance and order book
- Real-time long/short position P&L with weighted average entry, realized P&L, unrealized P&L, return percentage and one-tap market close
- Server-only Upstox access-token handling with visible live/fallback feed status
- Responsive desktop and mobile layouts
- Capacitor 8 Android app project that opens the full-screen chart and uses the same local paper-order engine

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

The Android app uses the stable hosted web application so it can reach the secure Upstox server routes. It therefore requires an internet connection. Paper orders and positions remain local to the Android WebView storage.

```bash
npm run android:sync
npm run android:apk
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. Set `PAPERTRADE_APP_URL` before syncing to point a personal build at another HTTPS deployment.

## Hosting

Vercel uses the native Next.js build configured in `vercel.json`. Add `UPSTOX_ACCESS_TOKEN` as a Production environment variable and redeploy. Do not prefix it with `NEXT_PUBLIC_`; the browser must never receive the token.

## Data and safety

The server merges Upstox historical candles with the official current-trading-day intraday OHLC feed. It refreshes true intraday candles every ten seconds, polls the selected symbol's LTP every five seconds, and refreshes watchlist quotes every ten seconds. LTP values are never used to invent candle opens, highs or lows. If the token is missing, expired or rejected, the chart visibly switches to simulated fallback data and shows the reason in its status bar. Paper orders stay in browser storage and are never submitted to Upstox or an exchange. This is an educational simulator, not investment advice.

## Attribution

Charts use the open-source [KLineChart](https://github.com/klinecharts/KLineChart) library under its Apache 2.0 license.
