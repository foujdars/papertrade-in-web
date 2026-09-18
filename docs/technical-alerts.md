# Technical alerts — first release

Open the alarm-clock icon → Create alert → Technical. The selected chart supplies
the symbol and initial timeframe; the saved alert then keeps its own settings.
Opening another chart, hiding indicators, or switching to P&L does not alter it.

## Conditions

- EMA / SMA: close crosses an average, or fast average crosses slow average.
- Session VWAP: close crosses session VWAP. Intraday only; requires volume and
  uninterrupted history from 09:15 IST. Indices are excluded.
- RSI: crosses above or below a chosen threshold, using a configurable period.
- MACD: MACD/signal cross or histogram/zero cross. These represent the same event
  for identical settings, so creating both is redundant.
- Supertrend: bullish or bearish direction change.
- Bollinger Bands: close breaks outside a band, or returns inside both bands.
- Previous-day levels: close crosses the previous trading day's high or low,
  using the separate daily feed, not a partial intraday reconstruction.

Supported timeframes: 1m, 3m, 5m, 15m, 30m, 1H, 1D. Indicator calculations are
shared with the chart. Results can differ from other platforms because their
feed, historical window or indicator initialization differs.

## Delivery and safeguards

- Confirmed closes only, with a five-second provider finalisation allowance.
- New events only: no historical backfill on creation, editing or resuming.
- Once-only or repeating crossings, with an optional cooldown in minutes.
- Expiry of 1, 7 or 30 days; pause, resume, edit and delete in List / Log.
- Repeat events are deduplicated using the rule revision and candle timestamp.
- List shows monitoring/waiting states. Log records the condition, candle open
  time, closing price and delivery time; its chart button restores the timeframe.
- Up to 12 active/paused rules, 6 symbol/timeframe groups, 40 saved rules and
  200 log events per account on this device. These are not cloud-synced.
- A single foreground browser tab polls each account. Web Locks protect both
  monitoring leadership and read/modify/write transactions. Network history is
  shared by symbol/timeframe, and intraday refreshes are merged into cached history.
- Polling runs about every 30 seconds near relevant candle closes, including a
  short final-session grace period. No fake/demo candles or quote-price fallback.
- Missing volume/history, unavailable storage, unsupported Web Locks, offline
  state, hidden app or stale candles do not trigger alerts. There is no catch-up
  burst after the three-minute freshness window.
- Delivery in this release is the in-app toast, notification centre and durable
  alert Log. The app must be visible and online. No closed-app, background push,
  email, SMS, webhook, automatic order, Pine execution or AI inference is included.

SMC events, volume conditions, multi-condition rules and server-side closed-app
monitoring are separate future work.

## Verification

`node --test tests/technical-alerts.test.mjs` checks indicator conditions,
bar-finalisation/session boundaries, persistence validation and duplicate guards.
`tests/browser/technical-alerts.cjs` uses isolated storage and deterministic candle
responses to exercise the actual alert form and monitor. No real account data or
trades are used. Existing price-alert and paper-order tests remain unchanged.
