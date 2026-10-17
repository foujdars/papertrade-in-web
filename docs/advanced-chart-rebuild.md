# Desktop advanced chart rebuild

This is an independent implementation on Papertrade's Lightweight Charts engine, guided by public TradingView behavior observed with REA. It does not embed or redistribute the proprietary TradingView Advanced Charts library. Research provenance and limits are recorded in [chart-rebuild-rea.md](chart-rebuild-rea.md).

## Where to find it

On a desktop browser, open a Trade/F&O chart or the dedicated chart workspace. The indicator strip now has **Settings**, **Data window**, and **Object tree** controls. **Functions → Templates** manages indicator templates. Select a Fibonacci retracement or regression drawing and open its settings for the additional controls. The existing **Pine Editor** button remains available in the strip and Functions menu.

These additions require a fine-pointer desktop browser at least 941 CSS pixels wide. Narrow screens and Capacitor/native hosts keep their existing interface. Desktop appearance choices are restored when entering desktop mode and removed from the chart engine when leaving it; they do not overwrite mobile settings.

## Implemented behavior

- Chart settings with staged Symbol, Scales and lines, Canvas, and Templates tabs. Apply, OK, Cancel, Defaults, keyboard navigation, focus restoration, and up to 12 named appearance presets.
- Independent candle body, border and wick colors; border/wick visibility; line color/width; current-price line and last-value label; normal/log/percent/indexed scales; inversion, auto-scale, top/bottom margins; time/seconds display and right margin; background/text/grid/crosshair colors, styles and visibility.
- Real chart-engine application, including custom volume-candle intensity colors. Appearance changes preserve manual price zoom and historical scroll. Comparison removal restores the saved scale mode; live ticks preserve margins while order brackets retain needed space.
- A docked Data window showing the hovered or latest loaded candle, OHLCV, change from previous close, exchange timezone and calculated indicator plot values. Shifted indicator plots align to their rendered bar; warm-up/missing outputs remain empty. Groups collapse independently. Narrow desktop chart panes use an overlay to keep the plot usable.
- A searchable drawing object tree covering price-chart and indicator-pane drawings, with filters, select/settings/delete, individual and matching-result visibility/lock actions. Batch actions persist once per drawing domain. Existing drawing undo history is retained.
- Fibonacci level editing (up to 24 finite ratios), reversal, labels/prices, left/right extension and saved/cloned options. Price labels use the chart's formatter. Regression channels expose deviation multiplier, statistics and extensions; geometry uses fitted residual standard deviation, with original editing anchors retained.
- Up to 12 local indicator templates containing selected built-in studies plus settings, colors and visibility. Applying a preset commits settings atomically, respects the six-visible-lower-pane limit, and preserves excluded/Pine selections. Duplicate names, full capacity and storage failures are reported.
- Appearance settings and templates persist independently. If storage fails, a session-only notice and retry are shown; another preference update does not discard unsaved choices. These are device/browser preferences, not account cloud sync.

## Existing capabilities preserved

The existing chart types, timeframes, comparison, drawing catalog, replay, horizontal rays, drawing alerts, chart history, built-in indicators and Pine workspace remain integrated. Horizontal-ray alerts use the edited price and existing alert service. This change does not introduce a new alert backend or broker connection.

This branch builds on the PineTS/Monaco rebuild in PR #121, now merged into main, and inherits its AGPL-3.0-only licensing and source-offer behavior. Its full branch contains both the Pine rebuild and these chart additions. See the Pine rebuild documentation for runtime compatibility and strategy simulation limits.

## Validation

- `npm run test:chart:advanced`: settings normalization, volume colors, data-window alignment, template limits/transactions, drawing geometry/restoration/persistence and ray alert conditions.
- `npx tsc --noEmit` and focused lint on the new components/helpers.
- `npm run build`: complete production build, including the isolated Pine runtime asset.
- `node tests/browser/chart-settings.cjs`: actual dialog behavior, keyboard controls, templates, storage denial/recovery, object search and legacy view.
- `node tests/browser/chart-appearance.cjs`: actual engine colors, scale/viewport preservation, comparison, live bracket margins, volume candles and mobile/native restoration.
- `node tests/browser/chart-rebuild.cjs`: integrated chart settings, data inspector, historical hover, drawings, persistence, templates and responsive exclusions.
- `node tests/browser/ray-alert-settings.cjs`: ray settings, exact-price alert creation, failure/cancel/reload, desktop and mobile layouts. Alert persistence/notification hooks use deterministic fixtures; live push delivery is outside this test.
- `node tests/browser/pine-rebuild.cjs`: Monaco, isolated PineTS execution, studies/strategies, visuals, inputs, logs, live updates, errors, saved history and mobile/native preservation.

Browser runners use Vite and Playwright Chromium. Set `PLAYWRIGHT_MODULE_PATH` to an installed compatible Playwright module if it is not on the normal module path. Test feeds are deterministic fixtures, not a certification of a live exchange connection.

## Remaining differences from TradingView

This is a substantial extension of the existing app, not full Advanced Charts or tradingview.com parity. The object tree currently manages drawings; it does not offer nested groups, symbol/indicator reordering or TradingView cloud layouts. Appearance presets do not save complete symbol/layout/session state. The Data window displays study plots, not every custom Pine table/drawing or every TradingView status-line field. Full proprietary drawing catalogs, broker APIs, every chart setting, server-side TradingView alerts and complete Pine compatibility are not supplied by this change.
