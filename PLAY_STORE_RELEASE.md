# PaperTrade IN — secure Play Store release

The Android package is a Capacitor client for `https://papertrade.site`. Anything shipped to a phone can be inspected by a determined attacker, so application secrets must never be embedded in the app. PaperTrade IN keeps the Upstox access token in the server-only `UPSTOX_ACCESS_TOKEN` Vercel environment variable.

## Security controls already enabled

- Release builds use R8 code shrinking, optimization, and obfuscation.
- Android backups and device-to-device transfer are disabled for app data.
- Clear-text HTTP and mixed content are disabled.
- WebView debugging and Capacitor logging are disabled in release builds.
- The FileProvider exposes only the app's dedicated `shared/` folders.
- Web responses include anti-framing, MIME-sniffing, referrer, permissions, CSP, and HSTS headers.
- Signing files, local Android configuration, Google service files, and environment files are ignored by Git.
- Supabase tables use row-level security so a signed-in user can only access their own profile and trading state.

## Create the private upload key

Do this once in Android Studio. Never place the key or its passwords inside this repository.

1. Open the `android` folder in Android Studio.
2. Select **Build → Generate Signed Bundle / APK**.
3. Select **Android App Bundle**, then **Next**.
4. Select **Create new**.
5. Store the keystore outside the repository, for example `Documents/PaperTradeIN-Keys/papertrade-upload.jks`.
6. Use the alias `papertrade-upload`, a unique password from a password manager, and a validity of at least 25 years.
7. Select the `release` build and generate the signed `.aab`.
8. Back up the upload key and passwords in two secure, private locations. Never send them by email or chat.

## Upload safely in Play Console

1. Create the app with package name `in.papertrade.app`.
2. Enrol in **Play App Signing** and choose a Google-generated app-signing key. The local key above remains the separate upload key.
3. Upload the signed release `.aab` to an Internal testing release first.
4. Under **App integrity**, enable **Automatic protection** when it is offered.
5. Download and retain the app-signing and upload certificates shown under **App integrity**.
6. Add the Play **app-signing certificate** SHA-1 and SHA-256 fingerprints to the Android OAuth client in Google Cloud. Use package name `in.papertrade.app`.
7. Test Google login, chart data, notifications, and paper orders from the Play-installed internal-test build before production rollout.
8. Upload `android/app/build/outputs/mapping/release/mapping.txt` as the deobfuscation mapping if Play Console asks for it. Treat mapping files as private release artifacts.

## Production secret checklist

- In Vercel, keep `UPSTOX_ACCESS_TOKEN` server-side. Never rename it with a `NEXT_PUBLIC_` prefix.
- `NEXT_PUBLIC_SUPABASE_URL` and the Supabase publishable/anon key are intentionally public client configuration. Never use a Supabase service-role key in the app.
- Confirm Supabase row-level-security policies from `supabase/migrations/20260806_auth_sync.sql` have been applied.
- Rotate any credential immediately if it is pasted into source code, committed to Git, shared in a screenshot, or included in an APK/AAB.
- Do not commit `*.jks`, `*.keystore`, `key.properties`, `local.properties`, `.env.local`, or `google-services.json`.
- Keep Android Studio, Gradle dependencies, Capacitor, Next.js, and the device WebView updated.

## Build verification

The unsigned verification bundle is generated at:

`android/app/build/outputs/bundle/release/app-release.aab`

For Play Console, generate the signed bundle through Android Studio using the private upload key. Do not upload a debug APK or the unsigned verification bundle.

