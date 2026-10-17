# Pine rebuild: evidence, runtime options and obligations

Investigation date: 2026-10-17. This document separates observed behavior, published project claims and unverified compatibility. It is not a claim that TradingView's compiler was recovered.

## Actual REA browser evidence

A fresh REA 6.5.0 public browser scenario opened `https://www.tradingview.com/chart/`, opened Pine Editor, waited for its loaded state, opened the script title menu and selected Create new. Every declared step completed; REA reports complete captured sections.

New evidence ID: `ev_75ff17a025258c32291f95610f904d6c26098dd118a8c89df854de0a60513a69`.

Retained outside the repository: `work/pine-rebuild-research/editor-templates-scenario.json`, `editor-templates-evidence.json`, `editor-templates-accessibility.txt`.

Observed public controls:

- Editor: Untitled script, Add to chart, Save script, Publish script, More, line/column status and Pine v6 reference.
- Docking: Move overlay to split-view, Collapse panel, Close.
- Title menu: Save script/Ctrl+S, disabled Make a copy and Version history for this untitled script, Rename, Move script to bottom, Create new.
- Create new submenu: Indicator/Ctrl+K then Ctrl+I, Strategy/Ctrl+K then Ctrl+S, Library, Built-in.
- Default source uses `//@version=6`, `indicator("My script")` and `plot(close)` in a code textbox with accessibility options.

The capture observed menu affordances, not successful compiler behavior or cloud persistence. No script was submitted, saved or published.

Earlier actual browser evidence remains useful: loaded editor `ev_30de8044efd6c87b6e11606b7881cbe01d415d02f6c1af5c64983a1a8bb5f6f1`; title menu `ev_6148633e1337545ec57858ef9e51e9d9d9914f1974b8f4f3ed71f31fc95d5a1d`. These are retained as `work/pine-public-settled-rea-evidence.json` and `work/pine-public-menu-rea-evidence.json`.

## Actual ASAR and Ghidra evidence reused

REA selected-source ASAR analysis `ev_e3a0a0de66caa0ac772010ebc51d698753f3fe69151607a7bbd2f5dc6e1f0b54` identifies a static desktop bridge candidate `TVD.setFocusPineEditor` → `electron.ipcRenderer.send('tvd:focus-pine-editor')`. It does not establish a compiler implementation. The ASAR digest is `a70a18bfd8f1db8d113993709d8294344545a29b3ccf7f7c3436667907023906`; 160 inventoried files were outside the selected-source scope.

Actual REA/Ghidra 12.1.4 results are retained in `work/rea-ghidra-native-overview.json` and `work/rea-ghidra-native-registration.json`. The official TradingView Desktop native bridge SHA-256 is `d7f75cc9c0f87f1918e4263e4cd037f704465371fe60cd606eee0855d87cbc41`. Ghidra recovered 2,901 procedures and 572 defined strings. Export `node_register_module_v145` is a thunk at `0x18000173a` to `0x180010ce0`; its decompiled implementation binds V8 objects to reference-counted native components.

Native overview ID: `ev_6c75e24953aa090d008546920c1d0b4ab0672ae2655e907019b723f8de091cec`. Function dossier ID: `ev_968a6a107a192d816481609a6f70e5c59e6e960fe30434c08b377edb740f251b`.

These results establish desktop Windows/native integration, not Pine language or server execution. No redundant expensive native decompilation was performed for this rebuild. TradingView's [official language introduction](https://www.tradingview.com/pine-script-docs/welcome/) describes server execution; public UI inspection cannot recover an unshipped proprietary cloud compiler.

## PineTS licensing and capability check

