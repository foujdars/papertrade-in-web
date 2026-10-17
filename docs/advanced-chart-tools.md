# Advanced chart tools

This change extends the existing chart engine and settings panels. It does not replace the app shell or change the trading/order engine.

## Regression Trend

Choose Regression Trend from Drawings and place the beginning and end of the sample. The channel now fits actual candle closes by least squares over bar positions. Outer lines are two population standard deviations of the residuals from the fitted line. Its label shows Pearson correlation and sample size. Endpoint handles sit on fitted prices; dragging an endpoint changes its time/sample, not the fitted price. Existing saved drawings keep their anchors but now render from prices instead of screen-distance geometry.

Intraday endpoints map to their containing candle when changing intervals, including session-aligned hourly candles. Calendar endpoints use the existing frame mapping. Missing closes or fewer than two selected candles produce no channel. Replay uses only its available candle slice. The channel does not influence chart autoscaling.

## Ichimoku Cloud

Functions > Ichimoku Cloud now fills the space between leading spans. Fill changes at the interpolated crossing, respects displacement, and leaves unavailable history empty. Inputs contains Cloud fill (0 off / 1 on). Style colours 6 and 7 control the bullish and bearish fills. Existing opacity also controls fill strength. Projection remains bounded to loaded timestamps; future exchange sessions are not fabricated.

## Anchored VWAP bands

Functions > Anchored VWAP > Settings exposes Deviation band multiplier (0 off), from 0 to 5. Zero preserves the unbanded default. Bands use volume-weighted population deviation of the selected candle source. The default source is HLC3. Style colours 1, 2 and 3 control VWAP, upper and lower bands. Width, dash and opacity now apply to the overlay, and timeframe visibility is respected. The anchor still uses the existing click/Move VWAP here interaction. Zero or unavailable volume never creates a new weighted observation. Calculations are cached on data/settings updates rather than recalculated on every canvas paint.

## MACD histogram

Positive rising/fading and negative recovering/falling bars now have four separate colours. Style slots 1/2 remain MACD/signal lines; slots 3/4/5/6 are the four histogram states. The MACD numerical formula is unchanged.

## Investigation

REA 6.5.0 analyzed the installed lightweight-charts-drawing 0.1.1 bundle as inert JavaScript. Evidence ev_3030cea4eff9f542126f84eae6fb4248478df915deea77b8f8c32ec750bd1ad7 identifies calculateRegression at bundle lines 3900-3906. Its original width is max(10, screenLineLength * 0.1), not a candle residual statistic. This motivated the data-driven replacement. The selected-file graph has partial semantic coverage at its per-file node ceiling; this finding is local to that method. No native binary or proprietary TradingView implementation was decompiled. Ghidra is not configured and is unnecessary for these JavaScript changes.

Public behavior references:
- https://www.tradingview.com/chart/QQQ/epghWRxQ-Using-Linear-Regression-Channels/
- https://www.tradingview.com/support/solutions/43000589152-ichimoku-cloud/
- https://www.tradingview.com/blog/en/vwap-improvements-across-the-board-28974/
- https://www.tradingview.com/support/solutions/43000502344-moving-average-convergence-divergence-macd-indicator/

Independent implementation of these selected features does not imply full TradingView or Pine Script parity.

## Verification

- New unit coverage: known regression residuals/correlation, instance isolation and replay sample bounds, restore and clone, frame conversion, fitted handles, weighted VWAP variance/source, cloud crossing/gaps, compatible settings defaults, MACD histogram colours.
- tests/browser/advanced-chart-tools.cjs: actual chart/settings components, saved regression, displaced cloud/toggle, all four histogram colours, VWAP bands/apply/reload, replay truncation, light/dark and widths 320/390/768/1280.
- Existing indicator studio browser regression remains in use.
