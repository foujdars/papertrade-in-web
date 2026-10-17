# Pine editor

Papertrade's shared editor runs native Pine v5/v6 scripts through **PineTS 0.11.1**. Compatibility is experimental: this is an independent runtime, not TradingView's compiler, account service or publishing platform. See the [compatibility matrix](pine-runtime-compatibility.md) for verified behavior and exclusions.

## Open and use the editor

Open **Functions (fx) → Pine Editor** or the chart's Pine Editor control. Search the Functions menu for “pine”, “script” or “editor”. In the two-chart F&O workspace this opens the option chart's editor.

On a desktop browser, choose an indicator or strategy template, or import native `.pine` source beginning with `//@version=5` or `//@version=6`. **Compile** runs against loaded chart history and reports diagnostics. **Add to chart** applies the successful result. Ctrl/Cmd+Enter applies; Ctrl/Cmd+S saves locally. Editing or saving a draft does not silently replace the applied script. A failed draft run preserves the last applied result; errors when rerunning an applied script on changed chart data clear its stale custom output.

The desktop editor docks below or beside the chart, with a draggable and keyboard-accessible divider, a fullscreen workspace and remembered layout. The chart remains mounted while editing. Monaco provides highlighting, namespace and local-symbol completion, signatures, hover reference, folding, bracket matching, undo and find/replace. Runtime validation remains authoritative; completion suggestions are not a promise that every Pine namespace or argument works. Inputs, conditions, logs, strategy results and local version history appear in the editor's panels. Named scripts, recoverable drafts, `.pine` import/export and saved revisions stay on this device. One custom script is active per chart, alongside built-in indicators. `overlay=true` uses the price pane; other scripts use a separate pane, while supported `force_overlay` outputs can route to the price pane individually.

Strategies use PineTS's historical broker simulation and produce a trade ledger and sampled equity. They do not place live or paper orders. Fees, slippage, history and OHLC fill assumptions affect results. Net profit reports closed trades; equity can include open P/L. Conditions are chart previews, not saved server alerts or push subscriptions. The preview excludes the newest candle from its closed-bar count.

## Desktop, mobile and Android scope

The shared PineTS runtime runs on desktop, mobile browsers and native Capacitor. The desktop workspace docks when there is at least 941px of width, hover and a fine pointer. Touch and native devices use the full-screen touch editor with indentation and find/replace, rather than loading Monaco. They run the same scripts, inputs and strategy simulations.

The advanced active-script selection and named-script library are shared across layouts on the same device. They do not sync between different devices or accounts. The old legacy selection key remains distinct for migration compatibility. Resizing the desktop dock does not unmount the chart or discard the applied script.

## Data and execution boundary

Runs use supplied OHLCV history. `request.security` can resolve exact symbols on connected NSE/BSE/Delta feeds and supported indices, with exchange-specific metadata. Up to eight additional symbol/timeframe datasets are allowed per run. Exchange prefixes are retained; unsupported or ambiguous symbols produce an error instead of substituting another instrument. Additional feeds remain disabled during replay because complete higher-timeframe candles would expose unrevealed data. Proven historical-offset expressions with `barmerge.lookahead_on` are accepted; unsafe or unproven patterns remain rejected. Financial/economic data calls, remote libraries and arbitrary URLs are unavailable. No full tick or repainting parity is promised.

The pinned PineTS adapter corrects EMA initialization to TradingView's documented first-sample recurrence and distinguishes historical final bars from live bars. See [reference comparisons](pine-reference-comparison.md) for numerical checks, CSV comparisons and their limits. This is an independent runtime with tested compatibility improvements, not TradingView's compiler.

PineTS transpiles source to JavaScript internally. That generated code executes in a worker owned by an opaque-origin sandboxed iframe, with direct network access blocked by CSP. A private channel supplies chart data and constrained host data requests. It does not execute in the authenticated app context. The native-source gate rejects JavaScript mode and direct host API names; this is a defense boundary, not a claim that parsing alone makes arbitrary generated code safe. Timeout, cancellation and sandbox tests cover the intended boundary.

## License and source

The repository owner approved using PineTS and publishing the application under **AGPL-3.0-only**. The desktop editor includes a public source/license link. See [source and licensing](source-and-licensing.md), [LICENSE](../LICENSE) and [third-party notices](../THIRD_PARTY_NOTICES.md). Monaco remains MIT-licensed. Deployed source must correspond to the running revision.

## REA and Ghidra evidence

Actual REA public captures observed editor, docking and script-menu controls. The new Create new capture (`ev_75ff17a025258c32291f95610f904d6c26098dd118a8c89df854de0a60513a69`) shows Indicator, Strategy, Library and Built-in choices. Papertrade does not claim to implement the observed Library/cloud workflows. Prior real REA/Ghidra analysis establishes TradingView Desktop's Windows/V8 bridge, not a recovered Pine compiler. Exact evidence IDs and limitations are recorded in [the research report](pine-rebuild-rea.md).

## Developer validation

Build the offline worker with `npm run build:pine`; it is also run by the development/build hooks. Then run:

```sh
npm run test:pine
npm run test:pine:advanced
node tests/browser/pine-sandbox.cjs
node tests/browser/pine-rebuild.cjs
node tests/browser/pine-editor-workflow.cjs
node tests/browser/pine-chart-fidelity.cjs
npx tsc --noEmit
npm run build
```

Browser tests need Playwright and an installed Chromium browser. `PLAYWRIGHT_MODULE_PATH` can select an existing installation. Runtime tests cover numerical fixtures, state, causal prefixes, broker fills/costs, source rejection and bounded execution. Visual tests run actual PineTS scripts before checking normalization and canvas geometry. Browser fixtures cover real Monaco, sandbox isolation/cancellation, docking, application behavior and the shared mobile/native runtime. Passing these fixtures is not a complete TradingView conformance certification.
