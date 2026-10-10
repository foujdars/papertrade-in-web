# Deploy the chart opening scale fix (PR #76)

PR #76 is merged into main. Its positive-price autoscale repair prevents saved hidden zero-price drawing anchors from flattening candles. The fix is in components/MarketChart.tsx and lib/chart-price-range.ts.

1. Merge this deployment follow-up into main.
2. Open the linked Vercel project's Deployments page and check the deployment for the new main commit. Confirm main is the configured production branch.
3. If the build failed, inspect its logs and resolve the failure. To retry a deployment, use its Redeploy action.
4. Wait for Ready and Production, then open https://www.papertrade.site and close and reopen the Android app.

The Android app loads the live website through Capacitor, so this web-only fix does not require a new APK.

Verification: node --experimental-strip-types --test tests/chart-price-range.test.mjs

This follow-up preserves the already merged implementation and gives production a fresh main commit to deploy.
