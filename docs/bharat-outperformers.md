# Bharat Market Outperformers

Open **Analysis → Bharat Strategies → Generate basket**. Requires the existing fundamental research dataset and a working daily-price connection. A scan reads data only; it never places an order.

## Delivered workflow

- Up to 20 ranked companies, completed close/date, 63-session price return, score breakdown and selection reasons.
- Company research and chart links, search/industry filters, CSV export.
- Current basket versus Nifty 50 with 1M/3M/6M/1Y/Max periods, percentage/rupee values, investment controls and pointer/keyboard inspection.
- Loading/progress/cancellation, explicit scan exclusions, partial-history failures and benchmark-unavailable states.
- Responsive layout, dark styling and a methodology/data-coverage panel.

The reference is the user's InvestingPro screenshot and public ProPicks descriptions. This is an original Papertrade research feature, not a recovered InvestingPro model or a feed of subscription picks. No third-party holdings or promotional performance figures are seeded into the app.

## Selection rules

Existing fundamental screening gates, rejected-review exclusions, at least 70% scoring-data coverage and listed-instrument matching apply. Financial businesses are excluded because the existing fundamental model requires separate sector treatment. The existing preliminary pool uses fundamental scores, a maximum of six companies per industry and up to 60 companies. Eligible but unscanned companies are disclosed.

Scanned companies need at least 64 valid completed daily sessions, a current usable price date, and at least ₹1 crore median traded value over 20 sessions. The engine revalidates daily OHLCV and recomputes price factors. It uses the newest eligible price date and excludes stocks with a different endpoint.

| Component | Weight | Calculation |
| --- | --- | --- |
| Fundamentals | 45% | Existing quality/growth/valuation/balance score |
| Momentum | 35% | Percentile of 63-session price returns within the usable scanned cohort; ties receive equal ranks |
| Trend | 10% | Fraction of close > SMA20, close > SMA50 and SMA20 > SMA50 checks |
| Risk | 10% | Bounded score derived from daily ATR as a percentage of price |

Scores are sorted deterministically, with up to four selected companies per industry and a maximum of 20. Fewer than 20 can qualify. These are transparent rules; there is no trained AI or proprietary InvestingPro model in this implementation.

## What the chart measures

**Current basket retrospective, not a strategy backtest.** Today's selected cohort is viewed through its available past prices. There is no point-in-time monthly selection archive, historical constituent universe or monthly rebalance simulation. Current fundamentals introduce hindsight and survivorship bias. The screen does not promise a monthly selection schedule or future outperformance.

At the first displayed common date, the investment is split equally between all selected companies using fractional shares. Shares stay fixed. Every plotted date contains every current constituent and Nifty 50; missing dates are not filled and constituents are never silently dropped. The benchmark uses the same start/end dates. Different latest completed endpoints or insufficient common history withhold the comparison.

Periods correspond to 21/63/126/252 shared sessions; Max covers the available shared history. The existing research pipeline caps validated history at 320 sessions. A five-year or since-2019 curve is therefore not offered. Returns are price-only, excluding dividends, fees, taxes and rebalancing. Corporate-action adjustment of the upstream candle history is unverified. Rupee points are NAV amounts; percentage values are `(NAV / starting investment - 1) * 100`.

Table filters do not change the comparison basket. The newest forming/future bars are excluded through existing research-candle validation. Prices refresh only on an explicit scan; there is no misleading live-return toggle. Fundamental file/date/import metadata is shown, including missing source dates.

## REA investigation and tool choice

REA 6.5.0 actually captured the requested public URL in a fresh Edge browser: `https://www.investing.com/pro/propicks`. Evidence `ev_99bb88779661072c6647ffbd629875a872f2c3e90d343f61ccbbc0f9d42238c5` contains DOM/accessibility/URL/screenshot sections, but the site returned a **403 document**. Live controls, current holdings and proprietary reasons were not recovered. No access controls were bypassed.

The user screenshot establishes the requested layout/interactions. Official primary sources describe [strategy construction](https://www.investing-support.com/hc/en-us/articles/21860692550289-How-are-ProPicks-Strategies-created), [financial-factor modelling](https://www.investing-support.com/hc/en-us/articles/21861077079953-What-financial-metrics-and-other-factors-does-the-AI-model-consider-when-selecting-which-stocks-will-be-included-in-a-ProPicks-Strategy), [selection rationales](https://in.investing.com/blog/propicks-ai-understanding-the-why-behind-every-stock-pick-36), and [hypothetical performance](https://www.investing-support.com/hc/en-us/articles/21861480414993-ProPicks-performance). These do not disclose reproducible proprietary weights or authorize treating dated promotional returns as live results.

REA browser capture was the appropriate available tool. Ghidra/Hopper analyze relevant shipped binaries; neither can recover a remote ranking service from this screenshot/403 response. Earlier TradingView native analysis is unrelated and was not reused as ProPicks evidence. The exact current original model, holdings, submenu behavior, and historical performance methodology remain unresolved.

12ui was attempted with the supplied screenshot and required a separate account connection. The implementation continues with existing Papertrade styles; no hosted design completion is claimed.

## Validation

- `npm run test:bharat`: numerical and selection tests plus existing stock-discovery regressions.
- Browser fixture mounts the real FundamentalWorkspace and Bharat component with clearly synthetic test companies/history. Checks top-20 counts, NAV/percentage/rupee math, investment edits, filters preserving the basket, CSV download, research/chart links, missing benchmark, partial failures, cancellation, 320/390/768/1440 widths and dark mode.
- Production build, TypeScript, focused lint and whitespace checks.

Test screenshots illustrate the UI with synthetic data; they are not market recommendations or live performance evidence. This feature remains a draft until reviewed and merged.

## Additional strategy screens

The three strategy cards open independently scoped screens. Switching strategy discards pending/old scan state, so results are never relabelled as another basket. Each uses the same strict daily-history, liquidity, benchmark, retrospective and exclusion rules.

- **Bharat Bargains:** up to 15 picks. Requires positive P/E below a positive industry P/E, positive PEG ≤1.5, and ROE/ROCE ≥15%. Score is 45% valuation, 35% quality, 10% balance sheet and 10% risk. This is relative-value screening, not an intrinsic-value calculation.
- **Bharat Small Cap Gems:** up to 20 picks. Requires imported market capitalization ₹500–5,000 crore and three-year sales/profit growth ≥10%. Score is 40% growth, 25% quality, 20% momentum and 15% risk. This is an explicit Papertrade size band, not an official small-cap classification. Missing market cap fails eligibility; there is no price/volume substitute.

The optional `Market Capitalization` Screener CSV/JSON field is interpreted in INR crore; recognized CSV aliases include `Market Capitalization (Rs. Cr.)` and `Mar Cap Rs.Cr.`. Existing imports without it keep working for the other screens. [Screener's own results](https://www.screener.in/screens/401431/search/) label market cap in Rs.Cr. Reimport a dataset containing this field to enable size screening of older records. Original fundamental gate/completeness requirements remain unchanged.

No screenshot returns, 2019–2026 history, five-year performance, proprietary model or automatic monthly rebalance is fabricated. All displayed comparisons come from the current scan's available prices.