Authoritative [npm registry metadata](https://registry.npmjs.org/pinets) contained 71 published versions when checked: 32 declare `AGPL-3.0`, 39 declare `AGPL-3.0-only`, none declare MIT. Version 0.6.1's actual npm tarball contains an Affero GPL v3 LICENSE and matching package metadata. Earliest published 0.1.0 is already AGPL. GitHub LICENSE history points to initial release commit `7c1dde095a95a6aed14f770804a14b905ba8eb0a`; that commit's actual [LICENSE](https://github.com/LuxAlgo/PineTS/blob/7c1dde095a95a6aed14f770804a14b905ba8eb0a/LICENSE) is AGPL v3 too. No historical MIT PineTS release was substantiated.

Current [PineTS README](https://github.com/LuxAlgo/PineTS) claims native v5/v6 input, 60+ TA functions, arrays/maps/matrices, streaming, multi-timeframe requests and strategy support. Its [package metadata](https://github.com/LuxAlgo/PineTS/blob/main/package.json) identifies 0.11.1 as AGPL-3.0-only. Its [strategy documentation](https://github.com/LuxAlgo/PineTS/blob/main/docs/strategy.md) describes order and performance APIs; these are upstream claims, not independently verified TradingView parity. A separate commercial licensing option exists. An MIT integration cannot be justified by assuming an old PineTS version was permissive.

Registry version/license evidence, old tarball, initial LICENSE, license history and README snapshots are retained under `work/pine-rebuild-research/`.

## Alternatives inspected

| Project | Verified license | Useful scope | Material limitation |
| --- | --- | --- | --- |
| [Opus-Aether-AI/pine-transpiler](https://github.com/Opus-Aether-AI/pine-transpiler) | MIT, repository license metadata | Native v5/v6 compiler, PineJS and standalone host paths; browser/Node | Explicitly indicator-only; `strategy.*` execution is out of scope. Upstream feature claims require local fixtures. |
| [MeridianAlgo/Pine-A-Script](https://github.com/MeridianAlgo/Pine-A-Script) | MIT, actual LICENSE fetched | JavaScript compiler/runtime; documented series, state, TA and timeframe resampling | README explicitly calls strategy functions stubs. Actual builtins log entry/exit/order/close instead of executing a broker. Imports and financial requests are stubbed. |
| [ferranbt/pinecone](https://github.com/ferranbt/pinecone) | MPL-2.0, GitHub license metadata | Rust interpreter, strategy/indicator SDK and language server | README lists v4/v5 support. Browser/WASM packaging and v6 parity were not established here; not a drop-in JS replacement. |

The selected implementation is **PineTS 0.11.1 under AGPL-3.0-only**, following the repository owner's explicit approval to publish the application under AGPL. The permissive alternatives above were evaluated and are not the selected runtime. Keep PineTS pinned, retain its license notices, and validate its strategy outputs independently rather than assuming parity from the README. See [source and licensing](source-and-licensing.md) and [third-party notices](../THIRD_PARTY_NOTICES.md).

## Prioritized rebuild obligations

1. **Execution correctness:** structured parse/compile diagnostics, original source positions, series/history and persistent-state semantics, bounded worker execution/cancellation, deterministic per-bar outputs. Preserve the existing bounded interpreter only where its behavior is supported; surface unavailable constructs instead of silently substituting values.
2. **Chart host completeness:** typed plot outputs, overlays/separate panes, input schemas and reruns, dynamic colors, fills/shapes/labels/tables and removal lifecycle. Every exposed renderer needs a fixture proving time alignment and cleanup.
3. **Strategy integrity:** an actual broker with next-bar fill timing, long/short position transitions, exits, pyramiding, commissions/slippage and a dated trade ledger before reporting equity or drawdown. Do not turn logged strategy calls into fabricated backtests.
4. **Editor workflow:** indicator/strategy/library templates, script management, source-aware diagnostics, keyboard shortcuts, dirty-state protection and version persistence. Distinguish local persistence from TradingView cloud publishing.
5. **External data and alerts:** explicit provider/timeframe/session contracts, lookahead/gap handling and replay-vs-realtime behavior. Declare unsupported data calls. Alert condition evaluation is separate from a persistent server alert delivery service.
6. **Conformance and product claims:** publish the supported subset and known gaps; test representative scripts bar-by-bar and strategies trade-by-trade against fixed expected results. A large namespace count or upstream README parity slogan is not conformance evidence.

Unknowns remain: proprietary TradingView compiler internals; complete v6 compatibility; arbitrary library imports; protected/invite-only script execution; TradingView account/cloud publishing; identical tick/repaint, multi-symbol and strategy-fill semantics. The rebuild should document these boundaries rather than claim full recovery.
