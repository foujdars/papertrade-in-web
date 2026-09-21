# Global markets practice

Home search and the trade symbol picker include Bitcoin, Ethereum, Solana, Gold and Brent. Saved instruments appear among Home favourites. The NSE P&L screen stays separate from global history.

## Instruments and sources

- BTCUSD, ETHUSD, SOLUSD and XAUTUSD use the public, read-only Delta Exchange India REST API. Gold is **tokenised Tether Gold**, not an XAU/USD spot or MCX contract.
- Contract size, tick, margin scaling, position limits, fees and funding interval come from live product metadata. Current small-position maximum leverage is typically 200× BTC / 100× ETH, SOL and XAUT; larger positions have lower limits.
- Brent is watch-only via the official TradingView TVC:UKOIL widget, explicitly labelled a CFD reference. ICEEUR:BRN1! is not licensed for the free embedded widget. There are no Brent orders or alerts.
- No exchange credentials or exchange order endpoints are used.

## Simulation boundaries

- Separate ₹100,000 practice wallet, explicitly accepted on first use; account-scoped local storage, not cloud sync. Existing stock balances and orders are unchanged.
- USD prices, INR collateral/P&L at the displayed fixed ₹85/USD convention. Fees include 18% GST; promotional rates are excluded.
- Isolated long/short positions, market/limit entries, reduce-only partial closes and mark-triggered TP/SL. Liquidity is limited to the observed top-of-book size. Resting limits use conservative taker fees, not an invented maker fill.
- Monitoring requires the app to remain open and visible. Five-second quote polling cannot reproduce exchange matching or liquidations exactly. Loss caps are explicitly simulated; no missing historical fills are invented.
- Funding is estimated from the rate observed at a funding boundary. Missed boundaries flag incomplete P&L and block new exposure until positions close; they are never silently backfilled.
- Price, EMA, RSI and volume alerts are once-only, expire after seven days and remain foreground-only. Technical alerts use finalised five-minute candles. SMC alerts and the closed-app scheduler remain disabled/unchanged.
- Freshness, available margin, integer quantity, tick size and leverage are rechecked at execution. Browser storage locks serialize changes across tabs; corrupt storage is not silently reset.

## Verification

`npm test` includes global accounting and alert regression tests. `tests/browser/global-markets.cjs` covers the mobile order workflow, partial closes, indicator application, alert delivery to the in-app notification centre, instrument search, navigation, four viewport widths, and unchanged NSE storage using deterministic mocked quotes. Set `GLOBAL_APP_URL` and `PLAYWRIGHT_MODULE_PATH` as needed.

Separately verify live snapshots/candles and the real Brent widget before release; mocked browser tests alone do not prove provider availability. Android loads the hosted site, so these web changes do not require an APK rebuild. Physical-device behaviour has not been certified by desktop browser tests.
