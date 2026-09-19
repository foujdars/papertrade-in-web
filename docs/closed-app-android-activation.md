# Android closed-app price and technical alerts

## Current work, 19 September 2026

The user authorized Android only, free services only, and one-device receipt
testing. No subscription, billing upgrade or paid scheduler is authorized.

The existing Vercel project is on **Hobby** (verified through the team API).
Minute-level Vercel Cron is not available on that plan. The existing production
Firebase credentials are configured. Do not replace them or export their values.

The shared server dispatcher now supports once-only price levels as well as
confirmed-close technical conditions. Price rules require quotes newer than their
arming time and less than 90 seconds old. They do not infer an intraminute touch
from session highs/lows and do not execute paper or real orders. The Android price
form explicitly distinguishes app-open checks from closed-app server checks.
Existing local rules are not silently migrated. SMC alerts remain excluded.

## Free scheduler activation

Use the user's signed-in [cron-job.org console](https://console.cron-job.org/).
Its [official FAQ](https://cron-job.org/en/faq/) documents free minute-level
execution and custom headers. This is a third-party scheduler, not a phone timer.

1. Verify Firestore denies direct client access to `technicalAccounts`,
   `technicalOutbox`, `technicalSystem` and `technicalPushTests`. Preserve all
   unrelated rules. Verify existing FCM/Firestore credentials by a controlled
   server request; never print service-account keys.
2. Set a dedicated random server-only `TECHNICAL_CRON_SECRET` (at least 32
   characters) in Vercel production. The dispatcher supports this scoped secret;
   the existing IPO notification secret remains unchanged.
3. Create one job targeting
   `https://www.papertrade.site/api/technical-alerts/dispatch`, method GET,
   every minute, throughout the day. Store the dedicated secret in the
   `Authorization: Bearer …` request header, never in the URL. Disable saving
   response bodies where possible. Inspect existing jobs before creating one.
4. Set `TECHNICAL_ALERTS_ENABLED=true` and redeploy only when the job is ready.
   Run a controlled request; then verify at least three actual scheduled runs,
   including health-document timestamps and failures. A manually invoked run
   alone does not prove the scheduler exists.
5. Review provider quotas, timeout limits and execution logs. The free service's
   request timeout must cover measured dispatch latency. Do not silently upgrade
   when a free quota or timeout proves insufficient; keep readiness unavailable
   and report it. Minute-level polling is not a guaranteed real-time service.

## Consenting Android phone test

Use the notification-enabled Android APK. No native code change is required by
this update; older APKs without `configurePush` need the existing signed update.

1. Sign in, enable Trade notifications, and choose **Connect notifications**.
   The device record must belong to that account and identify Android.
2. Open Alerts and tap **Test closed-app delivery**. The authenticated endpoint
   queues only that phone's registered token. It delays sending by at least
   30 seconds, expires after five minutes and limits tests to one per five minutes.
3. Close the app normally (not Android Settings → Force stop). Wait up to two
   minutes. The actual server scheduler—not an in-page timer—sends the test.
4. Reopen Alerts → **Check test status**. `accepted` means FCM accepted it,
   not that Android displayed it. Only the user's **I received it with the app
   closed** confirmation records `confirmed`.
5. Verify the logo, sound/quiet-hours behaviour and tap-through. Then create one
   price rule and one technical rule during an exchange session, close the app,
   and confirm actual trigger receipt. A test message proves transport only.

Tests never broadcast to notification topics and never simulate a market signal.
Opt-out, sign-out, expiry and ownership are checked. An uncertain FCM outcome is
`needs-review`, not blindly retried. Account deletion removes the test record.

## Evidence

The handler tests exercise price quote freshness, deduplication, session gating,
account isolation, delayed test dispatch, opt-out, expiry and manual receipt
confirmation. Browser tests cover server price creation/editing and the retained
technical alert workflow. Real-phone receipt and scheduler activation must be
recorded separately after they actually happen.
