# Desktop chart rebuild: REA and Ghidra investigation

Date: 2026-10-17. Scope: public UI observation and existing shipped-artifact evidence, guiding an independent Papertrade implementation. No original TradingView chart engine or proprietary library was recovered or added to the repository.

## Fresh actual REA browser observations

REA 6.5.0 launched fresh headless Edge profiles against `https://www.tradingview.com/chart/`, with an explicit 1440 × 900 viewport and no account login. The exact scenarios, raw Evidence JSON, extracted accessibility snapshots and PNGs are retained outside this repository in `work/chart-rebuild-research/`.

| Scenario | Evidence ID | Observation |
| --- | --- | --- |
| Settings, initial 1-second settle | `ev_3e6c29989726cbdf5dd563f4344c81b598b5242bbb6e762d787c37ac32b27c32` | Click succeeded but settings module was still loading; not used as proof of loaded controls. |
| Settings, 8-second settle | `ev_a949928d63435628f482462f3069e8f2e79122ec42528f9353c3884bf3390df2` | Loaded Settings dialog and Symbol controls. Screenshot `settings-settled.png` was visually inspected. |
| Object tree, initial settle | `ev_21029a9e415dbe16dcb2a43503b691ebd589b7dc242af92218de3bcc99997782` | Object tree/Data window tabs appeared; remaining content was loading. |
| Object tree, 8-second settle | `ev_1397da633e18d9a82bcc563e71550621ef2007e9233732ff3317a186a01d9ecd` | Loaded tree toolbar and current symbol/volume entries. |
| Settings → Scales and lines → Canvas | `ev_e0171b26c47cbd6a7d60b7e9e8af644a4b928309b31c1545e78d636162fb1fa5` | Successfully visited both tabs; intermediate accessibility retained after every step. |
| Object tree → Data window | `ev_677fbdf245c20b1766e6b189fc13ecda1152849b4c63b8227cf829394ae490fb` | Loaded selected-candle date, OHLC, change, volume and indicator output rows. |

The loaded Settings dialog has Symbol, Status line, Scales and lines, Canvas, Trading, Alerts and Events tabs. Symbol exposes previous-close coloring, independent candle Body/Borders/Wick toggles with paired color controls, dividend adjustment, precision and timezone; footer has Template, Cancel and Ok. These observations establish visible controls, not every option's persistence or calculation semantics.

The loaded Object tree panel has separate Object tree and Data window tabs. Its toolbar offers create group, clone/copy and move-to, disabled without selection, plus Manage layout drawings. Entries include the main AAPL symbol and volume. Selection-disabled actions were not represented as successful editing operations.

The fresh Scales and lines visit exposes currency/unit and scale-mode visibility, lock-price-to-bar ratio, scale placement, label overlap control, plus button, countdown, symbol/indicator/high-low/bid-ask label/line selectors, date format, 24-hour format and an interval-change left-edge option. The Canvas visit exposes solid background, separate vertical/horizontal grid controls, crosshair, scale text size/lines, navigation/pane-button visibility, and top/bottom/right margins. Concise snapshots are `scales-settle-controls.txt` and `canvas-settle-controls.txt`; these controls were observed, not modified or exhaustively validated.

The fresh Data window visit shows a selected date plus symbol OHLC, absolute/percent change, volume and last-day change; an indicator row reports its computed Volume value. Each data group offers Hide data. Screenshot and accessibility are `data.png` and `data-accessibility.txt`.

Fresh captures also establish the top toolbar's symbol/data type, comparison, timeframe, chart style, indicators, indicator templates, alert, replay, layout, save/manage layouts, quick search and settings affordances. The left rail groups cursor/trend/Fibonacci/pattern/measurement/geometry/annotation/icon tools and magnet/stay-in-drawing/lock/hide/remove controls. These are public tradingview.com observations; they must not all be labeled features of the smaller Advanced Charts library.

## Fresh actual REA ASAR analysis

The official TradingView Desktop 3.4.1.8194 ASAR was analyzed again with a new focused selection: `preload/platform-preload.js` and `app/window/bundle.js`.

Evidence ID: `ev_41aad8371211ec7314e8396053017ffa2b74a72236fa1b0a111122b64fdae919`.

Root ASAR SHA-256: `a70a18bfd8f1db8d113993709d8294344545a29b3ccf7f7c3436667907023906`. REA parsed 2 selected JavaScript files, visited 14,310 AST nodes and recovered 168 findings/27 modules, with zero selected-file parse failures. 161 inventoried files were outside selected analysis scope.

