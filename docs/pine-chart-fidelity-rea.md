# Pine and chart fidelity work — 2026-10-18

This change improves the independent Papertrade chart and native Pine adapter.
It does not incorporate TradingView's private Advanced Charts package or recover
its server compiler. The GitHub connector returned 404 for
`tradingview/charting_library`; access was not available through that connection.
TradingView's [custom-study documentation](https://www.tradingview.com/charting-library-docs/latest/custom_studies/)
also explicitly excludes Pine Script from the embeddable libraries.

## Fresh REA observations

REA **6.5.0** ran real browser scenarios with Edge in a fresh profile. The
artifacts remain in the task workspace's `work/pine-fidelity-research/`, outside
the application repository. Only the following bounded findings are claimed:

| Scenario | Evidence | Observation |
| --- | --- | --- |
| Open Pine Editor, press Add to chart | `ev_5fea4e9868f6846f499a70a2bd151e401072ba6990f0bcbc682dfaf919489ac8` | All six steps completed; compiling the default script led to sign-in. No live calculation comparison was obtained. |
| Open Pine Editor, switch overlay to split view | `ev_9b20059d5059fb508fe388789abf01882b09c00c676205ca10f800a160472879` | All six steps completed; screenshot/accessibility capture shows the chart and editor together, compact document actions and cursor/reference status. |
| Load the official Pine v6 reference | `ev_1ec4fd716ff67a08d97de7b07d965970c54ac022651a9f265835160fda9b1361` | The rendered `ta.ema` reference documents initialization from the first source value and subsequent exponential recurrence. This is documentation evidence, not execution evidence. |

The EMA hand calculation exposed a real discrepancy in PineTS 0.11.1's source:
its EMA initialized from an SMA after the warmup period. The maintained,
provider-scoped adapter uses the documented first-sample recurrence. The
original independent CSV expectations were retained while fixing execution.
See [reference comparisons](pine-reference-comparison.md).

The full PineTS repository was inspected at commit
`11aafe8833ce89d6511b3a78c07e5b58115f779a`. Its compatibility-test README explicitly
says those generated snapshots protect backward compatibility, not independent
correctness. They were not relabeled as TradingView reference results.

## Tools and licensing

- PineTS remains pinned to 0.11.1 under the owner's approved AGPL publication.
  The chart remains Lightweight Charts, with app-owned rendering and controls.
- Prior actual Ghidra 12.1.4 analysis of `tvdbridge.node` remains recorded in
  [the earlier investigation](pine-rebuild-rea.md). It concerns the desktop/native
  bridge. No new Ghidra decompilation was needed for these JavaScript runtime
  fixes, and none is claimed. Hopper was not used for this change.
- The 12ui design skill was read and its CLI bootstrap retried. Windows returned
  `spawn EINVAL`; the prior API attempt required authentication. No generated
  design was available. The implementation used the actual REA reference capture
  and locally rendered browser checks instead.

## Delivered scope and remaining boundaries

The change covers the chart-visible editor workspace, saved layout and drafts,
source assistance, touch editing, legitimate native syntax, exact cross-symbol
feed requests, constrained non-repainting higher-timeframe requests, historical
bar classification, EMA initialization, plot styles and mixed-pane rendering.
The numerical comparison CLI fails on mismatches rather than declaring global
compatibility from a handful of examples.

Remote library imports, TradingView publishing/account storage, cloud Pine
alerts, a tick-identical broker emulator, arbitrary exchange data, complete
realtime rollback and the entire Advanced Charts feature set remain outside
this implementation. The [compatibility table](pine-runtime-compatibility.md)
is the narrower application contract.
