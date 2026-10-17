# Algo Trading

Open **Home → ⋯ (More options) → Algo Trading** on desktop, mobile web or the hosted native-app interface.

## Try it immediately

Select **Try demo**. This runs a five-day, two-leg example with explicitly synthetic prices and opens the equity curve, net P&L, drawdown, winning-leg rate and trade log. It works outside market hours and without broker credentials. The demonstration includes losing trades; its results are not historical performance.

To see a running strategy, open **Forward test**, choose **Synthetic demo — works now**, and select **Start paper run**. Each second advances the simulated clock by one minute. Use Pause, Resume and Stop & close to inspect the positions and decision log. Synthetic forward runs demonstrate scheduled entry and protection; use backtests or market quote mode to evaluate EMA triggers.

## Build and backtest a strategy

1. Name the strategy and choose scheduled entry or a bullish/bearish EMA crossover. Configure entry and exit times in IST and a 1-, 5- or 15-minute candle interval.
2. Add up to eight BUY/SELL legs. The instrument picker supports NSE equities/futures and exact option contracts selected by underlying, expiry, strike and call/put. Units must be a whole multiple of the displayed lot size.
3. Set leg stop/target percentages, basket loss/profit limits, virtual capital, fee per order and adverse slippage. Zero disables a protection limit. Gross notional across all legs plus round-trip fees must fit within virtual capital; broker leverage and margin offsets are not modelled.
4. Choose historical candles or the explicitly labelled synthetic data mode. An optional date restricts history to that trading day; otherwise the provider's available recent window is used. Select **Run backtest**.
5. Inspect assumptions and warnings alongside the results. Export trades to CSV, or save the strategy in this browser. JSON import/export transfers strategy settings between browsers; it does not transfer accounts or historical market datasets.

Historical tests fetch the exact contract's candles. Missing option history, malformed OHLC or provider failures stop the test. They are not replaced by underlying-index or demo prices. Incomplete and future candles are excluded. Saved option contracts retain their original expiry; choose current contracts for a new market run.

## Forward testing with market quotes

Select **Market quotes — NSE hours** and start the paper run. Entry requires the dated NSE session to be open, every leg's matching quote to have a provider observation no older than 20 seconds and a trade no older than 60 seconds, and leg observations to be within 10 seconds of each other. Illiquid contracts can therefore remain waiting. EMA entry uses completed, settled candles.

The runner uses a separate virtual ledger. It never submits broker orders or changes the main practice wallet. Each run opens at most one basket. Stop & close queues an exit until fresh quotes are available during an open session; it does not invent an exit price when data is missing. The log explains waits, entries, exits and rejected sizing.

Monitoring runs only while this workspace remains open and visible. Hiding the app, changing pages or reloading pauses the run. Resume explicitly; no fills are assumed during inactivity. A resumed position may exit at a worse observed price after a gap. Runs and strategies are scoped to the signed-in account (or guest) in local browser storage. Only one tab controls the saved runner; taking control reloads its latest state and invalidates older in-flight responses. There is no unattended server execution or cloud synchronization for this feature.

## Simulation rules

- One basket entry per weekday NSE session, with no automatic re-entry or overnight strategy. Exact contracts are used throughout, with no reconstructed historical ATM selection or rolling expiry.
- Scheduled entries use the first shared tradable bar in the configured window. EMA crosses are calculated on completed signal bars and fill at the immediately following execution bar's open.
- Zero-volume or missing leg bars cannot execute the basket. Gaps are reported. If the configured exit is unavailable, the last shared candle closes remaining legs and is labelled `data_end`.
- Individual stops take precedence when a candle touches both stop and target. Gap exits use the actual next observed open. Basket limits use synchronized bar opens and closes; unrelated legs' highs and lows are not treated as simultaneous.
- Slippage applies adversely on both sides and fees apply once per leg per side. Taxes, spread, queue priority, order-book liquidity and broker margin are not estimated. Mark-to-market equity includes paid entry fees; exit fees are charged on close. Drawdown is based on observed marks, not an invented intrabar path.
- Winning-leg rate and trade count refer to closed legs, not whole strategy baskets. Fill differences between bar-based backtests and quote-based forward runs are expected.

This is an independent AlgoTest-inspired paper-testing workflow, not the complete proprietary product. See [REA investigation and Ghidra applicability](./algo-trading-rea.md) for the public sources, actual tool evidence and scope.

## Verification

`npm run test:algo` covers the simulator, paper lifecycle, data freshness and completed-bar EMA behavior. Browser regressions are in `tests/browser/algo-trading.cjs`, `algo-runner.cjs` and `algo-dashboard.cjs`. They cover responsive and native-host simulation, exact lot sizing, historical failures, saved settings, pending stops, cross-tab takeover and the real dashboard entry point. Native tests simulate Capacitor; no physical APK installation is implied.
