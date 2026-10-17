# Pine-compatible indicator editor

Open **Pine Editor** in the chart indicator strip. Pick a starter or paste a supported indicator, then **Compile** and **Add to chart**. `Ctrl/Cmd+Enter` applies; `Ctrl/Cmd+S` saves on this device. Editing or saving does not silently replace the chart's applied version. Failed compilation leaves the last successfully applied indicator intact. A runtime error after changing chart history removes stale custom plots and shows the error.

The editor provides named scripts (up to 30), local persistence, desktop `.pine` import/export, input controls, diagnostics, and condition previews. Templates include an EMA crossover, RSI, and volatility bands. One custom indicator is applied at a time alongside built-in studies. `overlay=true` draws on price; otherwise the script gets its own pane. Live updates, symbol/timeframe changes, and replay use the same visible candle data path as built-in indicators.

## Compatibility contract

This independently implemented interpreter supports a bounded **Pine v5/v6 indicator subset**, not TradingView's complete language, compiler, cloud service, or editor. It parses expressions; it never evaluates source as JavaScript. Unsupported syntax/arguments report a source line.

| Area | Supported |
| --- | --- |
| Declaration | `indicator(title, shorttitle, overlay)`; optional `//@version=5` or `6` |
| Inputs | Direct assignments to `input.int`, `input.float`, `input.bool`, `input.source`; titles, numeric bounds and step |
| Values | OHLCV, `hl2`, `hlc3`, `ohlc4`, epoch-millisecond `time`, `bar_index`, numbers, strings, booleans, `na` |
| Expressions | Arithmetic, comparisons, `and/or/not`, ternary, constant nonnegative history indexing, assignments |
| Technical analysis | `ta.sma`, `ta.ema`, `ta.rma`, `ta.rsi`, `ta.atr`, `ta.stdev`, `ta.highest`, `ta.lowest`, `ta.crossover`, `ta.crossunder` |
| Math | `math.abs/sqrt/log/log10/exp/floor/ceil/round/sin/cos`, two-argument `min/max/pow`, `na`, `nz` |
| Display | `plot` title, color, width 1–4, line/histogram/columns/points, loaded-bar offset; numeric `hline` with title/color; named colors and `color.new` transparency |
| Conditions | `alertcondition` title/message plus historical closed-candle counts and previous closed-bar status |

No strategies/orders/backtesting, `request.security`, loops, user-defined functions, arrays, imports, drawing objects, reassignment/`var`, or complete Pine type/execution semantics. Conditional expressions are evaluated as bounded series expressions. Plot columns use the chart's histogram renderer; circles/cross styles use point markers. Plot offsets only address loaded candles, with no future calendar extrapolation. Horizontal levels do not expose the full Pine style API.

Condition status is a **local preview** on this chart, not a saved server alert or push subscription. The newest candle is conservatively treated as forming and excluded from closed-candle counts, including when the exchange is closed. History length, data corrections, and the initial EMA seed can affect results. A script on replay cannot inspect unrevealed candles. No cross-platform parity certification is claimed.

Bounds: 32,000 source characters, 20,000 loaded candles, 8 million interpreted work units, 64 expression nesting levels, rolling lengths up to 5,000, and 32 plots/levels/conditions each. Budget failures clear partial output. Inputs are validated before use; scripts have no file, network, JavaScript, or order-execution access.

## REA and Ghidra findings

Actual REA 6.5.0 analysis of three selected sources in official TradingView Desktop 3.4.1.8194 recovered Pine focus IPC (`setFocusPineEditor` → `tvd:focus-pine-editor`). Evidence `ev_e3a0a0de66caa0ac772010ebc51d698753f3fe69151607a7bbd2f5dc6e1f0b54`; 9,677 AST nodes visited, zero selected-file parse failures, 160 files outside that selected scope.

Actual REA public-browser capture opened Pine Editor and observed the default v6 indicator, editor textbox, Add to chart, Save, Publish, and docking controls. Evidence `ev_30de8044efd6c87b6e11606b7881cbe01d415d02f6c1af5c64983a1a8bb5f6f1`. The title menu exposed Save, Rename, Create new, docking, and disabled copy/history actions: `ev_6148633e1337545ec57858ef9e51e9d9d9914f1974b8f4f3ed71f31fc95d5a1d`. No TradingView account, saved script, compilation, or publication was used.

Prior actual REA/Ghidra native analysis is reused: overview `ev_6c75e24953aa090d008546920c1d0b4ab0672ae2655e907019b723f8de091cec`; registration decompilation `ev_968a6a107a192d816481609a6f70e5c59e6e960fe30434c08b377edb740f251b`. It establishes V8/native desktop bindings, not a recovered Pine compiler. No original Pine engine was recovered or incorporated. [TradingView's introduction](https://www.tradingview.com/pine-script-docs/en/v5/Introduction.html/) describes execution on its servers. Official [execution](https://www.tradingview.com/pine-script-docs/language/execution-model/), [inputs](https://www.tradingview.com/pine-script-docs/concepts/inputs/) and [plot](https://www.tradingview.com/pine-script-docs/concepts/plots/) documentation informed the compatibility boundary.

The 12ui design CLI was attempted and required a separate account sign-in; the implementation extends existing Papertrade styles. It does not claim a completed hosted design workflow.

## Validation

`npm run test:pine` checks exact numerical fixtures, missing values, causality, parser rejection, budgets, persistence failure handling, templates, and renderer coexistence/update/error behavior. `tests/browser/pine-editor.cjs` mounts the real chart/editor against deterministic market data and verifies applying scripts, inputs, saving/reloading, diagnostics, live-result replacement, pane placement, removal, 320/390/768/1280 widths, and dark styling. Run with an installed Playwright browser. Build and TypeScript checks cover integration. No live orders or production data are changed by the tests.
