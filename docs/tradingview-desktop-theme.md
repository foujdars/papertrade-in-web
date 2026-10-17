# TradingView-inspired desktop chart presentation

The Trade chart and F&O chart workspace have a compact, neutral light/dark presentation based on inspected public TradingView desktop charts. Existing Papertrade navigation, branding, account tools and trading workflows remain available.

## Desktop boundary

Every new CSS selector starts with `.terminal-shell[data-platform="web"][data-section="trade"]` or its `fno` counterpart, inside `(min-width: 941px) and (hover: hover) and (pointer: fine)`. No global theme tokens, mobile styles, Android styles or non-chart page styles were edited.

Canvas theming checks the same media boundary, browser platform and section, plus `Capacitor.isNativePlatform()`. It listens for media/scope changes and restores the existing palette outside the desktop boundary. Mobile/native colors, user-selected line colors and chart functionality are preserved. Baseline palettes are asserted field by field in tests.

## Presentation changes

- Neutral white light surfaces and near-black `#0f0f0f` dark surfaces, thin `#ebebeb`/`#2e2e2e` dividers, blue active accents.
- Compact chart toolbar, 54 px drawing rail, 46 px right navigation rail and approximately 302 px optional side panels.
- Flat panels, restrained radii, monochrome tool icons and compact readable controls; narrow desktop layouts wrap chart controls when needed.
- Chart axes, grid, crosshair and candle colors follow the desktop palette. The existing light/dark toggle controls the result.
- Papertrade keeps its account/header controls and accessible main navigation. This deliberately differs from TradingView's single 40 px public header; it is a reconstruction adapted to existing functions, not a pixel-identical copy or a new TradingView integration.

## REA and Ghidra evidence

New actual REA 6.5.0 public-browser captures used a 1440×900 viewport, DPR 1, separately verified light and dark chart states. Light evidence: `ev_aa029905daf2a4b333d520928b1dd9d71f4d7775f888e35c7aef10e191c694a2`. Dark evidence: `ev_6f1c18ea8e8621f5761fadc37f6cdb018051622c1d6e45b9cde8b1f0f9fa63ff`.

Screenshots establish approximate top toolbar 40 px, left rail 54 px, watchlist/details 300 px and right rail 46 px. Pixel sampling establishes white/near-black surfaces and the divider colors above. These cover the public default chart states at that viewport; other TradingView configurations were not exhaustively inspected.

Prior actual REA/Ghidra 12.1.4 analysis of official TradingView Desktop's `tvdbridge.node` was reused only to establish the native integration boundary (overview `ev_6c75e24953aa090d008546920c1d0b4ab0672ae2655e907019b723f8de091cec`; registration decompilation `ev_968a6a107a192d816481609a6f70e5c59e6e960fe30434c08b377edb740f251b`). It shows Windows/V8 component bindings, not browser CSS. No new unrelated native decompilation was performed. Hopper is unavailable on this Windows host.

The shipped ASAR preload has a legacy navy scrollbar fallback; current public browser screenshots are near-black. The implementation follows the observed current browser surfaces. No original proprietary theme code or native engine was incorporated.

12ui design was attempted and required a separate account connection. The UI extends existing Papertrade components; a completed hosted design workflow is not claimed.

## Verification

- Palette tests assert the desktop guard and exact baseline token preservation for mobile, coarse-pointer, native-wide and unrelated sections.
- CSS parsing checks every new rule for explicit desktop/browser/chart scope.
- Existing chart-style, drawing-tool and advanced-chart tests exercise shared chart behavior.
- Real-app browser checks at 941/1024/1366/1440/1920 widths cover toolbar bounds, order-ticket bounds, light/dark theme, Functions/Pine Editor and drawing-tool access.
- The browser disables/enables only the new stylesheet and compares visible-element computed layout/color styles at 390/768/940 widths, on a wide Android-labelled native host, and on Home. The comparisons must be identical. This is CSS isolation evidence; native-device binary testing was not performed.
- A real F&O component fixture verifies two-chart workspace bounds and retained order-control callbacks at 941/1024/1440/1920.

Preview screenshots use deterministic market fixtures and a local guest session, not production account data. No real orders, deployment or merge is performed by the tests.
