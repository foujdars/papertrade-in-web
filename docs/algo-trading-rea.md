# Algo Trading Lab: AlgoTest investigation

Investigation date: 2026-10-18 (Asia/Kolkata). This is an independent paper-testing feature informed by public AlgoTest workflows. No AlgoTest implementation, credentials, historical options database, broker account, or private API was obtained. Public client code was inspected locally and is not redistributed in this repository.

## Evidence actually collected

REA 6.5.0 was run through its installed CLI. Its bundled `reverse-engineer-anything` skill and runtime-observation instructions were read. No MCP registration, account, or system-wide configuration was changed.

| Investigation | Actual result |
| --- | --- |
| Fresh public landing-page browser capture | `ev_9e0b004570070e65d59deea4b3ba8011d76dacca7a36c48e443c7ca5eff99e0d`. A temporary headless Edge profile at 1440 × 900 captured DOM, accessibility, URL and screenshot after an eight-second settle. The page distinguishes backtesting, forward testing, signal tools, strategy building and simulation. |
| Public forward-test route | `ev_b2af79149f2c0c80db795fbc23ecd459300c854de5aaf8298ed22575e51a6b4d`. After eight seconds the URL remained `/forward-test`, but only a blank shell and notification/alert regions were captured. This is not evidence of a working authenticated forward test. |
| Public backtest route | `ev_7b819e6347e97880958641252d7de0b2f462d1b74b02a24e069be2509961260e`. After twenty seconds the browser had redirected to `/?redirect_to=%2Fbacktest` and captured a blank shell. No backtest was submitted and no account gate was bypassed. |
| Static public client inspection | `ev_e354ee0ce9ee08d775179eed46f7b704332323951ec4688bce78c6202e8f7de8`. REA parsed one selected landing-page JavaScript bundle as inert syntax: 37,637 bytes, 6,518 visited AST nodes, 58 findings, 9 reported modules and zero parse failures. Graph coverage is explicitly partial; unresolved dependencies remain. |

The selected bundle was linked by the observed page: [official public client artifact](https://algotest.in/_next/static/chunks/pages/index-b7e061db8e146f26.js). Its SHA-256 is `25ec9b4a2e8dcc86490af0ef0507f607330e7b521b6b7f0bf616ed1f96be135d`. Its literal routes include `/backtest`, `/forward-test`, `/strategy-builder`, `/signals` and `/simulator`. Those strings establish client routing candidates, not server behavior or numerical formulas. No source maps were requested.

Full canonical REA records, scenarios, extracted accessibility, screenshots and the selected public bundle are retained locally outside the checkout in `work/algotest-research/`. The compact, committable manifest is [algo-trading-evidence.json](./algo-trading-evidence.json). Browser capture processes were owned temporary profiles and were terminated by REA after capture.

## Ghidra applicability

The existing portable Ghidra 12.1.4 installation and 64-bit JDK 21.0.12.1 were explicitly supplied to REA's provider diagnostic for this process. The diagnostic exited successfully and reported the provider available, its headless launcher and x86-64 native decompiler present, Java accepted, and Windows process-ownership controls available. Evidence is retained in `ghidra-readiness.json`.

Hopper was not installed. The requested AlgoTest target is a hosted website; the artifacts inspected here are HTML and JavaScript. No relevant AlgoTest PE, ELF, Mach-O, native addon or WebAssembly artifact was found in this limited inspected set. Ghidra therefore was checked for readiness but did not decompile an AlgoTest binary. Neither native tool can recover a hosted options backtest engine from a landing-page bundle. Absence in this selected set is not a claim about every AlgoTest asset. No unrelated executable or self-created demonstration binary was substituted to imply successful native reverse engineering.

## Public feature map and implementation decisions

The [official intraday guide](https://docs.algotest.in/Time-Based-Algo-Trading/how-to-backtest/intraday/) describes index/session selection; entry, exit and optional re-entry cutoff; options/futures legs with quantity, side, expiry and strike selection; individual protection; and overall strategy controls. Papertrade follows the leg-builder and session/risk workflow using exact available instruments. It does not infer historical ATM strikes or roll contracts from underlying prices.

The [official backtest guide](https://docs.algotest.in/Signals-AI/Validating-Your-Strategy/Backtesting/) separates the entry signal from the trade definition. It describes period selection, total P&L, trade count, win rate, drawdown and downloadable daily trade records. Papertrade uses those reporting concepts, makes transaction assumptions visible and distinguishes available historical bars from a labelled synthetic demonstration. A selected-contract candle simulation is not equivalent to an exchange tick-history options engine.

The [official forward-test guide](https://docs.algotest.in/Time-Based-Algo-Trading/forward-test/) describes saved strategies, activation, running mark-to-market, manual intervention, closing positions, trade details and history. Papertrade exposes an explicit paper session with start, pause/resume, stop, positions and events. Its foreground lifetime must remain visible; closing or hiding the workspace is not advertised as server-side strategy execution.

| Product area | Papertrade scope | Boundary |
| --- | --- | --- |
| Entry point | Home three-dot menu → Algo Trading | Shares the existing desktop, mobile and app interface. |
| Strategy definition | Scheduled or EMA entry, exact instrument legs, direction, quantity, session window, leg and basket protection | No arbitrary signal canvas, historical rolling option-chain reconstruction, lazy legs or automatic re-entry equivalence. |
| Backtesting | Available exact-contract candle history, explicit costs, trade results, equity/drawdown and CSV | Bar execution assumptions cannot reproduce tick fills, order queues or broker latency. Synthetic examples are labelled. |
| Forward testing | Foreground paper sessions driven by fresh matching quotes; saved result state | No broker order placement, unattended server runner or claim of fill execution while suspended. |
| Strategy management | Owner-scoped local strategies and JSON import/export | No AlgoTest account connection, paid entitlement or cloud synchronization is implied. |

The table records the implementation contract used during development, not a parity certification. The feature's tests and user guide are the authority for its final supported behavior. No claim is made of AlgoTest's complete strategy selection, execution reliability, pricing, regulatory permissions or proprietary results.

## Interface design tooling

The UI implementation task reported an attempted 12ui CLI installation that failed with Windows `spawn EINVAL`. A direct invocation of the cached CLI then attempted a four-candidate draft using the existing chart-interface reference. It stopped at the 12ui account sign-in requirement (`https://12ui.com/connect-cli`). No generated design candidate or paid generation is claimed. The delivered interface adapts Papertrade's existing tokens and layout; this design-tool attempt is separate from the successful REA evidence above.
