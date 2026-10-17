# Pine editor

Papertrade's desktop browser editor runs native Pine v5/v6 scripts through **PineTS 0.11.1**. Compatibility is experimental: this is an independent runtime, not TradingView's compiler, account service or publishing platform. See the [compatibility matrix](pine-runtime-compatibility.md) for verified behavior and exclusions.

## Open and use the editor

Open **Functions (fx) → Pine Editor** or the chart's Pine Editor control. Search the Functions menu for “pine”, “script” or “editor”. In the two-chart F&O workspace this opens the option chart's editor.

On a desktop browser, choose an indicator or strategy template, or import native `.pine` source beginning with `//@version=5` or `//@version=6`. **Compile** runs against loaded chart history and reports diagnostics. **Add to chart** applies the successful result. Ctrl/Cmd+Enter applies; Ctrl/Cmd+S saves locally. Editing or saving a draft does not silently replace the applied script. A failed draft run preserves the last applied result; errors when rerunning an applied script on changed chart data clear its stale custom output.

The Monaco editor provides highlighting, completion, hover reference, folding, bracket matching, undo and find/replace. Runtime validation remains authoritative; completion suggestions are not a promise that every Pine namespace or argument works. Inputs, conditions, logs, strategy results and local version history appear in the editor's panels. Named scripts, `.pine` import/export and saved revisions stay on this device. One custom script is active per chart, alongside built-in indicators. `overlay=true` uses the price pane; other scripts use a separate pane.

Strategies use PineTS's historical broker simulation and produce a trade ledger and sampled equity. They do not place live or paper orders. Fees, slippage, history and OHLC fill assumptions affect results. Net profit reports closed trades; equity can include open P/L. Conditions are chart previews, not saved server alerts or push subscriptions. The preview excludes the newest candle from its closed-bar count.

## Desktop, mobile and Android scope

The advanced path is enabled only for a web terminal on a viewport at least 941px wide with hover and a fine pointer, and never for a native Capacitor platform. Narrow/mobile browsers and native Android keep the existing textarea editor and bounded indicator-only interpreter. They do not gain PineTS strategies, its broader language execution or Monaco from this change.

The active desktop selection has a separate storage key from the legacy mobile/native selection. The named-script library is shared local device storage, so an advanced script can still appear in a mobile script list; the legacy interpreter reports unsupported constructs rather than executing them as PineTS. Switching layout/platform cancels pending advanced runs and clears cached advanced visuals before loading the selection for that mode.

## Data and execution boundary

Runs use supplied OHLCV history. Chart-symbol `request.security` data can use supported feed timeframes with lookahead off; additional timeframe fetching is disabled during replay. Other symbols, financial/economic data calls, remote libraries and arbitrary URLs are unavailable through the chart host. Even the legitimate non-repainting `expression[1]` with `barmerge.lookahead_on` pattern is rejected by this product's conservative gate. No full tick or repainting parity is promised.

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
npx tsc --noEmit
npm run build
```

Browser tests need Playwright and an installed Chromium browser. `PLAYWRIGHT_MODULE_PATH` can select an existing installation. Runtime tests cover numerical fixtures, state, causal prefixes, broker fills/costs, source rejection and bounded execution. Visual tests run actual PineTS scripts before checking normalization and canvas geometry. Browser fixtures cover real Monaco, sandbox isolation/cancellation, application behavior and mobile/native exclusions. Passing these fixtures is not a complete TradingView conformance certification.