Static relationships include `tvd:layout-restored`, `tvd:layout-change` and `tvd:crosshair-sync-setting-update`. Focused graph nodes are retained in `desktop-asar-focused-nodes.json` with the full record in `desktop-asar-evidence.json`. These establish desktop coordination candidates, not runtime execution, full storage behavior or chart drawing algorithms.

## Actual Ghidra evidence reused, with matching artifact verified

Existing REA/Ghidra 12.1.4 analysis of official `tvdbridge.node` remains applicable. A fresh file hash check matches its original SHA-256 `d7f75cc9c0f87f1918e4263e4cd037f704465371fe60cd606eee0855d87cbc41`.

- Native overview: `ev_6c75e24953aa090d008546920c1d0b4ab0672ae2655e907019b723f8de091cec`, retained at `work/rea-ghidra-native-overview.json`: PE x86-64, 2,901 recovered procedures, 572 defined strings.
- Actual exported-registration decompilation: `ev_968a6a107a192d816481609a6f70e5c59e6e960fe30434c08b377edb740f251b`, retained at `work/rea-ghidra-native-registration.json`: `node_register_module_v145` thunk `0x18000173a` → `0x180010ce0`, V8 object/native component binding.

Native observations concern Windows window placement, raw input, hardware support, updates and V8 integration. They do not establish that chart settings, indicators or server alerts live in this native bridge. The identical decompilation was not rerun merely to inflate tool usage. Portable Ghidra/JDK and original evidence remain available; no unrelated executable was analyzed.

## Official Advanced Charts boundaries

The [official introduction](https://www.tradingview.com/charting-library-docs/latest/introduction/) describes Advanced Charts as a separately licensed embeddable product. [Library availability](https://www.tradingview.com/free-charting-libraries/) describes public/company use and visible attribution conditions. The [getting-started guide](https://www.tradingview.com/charting-library-docs/latest/quick-start/) directs developers to official access-controlled repositories. Public documentation or a public demo does not itself grant source redistribution rights. Do not place proprietary library files or unofficial leaks in this AGPL repository.

[Object tree documentation](https://www.tradingview.com/charting-library-docs/latest/ui_elements/object-tree/) describes drawings/indicator/symbol management and distinguishes its toolbar location between Advanced Charts and Trading Platform. [Save/load documentation](https://www.tradingview.com/charting-library-docs/latest/saving_loading/) distinguishes chart layouts, indicator templates and separately stored user settings; chart/drawing template availability differs by product. Multi-chart layouts, broker functionality and the full tradingview.com service should not be inferred from a basic library demo.

[Customization](https://www.tradingview.com/charting-library-docs/latest/customization/) separates chart overrides, theme APIs, featuresets and constructor configuration. [Drawings API](https://www.tradingview.com/charting-library-docs/latest/ui_elements/drawings/drawings-api/) discusses time-point snapping and drawing lifecycle. These public contracts can guide independent behavior and tests, without copying proprietary code.

## Priorities against the starting Papertrade app

This is a baseline audit, not a claim that every listed gap remains after the rebuild. The starting app already has Lightweight Charts, chart types, indicators/Pine, comparison, drawing catalogs, horizontal rays, drawing Style/Text/Coordinates/Visibility dialogs, lock/hide/delete, drawing alerts and drawing persistence. It also has a modal `DrawingObjects` list. Avoid rebuilding these as disconnected duplicate systems.

1. Consolidate desktop chart preferences into a real tabbed settings workflow. Draft changes should have explicit Apply/Cancel/reset behavior; preferences must drive the chart engine, not only styled controls. Preserve mobile/native behavior and defaults.
2. Expand object management from a modal drawings list into a coherent desktop object tree: main symbol, indicator instances and drawings, with selection, visibility, locking, settings and deletion synchronized with the chart. Do not promise groups/reordering unless implemented.
3. Add a data inspector tied to the hovered or latest loaded candle, including OHLCV and actual computed study outputs; distinguish missing/warm-up values and replay-revealed data. A decorative static panel is not a Data window equivalent.
4. Keep toolbar/menu semantics consistent across indicator, drawing, chart and price-scale settings; preserve undo/redo, focus, keyboard escape, coordinate anchoring and updates under symbol/timeframe/history changes.
5. Define layout/template persistence separately from device-level preferences and per-symbol drawings. Local-only storage must not be labeled TradingView cloud synchronization.
6. Verify functional canvas effects, lifecycle cleanup, screenshots, desktop scope and mobile/native exclusions. Tool counts and visually similar menus do not establish library parity.

## Explicit unknowns

No access to proprietary chart-engine implementation, complete TradingView source, account/cloud storage, server alert scheduling or full Advanced Charts license grant was established. Observation covers a public default chart and selected tabs, not every menu option, drawing category or product plan. No pixel-perfect, numerical, licensing or complete feature-parity certification is claimed.
