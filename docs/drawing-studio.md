# Drawing studio

The main chart opens Drawings from the pencil/ruler icon immediately before
Functions. This replaces the old stacked-library button, not the stock watchlist
star. Other chart workspaces retain a tools button on their toolbar.

The sheet offers search, category tabs, three-column icon tiles, grouped
favourites and a Show favorites on chart switch. Favourites and their visibility
are device preferences shared across symbols/workspaces and survive restart.
Existing drawings retain their storage keys and anchors.

## Positions and labels

Long/Short positions use three anchors: entry, stop, target. Their horizontal
extent comes from those anchors instead of a fixed-width rectangle. Reward and
risk zones are translucent; labels have no background or border.

- Target/stop: price, signed per-unit change, percentage of entry price.
- Middle: entry price and risk:reward ratio, for example 1:2.00.
- Invalid stop/target direction: no misleading ratio (shown as a dash).
- These drawings do not place orders or calculate account/quantity-based profit.

The common label layout keeps labels inside the plot, shrinks wide values and
separates labels belonging to the same drawing. If the plot cannot fit all of
them, excess labels are omitted rather than overlapped. It does not guarantee
collision avoidance between unrelated drawings, chart indicators or candles.
Existing specialised volume-profile rendering is retained.

## Tools and scope

88 tools are available, including 14 new manual pattern/cycle tools and four
single-anchor visual stamps. Pattern templates are manual annotations, not
automatic pattern recognition, harmonic-ratio validation or trade signals.
The picker is inspired by the supplied reference, not a claim of full
TradingView feature parity. Unsupported integrations such as Tweet/Image embeds
and Ghost Feed are not shown as non-functional buttons.

## Android zoom

The Android client guard constrains page zoom on every route, including older
installed shells loading the updated website. It does not consume multi-touch
inside the chart; chart pan, pinch and axis gestures remain chart interactions.
The native WebView also disables its own zoom controls for future APK builds.
No new APK/store release is produced by publishing the website.

## Verification

- `npm test` (build, existing regressions and drawing geometry/label tests).
- `npx next build` (production build and TypeScript).
- Android `:app:compileDebugJavaWithJavac`.
- `tests/browser/drawing-studio.cjs`: saved positions, five-point pattern
  placement/restart, search, favourites/restart, toolbar visibility, responsive
  sheet bounds, dark theme, dismissal and Android page-pinch guard.
- `tests/browser/drawing-dashboard.cjs`: header ordering at 320/390/768/1280px,
  all tool tiles and emulated pinch on Home/P&L/IPO/Watchlist.
- Existing `live-chart.cjs` and `chart-labels.cjs` browser regressions.

Browser tests use isolated storage and deterministic feeds. They do not modify
real trades and do not replace physical Android-device acceptance testing.
