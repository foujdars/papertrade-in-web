# Horizontal ray settings and drawing alerts

Built on main after the #111 revert (#113), then integrated with the subsequently merged #112 chart improvements. This does not reintroduce the reverted theme.

## Drawing settings

Horizontal rays and shared line drawings use the existing Drawing settings dialog with four sections:

- Style: colour, independent line opacity, width, solid/dashed/dotted line, ray direction and scale price label.
- Text: show/hide without losing content, colour, independent opacity, size, bold/italic, text, vertical position and alignment.
- Coordinates: exact price, IST date/time and loaded candle number.
- Visibility: all frames or selected supported minute/hour/calendar frames. Selecting none hides everywhere. Saved drawings remain in the drawing list; filtered drawings do not render or take pointer hits.

Cancel discards the draft. Apply saves presentation and coordinates with the existing per-instrument storage. Existing saved drawings retain compatible defaults.

## Create an alert from a ray

Select a price-pane Horizontal Ray or Horizontal Line and use the alarm-clock button in its floating toolbar. The level and optional drawing text seed the form. Supported instruments are the existing Indian equity/index/F&O universe; DELTA crypto, GIFT and MCX are excluded from this entry point. Indicator-pane values and replay drawings do not offer price alerts.

Settings supports Crossing, Crossing up/down and inclusive at-or-above/below conditions. Choose only once or repeat, cooldown minutes and expiration after 1, 7 or 30 days. Message supports a bounded name and custom notification text. Notifications shows monitoring status and device permission setup. Submit checks notification setup and saves through the existing server alert service; save errors remain visible and never silently downgrade a crossing alert to a different local threshold rule.

Saved alerts use a snapshot of the level. Moving/deleting a ray does not modify an existing rule. Prices use two decimal places and the form discloses rounding where necessary. Alerts are managed, paused, edited, rearmed or deleted in the existing Alerts list. No paper order is created by this workflow.

## Alert execution

The server compares fresh observed quotes, approximately once a minute. Crossings require an earlier persisted observation after arming; the first quote cannot fabricate a crossing. Arriving at equality counts as touching; departing equality does not duplicate that event. Repeating above/below fires on entry, including the first observed matching quote, then waits for the condition to become false and true again. Cooldown consumes suppressed edges rather than sending a delayed notification while price stays on the same side.

Quote times must advance; stale/replayed observations cannot fire again. Transactional evaluation uses the latest persisted baseline to prevent duplicate delivery across concurrent dispatches. Editing/resuming resets the quote baseline. Custom name/message reach the server push payload. Push still requires existing account permissions, consenting devices and the configured scheduler. No live user alert was created during development.

Touches between minute checks can be missed. This is not tick-continuous or bar-close alert monitoring. No unsupported email, SMS, webhook, open-ended expiry or Pine execution settings are shown.

## REA and Ghidra evidence

Actual REA 6.5.0 captured the TradingView website toolbar and the Horizontal ray tool menu/selection. Further property-dialog attempts hit selector/navigation timeouts; those dialogs were not fully observed. Their published support documentation was used as a behavior reference.

Actual REA through portable Ghidra 12.1.4 analyzed TradingView Desktop 3.4.1.8194's shipped tvdbridge.node, recovered 2,901 procedures and 572 strings, and decompiled the exported Node registration thunk and implementation. Findings establish Windows/V8 native component integration, not native chart or alert logic. Tool archives were verified against official checksums, no global configuration was changed, and native sessions were closed.

Compact evidence identities, digests and limitations are in rea-ghidra-ray-evidence.json. The implementation is independent Papertrade code, not a recovered TradingView codebase or full product clone.

References: [Horizontal ray settings](https://www.tradingview.com/support/solutions/43000518121-horizontal-ray-drawing-tool/), [alert configuration](https://www.tradingview.com/support/solutions/43000763312-learn-how-to-configure-alerts/).

## Verification

119 focused unit tests pass after integrating #112. Coverage includes drawing restoration, independent opacity/text styling, hour-frame filtering, exact level conditions, quote baselines, repeat/cooldown, stale observations, resume/edit and concurrent server dispatch. Production build and TypeScript pass. tests/browser/ray-alert-settings.cjs verifies actual one-point ray placement, settings/reload, precise edited level into alert, repeat/message/expiration, failure without local fallback, Alerts list/reload, cancellation, four widths and dark theme using deterministic services. The real backend is covered separately by dispatch tests; no production account or scheduler was exercised.

Integrated repository-wide suite: 222/236 pass; the same 14 failure names reproduce on the unchanged baseline before the #112 merge (202/216 pass). Both the ray workflow and the merged advanced-chart browser checks pass. Existing alerts.cjs also reproduces its chart-level assertion failure on baseline. Physical Android device testing was not performed.
