# PaperTrade IN

A responsive Indian-market paper-trading simulator built with Next.js, vinext and TradingView Lightweight Charts.

## Features

- Dynamic candlestick chart with pan, mouse-wheel/pinch zoom, crosshair, right-side INR price scale and bottom time scale
- Simulated running candle with 1m, 5m, 15m, 1H, 3H, 4H and 1D intervals
- EMA 5, EMA 21 and RSI 14 (no volume)
- Trend line, horizontal line/ray, parallel channel, rectangle with midline, Fibonacci, price range and long/short drawing tools
- Magnet, hide-drawings and delete-drawings controls
- NIFTY 50, BANK NIFTY, NIFTY 500 and demo All NSE watchlists
- Local INR paper orders, cash balance and order book
- Broker API settings stored only in the browser
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

This repository is ready for the included OpenAI Sites/vinext deployment flow. For Vercel or Render, keep in mind that vinext targets Cloudflare-style runtimes; a standard Next.js deployment may require switching the build script from `vinext` to `next`.

## Data and safety

The app ships with deterministic simulated candles. Broker credentials entered in the UI stay in browser storage and are not transmitted. A secure server-side adapter is required before connecting a real broker market-data feed. This is an educational simulator, not investment advice.

## Attribution

Charts use the open-source [Lightweight Charts](https://github.com/tradingview/lightweight-charts) library by TradingView under its Apache 2.0 license.
