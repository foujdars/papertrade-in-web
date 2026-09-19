# Technical-alert release status — 19 September 2026

## Released

- Base confirmed-close technical alerts: commit `64741fe`.
- Volume spike, dry-up and high-volume bullish/bearish conditions, plus gated
  server monitoring and Web/Android push integration: commit `8b60f4e`.
- Published through the existing GitHub/Vercel workflow to papertrade.site.
  Production assets contain the volume choices and closed-app setup gate.
- SMC alerts intentionally remain absent.

## Verified locally

- Full `npm test` workflow and optimized Next production build passed.
- Server model/API/dispatcher tests exercise real calculation and handler code
  with isolated auth, candles, transactional storage and push transport.
- Browser checks passed for volume persistence, setup gating, server-only rule
  evaluation, account isolation, pause/resume, logs and chart navigation.
- Existing price-alert/paper-order and live-chart interaction browser tests pass.
  One parallel live-chart run hit a timing assertion; the isolated rerun passed.
- Android `:app:compileDebugJavaWithJavac` passed using the existing local JDK 21.
  No replacement signed APK was published.

## Activation still pending

Production `/api/notifications/config` reports push and Web Push configured.
Production `/api/technical-alerts` reports not activated. Existing server secrets
were not downloaded or changed. Local absence of those secrets does not mean
production credentials are missing.

The remaining steps require deployment/scheduler access and a consenting test
device: verify Firestore protections, configure the dedicated minute-level
technical dispatcher, enable `TECHNICAL_ALERTS_ENABLED`, confirm healthy checks,
and test one closed-app notification end to end. See
[the deployment checklist](FIREBASE-NOTIFICATIONS-SETUP.md#closed-app-technical-alerts).
Do not purchase services, change hosting providers or claim reliable delivery
without that verification. No paid scheduler was created.
