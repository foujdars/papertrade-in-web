# Technical alerts

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
- Volume: spikes, dry-ups, and high-volume bullish/bearish closes relative to a
  configurable average of strictly preceding candles. Conditions fire on entry,
  not repeatedly while true. Dojis do not count as directional candles; missing
  or zero volume does not count as a dry-up. No index volume alerts. Intraday
  averages can span sessions and are not adjusted for time-of-day seasonality.

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
- Device mode delivers an in-app toast, notification centre entry and durable
  alert Log. The app must be visible and online.

## Closed-app mode (requires deployment setup)

Choose **Monitoring → Even when app is closed** when creating a technical alert.
This is a separate, explicit opt-in: existing local rules are never uploaded or
duplicated automatically. Editing does not change a rule's monitoring mode.

The server verifies the Supabase session, stores rules per account in Firestore,
and checks fresh provider candles from a protected minute-level scheduler. A
healthy scheduler heartbeat and a signed-in device with trade notifications
enabled are required before saving/resuming. Without that configuration the form
shows **Closed-app setup required**, not an active background-monitoring claim.
See [deployment setup](FIREBASE-NOTIFICATIONS-SETUP.md#closed-app-technical-alerts).

Limits are 12 active/paused rules and 6 symbol/timeframe groups per server account,
40 saved rules and 200 log entries. The initial deployment additionally caps
capacity at 10 accounts and 24 distinct symbol/timeframe groups. Paused rules
reserve capacity; delete them to release it. This is deliberately bounded, not
an unlimited TradingView-scale service.

Only regular NSE 09:15–15:30 sessions are evaluated, plus a short final-close
grace period. Holidays, unavailable session data and special sessions are not
evaluated. Failed fresh-data requests do not use stale-response cache fallback.
Expired paused rules cannot be resumed without editing, even if their displayed
status is still paused. Signals older than the freshness window are not replayed.

Firestore transactions persist the event and one outbox record together. A
scheduler lease prevents overlap. Each push has a stable ID and a three-minute
delivery deadline, respects trade opt-out, quiet hours and hide-amounts settings,
and opens its saved symbol/timeframe. Ambiguous send failures are marked for
review rather than blindly retried; successful FCM acceptance is not proof of
receipt. The account Log remains the record of the detected event. Phone/browser
restrictions, force-stop, permission denial and network outages can prevent
delivery. Closed-app delivery has **not** been verified with a real device yet.

SMC technical alerts are intentionally excluded. Email, SMS, webhook, automatic
orders, Pine execution, AI inference and multi-condition rules are not included.

## Verification

`node --test tests/technical-alerts.test.mjs` checks indicator conditions,
bar-finalisation/session boundaries, persistence validation and duplicate guards.
`tests/browser/technical-alerts.cjs` uses isolated storage and deterministic candle
responses to exercise the actual alert form and monitor. No real account data or
trades are used. Existing price-alert and paper-order tests remain unchanged.

`tests/technical-alerts-server.test.mjs` checks server-owned fields, revision
conflicts, expiry and account isolation. `tests/technical-alerts-dispatch.test.mjs`
executes the real API handlers and evaluator with mocked auth, a transactional
document store, deterministic candles and a captured push transport. It covers
overlapping/repeated runs, feed failure, missing volume, consent, privacy and
ambiguous delivery. These tests do not replace real Firebase/device acceptance.
