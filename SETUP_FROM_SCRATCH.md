# PaperTrade IN — setup from scratch

This guide assumes you have only a Gmail account, the GitHub repository and the existing Vercel deployment. Complete the sections in order.

## 1. Create the free Supabase backend

1. Open <https://supabase.com/dashboard> and sign in.
2. Select **New project**.
3. Choose an organization, enter `papertrade-in`, create a strong database password and save that password somewhere private.
4. Select the region closest to India and create the project.
5. Wait until the project reports that it is ready.
6. Open **SQL Editor → New query**.
7. In this repository, open `supabase/migrations/0001_auth_and_trading_state.sql`.
8. Copy the complete SQL file into the Supabase editor and select **Run**.
9. Open **Table Editor**. Confirm that `profiles` and `trading_states` now exist.

The SQL enables Row Level Security. A signed-in user can access only their own portfolio state.

### 1A. Create the private fundamentals bucket

1. In the repository, open `supabase/migrations/0002_fundamental_data_storage.sql`.
2. In Supabase **SQL Editor → New query**, paste the complete file and select
   **Run**.
3. Open **Storage**. Confirm that a bucket named `fundamental-data` exists and
   that its **Public** switch is off.

The CSV is written and read only by the server routes using the service-role
key. Do not make this bucket public and do not put the service-role key in a
`NEXT_PUBLIC_` variable.

## 2. Create Google login credentials

1. Open <https://console.cloud.google.com/>.
2. Create a project named `PaperTrade IN`.
3. Open **Google Auth Platform** and configure the consent screen.
4. Select **External** audience. Enter the app name, your support email and developer email.
5. Add the scopes `openid`, `email` and `profile`. Do not request Google Drive, contacts or other unnecessary access.
6. While the Google app is in testing, add your Gmail address as a test user.
7. Open **Clients → Create client → Web application**.
8. Name it `PaperTrade IN Web`.
9. Under **Authorized JavaScript origins**, add:
   - `https://papertrade-in-web.vercel.app`
   - `http://localhost:3000`
10. In Supabase, open **Authentication → Providers → Google**. Supabase shows its callback URL. It normally looks like:
    - `https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback`
11. Add that exact Supabase URL under **Authorized redirect URIs** in Google Cloud.
12. Copy the Google Client ID and Client Secret into the Supabase Google provider and enable it.

Never put the Google Client Secret in the website, Android project or GitHub.

## 3. Configure Supabase redirect URLs

In Supabase, open **Authentication → URL Configuration**.

Set **Site URL** to:

`https://papertrade-in-web.vercel.app`

Add these **Redirect URLs**:

- `https://papertrade-in-web.vercel.app/auth/callback`
- `http://localhost:3000/auth/callback`
- `in.papertrade.app://auth/callback`

The custom `in.papertrade.app` URL returns Google login from the Android system browser to the installed app.

## 4. Add the public Supabase settings to Vercel

1. In Supabase, open **Project Settings → API**.
2. Copy the **Project URL**.
3. Copy the **Publishable key**. Older Supabase projects may call it the `anon` public key.
4. Open Vercel → `papertrade-in-web` → **Settings → Environment Variables**.
5. Add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = your Publishable key
   - `SUPABASE_SERVICE_ROLE_KEY` = the server-only service-role key from
     **Project Settings → API**
   - `FUNDAMENTAL_UPLOAD_TOKEN` = a new random secret, for example generate
     one with `python -c "import secrets; print(secrets.token_urlsafe(48))"`
6. Enable these variables for **Production**, **Preview** and **Development**.
7. Keep `UPSTOX_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` and
   `FUNDAMENTAL_UPLOAD_TOKEN` server-only. None may begin with `NEXT_PUBLIC_`.
8. Open **Deployments**, select the latest deployment menu and choose **Redeploy**.

Before the public Supabase variables exist, the app intentionally remains in
setup mode without blocking access. After redeployment, Google login and the
server-backed fundamentals feed are enabled.

## 5. Configure the monthly CSV upload

The scraper can upload the finished CSV directly after a successful scrape. In
the scraper folder, edit `stock_scout_config.env`:

```dotenv
FUNDAMENTAL_UPLOAD_URL=https://YOUR-VERCEL-DOMAIN/api/fundamentals/upload
FUNDAMENTAL_UPLOAD_TOKEN=the_same_value_as_vercel
```

Use the exact production domain of the `papertrade-in-web` Vercel project, not
the placeholder domain above. Keep this file on the scraper machine only; do
not commit it or paste the token into the website frontend. The script saves
the local CSV first and then uploads it, so a failed upload never destroys the
successful scrape.

Run one manual test from the scraper folder. The final lines should include:

```text
Saved 410 companies and 41 columns
Uploaded fundamental CSV to the live server (version ...)
```

