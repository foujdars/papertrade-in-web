# Indicator studio

Functions now opens a searchable library with All, Favourites and On chart views,
category chips, per-study settings and chart controls. Active lower panes have
compact hide/settings controls (and remove where the chart owns its selection).
Price-chart indicator names remain in the status row rather than across candles.
Existing EMA/SMA selections and their colours are retained.

## Editing

Inputs expose each study's relevant parameters. RSI supports source, period,
SMA/EMA/RMA/WMA smoothing and upper/lower levels. ADX separates DI length from
ADX smoothing. Style supports colours, width, dash, opacity and last-value labels;
colour slots are in output order. Directional histograms use the first two
colours; Chop Zone retains its categorical nine-colour interpretation. Some
multi-line studies cycle through the seven available colour slots.

Visibility can hide a study without removing it and restrict it to chosen chart
timeframes. An empty timeframe list means all timeframes. Apply commits the
draft; Cancel discards it; Reset changes the draft to defaults. Settings and
favourites persist locally on the device. Selected studies continue using the
existing account-scoped selection preference. These edits do not alter saved
technical alert rules or add new alert types. SMC stays in the existing learning
panel; SMC technical alerts remain excluded.

The library prevents adding more than six visible lower-pane studies through
its Add action to keep mobile charts usable. It does not impose a six-study cap
on price overlays.

## Reference coverage and limitations

The attached recording was inspected frame-by-frame. Its candle-based studies
are represented, including Coppock, ADX/DMI, Aroon, ATR, RSI, stochastic studies,
MACD, moving-average families, Ichimoku boundaries, price channels, volume,
volatility and regression studies, VWAP/VWMA, SAR, fractals and Zig Zag.

- Fixed-range volume profile opens the existing range drawing. Visible-range
  profile is an OHLCV approximation over the visible candles, not tick-level
  exchange volume-at-price.
- Ratio, Spread and both correlation studies allow a comparison instrument
  selected from the supported built-in stocks and NIFTY/BANK NIFTY. They refresh
  comparison history every 60 seconds. Only exact timestamp matches are used;
  both newest bars are excluded. Missing timestamps are gaps, never forward-filled.
  Comparison requests are aborted on change/unmount, grouped by symbol and not
  made during replay. Missing comparison history shows a waiting message.
- Advance/Decline is explicitly unavailable: exchange-wide market breadth is
  not supplied by the selected-symbol candle feed.
- The recording's generic Volatility Index is explicitly unavailable because
  its intended formula is not identified. No implied-VIX or ATR proxy is silently
  substituted. ATR and the named historical-volatility measures are available.

This is an independently implemented indicator library, not Pine execution or
a guarantee of numerical parity with every TradingView version/default. Warm-up,
loaded history, rounding and the chosen formula variant matter. Notable details:

- Averages and Wilder studies wait for full seed windows; no invented early RSI.
- Undefined ratios are gaps; no Infinity or made-up volume is plotted. Volume
  studies show a missing-data message when the instrument has no real volume.
- EMA seeds with an SMA of the initial full window. Historical volatility uses
  log returns and configurable annualization; OHLC uses the Garman–Klass estimate.
- DPO is causal/unshifted. Regression error is residual standard error. The
  Hamming average uses a normalized symmetric Hamming window.
- Ichimoku is drawn with five lines (cloud boundaries, not filled cloud shading).
  Ichimoku/Alligator displacement stops at loaded chart timestamps rather than
  inventing future exchange-session timestamps.
- Fractals wait for right-side confirmation and exclude the last forming candle.
  Zig Zag's latest leg is revisable; neither is an automatic trade signal.
- Pivots use the previous loaded IST session, or previous bar on higher-period
  charts; they do not silently request a separate daily reference feed.
- Session VWAP uses the loaded session's candle volumes; partial session history
  can differ from a full-session platform feed.

Reference checks included TradingView's published explanations of
[ADX](https://www.tradingview.com/support/solutions/43000589099-average-directional-index-adx/),
[DMI](https://www.tradingview.com/support/solutions/43000502250-directional-movement-dmi/),
[RSI smoothing](https://www.tradingview.com/support/solutions/43000742042-i-see-a-smoothing-section-in-an-indicator-s-settings-what-does-it-do/),
[Relative Vigor](https://www.tradingview.com/support/solutions/43000591593-relative-vigor-index/)
and [SMI Ergodic](https://www.tradingview.com/support/solutions/43000594669-smi-ergodic-indicator/).
No buy/sell recommendation is inferred from these indicators.

## Verification

`tests/study-calculations.test.mjs` covers every selectable candle calculation,
finite/gap handling, no future-data reads, known Wilder RSI values, ADX warm-up,
independent ADX lengths, missing volume, settings sanitation, exact comparison
alignment and SMI ratio scaling. It runs as part of `npm test`.

`tests/browser/indicator-studio.cjs` uses the real chart and UI with isolated
storage and deterministic data. It exercises input/style application, restart,
cancel, hide/show, timeframe restriction, invalid input, four widths, dark theme,
comparison fetching, rendering families and pane-removal ordering. Existing
drawing, chart-label and live-candle/viewport regressions remain in use.

Builds and browser emulation are not a physical Android-device acceptance test.
