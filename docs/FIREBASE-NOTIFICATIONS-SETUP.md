# PaperTrade IN: finish background notification setup

## Status

The supplied Android configuration matches project `core-period-313622` and package `in.papertrade.app`. It is installed locally at `android/app/google-services.json` (gitignored). It is not a server credential.

Code is prepared for Firebase Android/Web delivery, a protected server dispatcher, preferences, quiet hours, current-logo notifications and duplicate prevention. Real delivery has NOT been verified or activated. Existing downloaded v1.21 APKs do not contain the new receiver; a new, correctly signed Android update is required.

## 1. Database

Open [the project's Firestore console](https://console.firebase.google.com/project/core-period-313622/firestore). Create the **(default)** Firestore database in **Production mode**. Choose the location deliberately; it cannot simply be changed later. If a billing prompt appears, stop and review costs before proceeding.

Only the server accesses push records. Keep mobile/browser access denied. If this project already has database rules or other apps, preserve their rules and restrict just the notification collections; do not replace unrelated rules.

No Firebase Authentication migration is needed: PaperTrade continues to use Supabase sign-in.

## 2. Secure server credentials

Use a dedicated service account with only Firebase Cloud Messaging send/topic-management access and Firestore database access (normally Firebase Cloud Messaging API Admin and Cloud Datastore User). Do not grant Owner or Editor just for notifications.

Configure these **server-only** production environment variables in Vercel:

| Name | Value |
| --- | --- |
| FIREBASE_SERVICE_ACCOUNT_JSON | Service-account JSON for this project, entered directly in the deployment's secure environment settings |
| NOTIFICATION_CRON_SECRET | A random secret of at least 32 characters, also stored securely in the scheduler |

Do not paste private keys into chat, commit them, expose them through NEXT_PUBLIC variables, or put them in Android assets. If downloaded locally, keep them outside the repository and delete the download once safely configured. Prefer a managed identity instead of a long-lived key if the hosting setup supports it; this implementation currently expects the server JSON credential.

Verify the Firebase Cloud Messaging API and Firestore API are enabled for the project.

## 3. Browser / installed web app

In the same Firebase project, register a **Web app**. In Project settings → Cloud Messaging → Web Push certificates, generate a key pair.

Add:

| Name | Value |
| --- | --- |
| FIREBASE_WEB_CONFIG_JSON | The web app's JSON configuration: apiKey, authDomain, projectId, messagingSenderId and appId |
| FIREBASE_WEB_VAPID_PUBLIC_KEY | The **public** Web Push certificate key |

The web app configuration and public VAPID key are public identifiers, not the service-account private key. Android configuration alone does not supply a Web app ID.

## 4. Scheduler (review cost before activating)

Run an authenticated HTTPS GET to `https://www.papertrade.site/api/notifications/dispatch` every minute, with header `Authorization: Bearer <NOTIFICATION_CRON_SECRET>`. Never put the secret in a query string.

Use a server-side scheduler with minute-level scheduling and secure headers. Vercel Hobby's daily cron limit is insufficient. A paid scheduler or hosting-plan change requires the owner's approval; none has been created automatically.

The handler uses an overlap lock and persistent outbox. It establishes an initial allotment baseline without broadcasting old results. Ambiguous send failures are marked **needs-review**, not blindly resent. Monitor 503 responses and outbox records stuck in sending/needs-review; absence of errors alone is not proof that a phone received a message.

Device review processing rotates through 250 records per invocation. At larger user counts, expand this to a durable queue/sharded schedule before launch; the ten-minute review window is not an unlimited-capacity broadcast mechanism.

## Messages and timing (IST)

| Audience | Timing | Message style |
| --- | --- | --- |
| Users who enable IPO updates | 9:05 am, only if relevant | “Today's IPO spotlight 👀” — one combined digest of fresh GMP ≥15% and issues closing today |
| Same audience | 1:30 pm, only for issues still accepting applications today | “Your afternoon IPO reminder ⏳” — closes today; check broker cutoff |
| Users who enable allotment updates | After source-confirmed publication is detected | “The wait is over—[company] allotment is out 🔔” — official registrar link |
| Users who enable IPO updates | Once actual listing price is available on listing day | “From GMP to reality: today's listings” — actual price and return vs issue price, silent |
| The affected Android user | When configured target/stop is detected by the running monitor | Paper-trade protection event; open the app to review. Never claim a real order was executed |
| Users who separately opt into reviews and traded that day | 5:15 pm weekdays | “The market has closed. Your lesson hasn't.” |
| Users who separately opt into practice reminders, inactive ≥3 days | Sunday 6 pm, once weekly | “No catch-up needed. Just one candle.” |

Routine IPO digests are capped at two a day. When both were sent, optional personal review/practice is skipped for IPO subscribers. Verified allotments and actual listings are separate event-driven updates; multiple issues detected together are combined. All notifications are silent between 9 pm and 8 am. Stale digests expire rather than appearing hours later. No repeated “awaiting allotment” alerts or guaranteed-profit language.

The 9:05, 1:30 and 5:15 slots each accept scheduler runs for ten minutes, with stable per-slot IDs. Delivery is not an exact-time guarantee: network loss, Doze, permission denial, browser restrictions and Android force-stop can delay or prevent it. Android normally needs to be opened once after installation and notification permission granted.

Background browser notifications cover IPOs and opted-in summaries. This change does **not** implement an always-on server trade execution engine; closed-browser trade-price monitoring remains unsupported. Android price monitoring uses the existing foreground service and requires its ongoing notification.

## Before release

Release audit: Next.js was updated from 16.3.0 to 16.3.3, clearing the critical npm advisories GHSA-p293-qw3h-jr36 and GHSA-2xp9-vwfh-vxw4. Other dependency findings still require later review; a passing build is not a clean security audit.

1. Redeploy with server configuration; verify the config endpoint reports enabled and the dispatcher rejects an incorrect secret.
2. Establish the initial baseline, register a consenting test account/device and confirm Firestore stores no trade prices or PAN.
3. Build a new Android version with the supplied configuration and the existing release signing identity; do not overwrite the previous downloadable APK until verified.
4. Send a **single-token data message** to the test device with id, title, body, kind, url, expiresAt (milliseconds) and silent (string). Do not send a test to production IPO topics. Firebase Console notification campaigns bypass this custom data-only policy and are not a substitute for this test.
5. Close the app normally, check receipt/current logo, tap-through, expiry, quiet hours, opt-out, sign-out and account deletion. Test a browser installation too.
6. Verify a scheduled digest once; repeating the dispatcher must not resend it. Verify a newly published allotment, followed by a temporary source failure, never re-alerts as a fresh result.
7. Enable the scheduler only after these tests. Review delivery failures, Firestore usage and scheduler costs.

The server cleans up inactive device records during its scan. Configure outbox TTL on expiresAt only after reviewing the provider's TTL costs; device TTL should not independently delete documents before topic unsubscription. No automatic TTL policy has been enabled.

## Official references

- [Firestore quickstart](https://firebase.google.com/docs/firestore/quickstart)
- [FCM Android setup](https://firebase.google.com/docs/cloud-messaging/android/get-started)
- [FCM Web setup](https://firebase.google.com/docs/cloud-messaging/web/get-started)
- [FCM server authorization](https://firebase.google.com/docs/cloud-messaging/send/v1-api)
- [Vercel cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