Then sign in to the website, open **Fundamental Analysis**, and refresh the
page. The latest version is downloaded automatically; no file picker is needed.
If no file has been uploaded yet, the manual CSV control remains available.

For a monthly run on Windows, create a **Task Scheduler** task that starts
`run-scraper-windows.bat` on the last day of the month (or on the first day of
the next month if the Screener data closes later). Set **Start in** to the
scraper folder and use the same Windows account that can read the config and
master CSV. On Oracle/Linux, use a cron entry such as `5 23 28-31 * *` together
with a small wrapper that exits unless tomorrow is day 1; run only one job at a
time. The server stores only the latest CSV in Supabase, so the Oracle disk is
not used for a growing archive. Remove old local CSV/log files if the runner's
disk is nearly full.

## 6. Test the website login

1. Open <https://papertrade-in-web.vercel.app/> in an incognito/private browser window.
2. Confirm that the PaperTrade IN login page appears.
3. Select **Continue with Google** and use the Gmail address added as a Google test user.
4. Open the account avatar in the top-right corner.
5. Confirm that it shows **Portfolio synced**.
6. Place one small paper order, create a watchlist and change the virtual balance.
7. Sign out, sign back in and confirm that the information returns.
8. In Supabase **Table Editor → trading_states**, confirm that one row exists for your user.

If the account panel says **Cloud setup required**, run the SQL migration from section 1.

## 7. Test the Android app on your own phone

1. Install the current stable Android Studio from <https://developer.android.com/studio>.
2. During installation, include the Android SDK and Android Virtual Device. Android Studio's bundled Java runtime is sufficient.
3. On the phone, enable **Developer options → USB debugging**.
4. Connect the phone by USB and approve the debugging prompt.
5. In this repository run:

   ```text
   npm install
   npm run android:sync
   npm run android:open
   ```

6. Android Studio opens the `android` project. Wait for Gradle sync to complete.
7. Select your phone in the device list and press the green **Run** button.
8. Select Google login. It should open the phone's system browser and return to PaperTrade IN after approval.
9. Test login, logout, charts, paper orders, target/stop-loss, watchlists and screen rotation.

The Android package name is permanently set to `in.papertrade.app`. Do not create a different Play Console package name.

## 8. Prepare the Play Store account

1. Open <https://play.google.com/console/signup>.
2. Register a **Personal** developer account unless you operate a registered company.
3. Pay Google's one-time USD $25 registration fee.
4. Complete identity, address, phone and email verification exactly as requested.
5. Create an app named `PaperTrade IN` with package `in.papertrade.app`.

New personal accounts must normally complete a closed test with at least 12 testers continuously opted in for 14 days before requesting production access.

## 9. Create the signed Android App Bundle

1. In Android Studio open **Build → Generate Signed Bundle / APK**.
2. Select **Android App Bundle** (`.aab`). Google Play requires an app bundle for new apps.
3. Select **Create new** to create an upload keystore.
4. Save the keystore outside GitHub and back it up in two secure places.
5. Save the keystore password, key alias and key password in a password manager. Losing them can prevent future updates.
6. Choose the `release` build and generate the bundle.
7. Before every later upload, increase `versionCode` in `android/app/build.gradle`. The user-facing `versionName` should also be updated.

## 10. Complete the Play Console listing

Prepare these assets and answers:

- App icon: 512 × 512 PNG
- Feature graphic: 1024 × 500 PNG
- At least two clear phone screenshots
- Short description and full description
- Support email
- Public privacy-policy URL, for example `https://papertrade-in-web.vercel.app/privacy`
- Data Safety answers covering Google account name/email/user ID and cloud-saved paper-trading activity
- An explanation that the app uses only simulated virtual money and does not submit exchange orders
- App Access instructions explaining Google login to the reviewer
- Ads declaration, content rating, target audience and financial-features declaration

Do not describe the application as a broker or promise profits. Consistently call it an educational paper-trading simulator.

## 11. Testing and production release

1. Upload the signed `.aab` to **Internal testing** and test it yourself first.
2. Fix all Play pre-launch report crashes and policy warnings.
3. Create a **Closed testing** track and add at least 12 Gmail/Google Workspace testers.
4. Keep all 12 testers opted in continuously for at least 14 days and collect genuine feedback.
5. Apply for production access in the Play Console dashboard.
6. When approved, create a Production release using the tested bundle and submit it for review.

## Important work still required before public production

- Add an in-app and web account-deletion flow.
- Publish a completed privacy policy containing your real developer/support email.
- Move the Android login session from WebView storage into an Android Keystore-backed secure-storage plugin.
- Move target, stop-loss and intraday auto-square-off execution to an always-running backend so they work while the app is closed.
- Replace repeated price polling with an Upstox WebSocket service to reduce rate-limit failures.
- Replace the single shared Upstox token with a secure per-user broker connection before allowing users other than yourself.
- Add crash reporting, rate limiting, abuse protection, audit logs and database backups.
