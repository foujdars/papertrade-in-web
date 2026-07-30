# PaperTrade IN

A responsive Indian-market paper-trading simulator built with Next.js, vinext and TradingView Lightweight Charts.

## Features

- Dynamic candlestick chart with pan, mouse-wheel/pinch zoom, crosshair, right-side INR price scale and bottom time scale
- Authenticated Upstox candles and quote snapshots for 1m, 5m, 15m, 1H, 3H, 4H and 1D intervals
- EMA 5, EMA 21 and RSI 14 (no volume)
- Trend line, horizontal line/ray, parallel channel, rectangle with midline, Fibonacci, price range and long/short drawing tools
- Magnet, hide-drawings and delete-drawings controls
- NIFTY 50, BANK NIFTY, NIFTY 500 and demo All NSE watchlists
- Local INR paper orders, cash balance and order book
- Server-only Upstox access-token handling with visible live/fallback feed status
- Responsive desktop and mobile layouts

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

## Hosting

Vercel uses the native Next.js build configured in `vercel.json`. Add `UPSTOX_ACCESS_TOKEN` as a Production environment variable and redeploy. Do not prefix it with `NEXT_PUBLIC_`; the browser must never receive the token.

## Data and safety

The server merges Upstox historical candles with the official current-trading-day intraday OHLC feed. It refreshes true intraday candles every ten seconds, polls the selected symbol's LTP every five seconds, and refreshes watchlist quotes every ten seconds. LTP values are never used to invent candle opens, highs or lows. If the token is missing, expired or rejected, the chart visibly switches to simulated fallback data and shows the reason in its status bar. Paper orders stay in browser storage and are never submitted to Upstox or an exchange. This is an educational simulator, not investment advice.

## Attribution

Charts use the open-source [Lightweight Charts](https://github.com/tradingview/lightweight-charts) library by TradingView under its Apache 2.0 license.
