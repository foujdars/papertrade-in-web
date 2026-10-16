# Papertrade desktop redesign — review brief

Source: `origin/main` at `478467c`. Work branch: `codex/desktop-design-review`.

## First screen

Use the existing Home / Market overview screen and its shared navigation as the
representative screen. Review the implemented screen before extending the design
to Charts, Watchlist, Holdings, Orders, News, IPOs, Analysis, P&L, and Bot.

## Confirmed implementation constraints

- Keep React, vinext, Tailwind 4, existing chart libraries, and existing icons.
- Preserve every live feed, API, trading calculation, strategy, notification,
  account action, and wallet separation.
- Preserve existing displayed financial fields and quote freshness states.
- Do not use design-generated prices, chart paths, or portfolio figures in the app.
- Keep native Android and mobile presentation outside the initial desktop change.
- Cover both existing light and dark themes.
- Do not merge or deploy the redesign before review.

## Code audit

1. Desktop styling is layered across `globals.css`, `desktop-workspace.css`,
   `desktop-market-design.css`, and `desktop-tabbed-workspace.css`. Earlier rules
   position a dark left rail; later rules replace it with top navigation and a
   different header height. Consolidate the relevant declarations rather than
   adding another competing global override layer.
2. The current final desktop layout uses 110 px for two header rows and 58 px
   for index information. Keep information readable at 1280 px and 1440 px;
   validate total height at 768 px and 900 px.
3. Several secondary labels and controls are styled at 9–11 px. Establish a
   readable hierarchy and tabular figures while retaining the compact layout.
4. Header utilities use icon-only controls. Preserve accessible names and keep
   account, wallet, broker, notification, and theme actions discoverable.
5. Home already has market section tabs and a desktop movers table. Preserve
   their keyboard navigation, filters, search, and existing callbacks.
6. Analysis already provides Screener, Peer comparison, and Top stocks tabs.
   Use this existing information architecture; do not add duplicate entry points
   inside the same workspace.
7. Bot currently remains accessible through Tools & settings. Preserve access
   during the first screen review; review final navigation placement separately.

## Visual direction for 12UI

An Indian paper-trading desktop workspace for frequent use: restrained neutral
surfaces, one product accent, aligned financial columns, clearly distinct market
gains and losses, consistent typography, subtle borders, and compact but readable
spacing. Avoid marketing banners, decorative gradients, fake charts, new metrics,
duplicate navigation, and explanatory paragraphs around routine controls.

Generate candidates from a capture of the current application, retaining its
content and identity. Inspect the candidates and explicitly select one before
implementation. The initial deliverable is the actual Home screen for review,
not a replacement static dashboard.

## Verification before review

- Build and check relevant rendered UI tests.
- Inspect the screen at 1280×768, 1440×900, and 1920×1080 in both themes.
- Check search, market selection, overview tabs, privacy controls, and navigation.
- Check loading, offline, unavailable quote, and empty portfolio states.
- Verify no clipped values, overlapping menus, or inaccessible financial actions.
- Confirm no business logic, feed, API contract, or stored data changes.

## Implemented review screen

Candidate C was selected from four 12UI candidates and converted to responsive
HTML and LayerDoc reference. Only `app/desktop-tabbed-workspace.css` changes the
application. The existing React components, API routes, libraries, calculations,
source labels, callbacks, and financial data remain unchanged.

- Reworked Home tokens for light/dark, with readable directional text.
- Replaced the joined index strip with three distinct index cards.
- Brought the movers heading, filters and table into a clear shared surface.
- Increased company/price text to 14 px and secondary names to 12 px.
- Kept portfolio and research panels aligned with the main table.
- Tested narrower populated index/table layouts and the existing mobile boundary.

### Screenshots

- `design/papertrade-desktop-sample-light.png`: implemented light-mode Home.
- `design/papertrade-desktop-sample-dark.png`: implemented dark-mode Home.

The original capture is retained locally and excluded from the PR after automatic
approval review blocked sharing it on GitHub as potentially private wallet data.
The two implementation screenshots use six public market rows replayed inside
Playwright only. They are layout previews, not current market quotes. No test
response, fixture, mock feed, or hardcoded market price is added to the app.
Index quotes remain unavailable in this local preview because broker credentials
are not supplied. Wallet values are the existing guest defaults.

### Design alignment and adaptations

The post-implementation 12UI comparison used the unchanged selected LayerDoc
against the actual running Home page. Its DOM-anchored coverage gate passed
(61 matched elements; 67.0% DOM coverage). This is an anchoring check, not a
pixel-perfect fidelity or accessibility certification.

The original vector icons and brand assets are retained in preference to
rasterised icons extracted by 12UI. This preserves theme changes, dynamic
notification badges, accessible controls and the established identity. Original
source data, market values, all navigation utilities and the NSE label take
precedence over differences in the generated reference. Some suggested target
text colours are darkened for readability. The target's generated token names
are mapped into existing Home tokens instead of adding global tokens to every
screen. The extracted raster assets remain preserved in the local design kit
and are not loaded by the application.

### Validation

- Production build: passed.
- Browser checks: search, Indian/global selection, privacy, section tabs with
  keyboard controls, Chart navigation, and both themes passed.
- 1920, 1440, 1280 and 1024 px desktop checks: no page, navigation or Home overflow;
  six populated rows visible and legible. Existing mobile Home checked at 390 px.
- No browser JavaScript errors in these checks.
- Existing test selection: 35/41 pass before and after. The same six failures
  are already present on `478467c`; no test expectations were changed. They
  concern source-string assertions for Home card mappings, wallet controls,
  market directory rendering, chart colours, and portfolio deletion controls.
- All application changes are CSS within the desktop media boundary. No trades
  were executed during verification.

The full multi-screen rollout, merge and deployment remain pending review of
this representative screen.

## 12UI spend ledger

Stage ceilings are not confirmed charges. The 12UI kit records:

| purchase | stage | invocation | price ceiling |
| --- | --- | --- | --- |
| `crt-a5fa2a419b2d3128f0d9ef4d983ac9850f9f35fd` | draft | `improve` pid 2, started 2026-10-16T09:23:47.128Z | $0.12 (stage ceiling) |
| `b57143bc-ce76-44b4-823f-b82672f0f072` | convert | not recorded | $0.55 (stage ceiling, shared by 2 purchases) |
| `06ec52a1-6c53-45e3-b80c-0e4d3d5a0731` | convert | not recorded | $0.55 (stage ceiling, shared by 2 purchases) |

The kit totals these distinct stage ceilings at $0.67, not $1.22. The free
fixed-layout derivation `b12c0571-5b88-4743-a795-425f447b3527` and final LayerDoc
alignment purchased nothing. Credentials, temporary design-kit state and
account details are excluded from the repository.
