# Pine reference comparisons

The app's own tests are not a TradingView certification. This tool compares actual
runtime plots with a separately supplied CSV, candle by candle, using the same
OHLCV history. It exits with an error for numeric differences, missing plots,
missing-value differences, duplicate titles, ambiguous timestamps or mismatched
history. Reports retain source/CSV hashes, the tolerances and the first 100
differences. Nothing is silently accepted because a chart looks similar.

## Compare an exported TradingView indicator

1. Run your script on TradingView with uniquely named `plot` outputs. Include
   Volume, use standard candles and export chart data with UNIX timestamps.
2. Save the exact script as `indicator.pine` and the chart export as `reference.csv`.
3. Run this from the repository with Node 22.13+:

```sh
node --experimental-strip-types scripts/compare-pine-reference.mjs --script indicator.pine --reference reference.csv --timeframe 5 --symbol NSE:RELIANCE --report comparison.json
```

TradingView documents CSV exports containing OHLC and script plot columns in its
[indicator FAQ](https://www.tradingview.com/pine-script-docs/faq/indicators/).
The parser requires `time,open,high,low,close,volume` (case insensitive) and at least
one numeric plot column. UNIX seconds, UNIX milliseconds and ISO timestamps with
explicit offsets are supported. Empty cells and `na` remain missing values.

Use `--inputs inputs.json` for the same input overrides in both runs. Use
`--context context.json` for matching session, timezone, tick size, symbol metadata
and explicitly supplied security datasets. Additional feeds are not downloaded by
the comparison tool. Use `--columns mapping.json` to select or rename exported
columns: `{"Exported column":"Pine plot title"}`. By default every non-OHLCV
column must match a runtime plot, including names; there is no fuzzy matching.

Absolute and relative tolerances default to `1e-8`. The rule is
`abs(actual - expected) <= absolute + relative * abs(expected)`.
`--skip-bars N` explicitly skips initial comparison bars; it does not remove them
from runtime initialization. Use the same loaded history on both sides: an EMA,
RSI or persistent variable can differ when the export starts later than the
history TradingView used. Preserve matching adjustments, sessions, gaps and
timeframe boundaries. Match historical closed bars; this is not a live-tick test.

The CLI executes trusted local source in the developer process. The app's editor
continues using its isolated worker. This tool checks numeric plots, not strategy
trade exports, realtime rollback, cloud alerts or rendering. A passing report
establishes only the supplied script/data/parameter comparison. It labels the CSV
as user-supplied because its origin cannot be authenticated automatically.

## Checked-in independent fixture

`tests/fixtures/pine-reference/arithmetic.csv` is **hand calculated**, not exported
from TradingView and not generated from PineTS. Its closes are 10 through 15.
Three-bar SMA is the arithmetic mean; EMA has alpha `2/(3+1)` and starts at 10;
the previous-close column lags one bar; three-period RSI first becomes 100 after
three positive changes. These 24 observations validate the comparison mechanism
and those specific calculations. The CSV tests also deliberately introduce bad
values, missing plots and misaligned history to ensure comparison failures work.
