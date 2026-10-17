# Chart tools on every platform

The chart settings, Data window, drawing object tree, advanced Fibonacci/regression settings, indicator templates, and PineTS runtime are available on desktop web, mobile web, and Capacitor app shells. Open the chart strip, or Functions → Chart controls. Pine Editor is available directly in the chart strip and in Functions.

## Responsive behavior

- Settings use a scrollable horizontal section bar on phones/tablets, bounded dialog height, larger touch targets, and safe-area spacing.
- The Data window docks beside a wide mouse-driven desktop chart. On touch or small screens it becomes a bottom inspector, leaving part of the chart available for candle inspection. Back closes the inspector before navigating away.
- Drawing settings keep editable Fibonacci levels and regression controls at narrow widths. Object search, filters, and batch visibility/locking remain available.
- PineTS execution, strategy simulation, inputs, logs, saved scripts, and revision history are shared across platforms. Desktop mouse layouts use Monaco. Touch/narrow layouts use a native textarea with indentation and find, avoiding Monaco keyboard/selection problems on phones. The Scripts button opens templates, saved scripts, import, and export. This editor choice does not change the runtime.
- Existing appearance/template storage keys remain valid. The advanced Pine active selection uses the existing v2 key with legacy fallback; saved script libraries and revisions are retained. Nothing is cleared during the upgrade.
- Default chart colors still follow each platform's existing app theme. Explicit appearance preferences apply on every platform and remain set when resizing or changing shells.

## Validation

`tests/browser/mobile-chart-tools.cjs` runs actual MarketChart/ChartFunctionMenu components in Edge with touch contexts at 320, 390, 768, and 1024 pixels. It checks settings persistence and real chart options, Functions access, inspector layout, Back dismissal, drawing visibility/Fibonacci edits, indicator-template save/apply, Pine compilation/application, strategy equity, revisions, and import/export access. Native behavior is exercised using a Capacitor Android-platform stub. No physical Android/iOS device or signed store package was tested.

`tests/browser/mobile-chart-dashboard.cjs` also mounts the actual TradingDashboard with AuthProvider and checks desktop, mobile, and simulated native entry points using mocked market responses. It verifies settings persistence, template discovery, Data window, Pine compilation, and Back behavior. This caught and fixed the two-row chart status bar being covered by order controls.

The existing chart rebuild, appearance, and Pine browser regression suites also cover desktop operation and the new cross-platform persistence contract. Use `PLAYWRIGHT_MODULE_PATH` for an installed Playwright wrapper when needed; `CHART_QA_OUTPUT_DIR` and `PINE_QA_OUTPUT_DIR` select screenshot folders.

The implementation remains an independent charting application. Pine compatibility is experimental; TradingView cloud publishing and cloud script alerts are not supplied by this change.
