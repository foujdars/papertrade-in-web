package in.papertrade.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.concurrent.TimeUnit;

public class IpoGmpAlertWorker extends Worker {
    public static final String PREFERENCES_NAME = "papertrade_ipo_alerts";
    public static final String ENABLED_KEY = "enabled";
    private static final String UNIQUE_WORK_NAME = "papertrade_daily_ipo_gmp_alert";
    private static final String CHANNEL_ID = "papertrade_ipo_gmp_alerts_v1";
    private static final String ENDPOINT = "https://www.papertrade.site/api/upstox/ipos?status=open";
    private static final ZoneId INDIA_ZONE = ZoneId.of("Asia/Kolkata");

    public IpoGmpAlertWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    public static void schedule(Context context) {
        ZonedDateTime now = ZonedDateTime.now(INDIA_ZONE);
        ZonedDateTime nextRun = now.withHour(10).withMinute(0).withSecond(0).withNano(0);
        if (!nextRun.isAfter(now)) nextRun = nextRun.plusDays(1);
        long initialDelayMillis = Duration.between(now, nextRun).toMillis();
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(IpoGmpAlertWorker.class, 24, TimeUnit.HOURS)
            .setInitialDelay(initialDelayMillis, TimeUnit.MILLISECONDS)
            .setConstraints(constraints)
            .build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            UNIQUE_WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        );
    }

    public static void cancel(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_WORK_NAME);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
        if (!preferences.getBoolean(ENABLED_KEY, false)) return Result.success();
        try {
            JSONObject payload = fetchPayload();
            if (!payload.optBoolean("ok", false) || !payload.optBoolean("gmpFeedConfigured", false)) return Result.success();
            JSONArray ipos = payload.optJSONArray("ipos");
            if (ipos == null) return Result.success();
            String today = ZonedDateTime.now(INDIA_ZONE).toLocalDate().toString();
            for (int index = 0; index < ipos.length(); index++) {
                JSONObject ipo = ipos.optJSONObject(index);
                if (ipo == null || !"open".equalsIgnoreCase(ipo.optString("status"))) continue;
                double gmpPercent = ipo.optDouble("gmpPercent", Double.NaN);
                if (!Double.isFinite(gmpPercent) || gmpPercent <= 15.0) continue;
                String ipoId = ipo.optString("id", ipo.optString("symbol", String.valueOf(index)));
                String stateKey = "last_alert_date_" + ipoId;
                if (today.equals(preferences.getString(stateKey, ""))) continue;
                double gmpAmount = ipo.optDouble("gmpAmount", 0.0);
                String symbol = ipo.optString("symbol", ipo.optString("name", "IPO"));
                String endDate = ipo.optString("biddingEndDate", "");
                String body = String.format(
                    java.util.Locale.ENGLISH,
                    "GMP is ₹%.2f (%.2f%% of upper issue price). Bidding closes %s.",
                    gmpAmount,
                    gmpPercent,
                    endDate.isEmpty() ? "soon" : endDate
                );
                showNotification(context, "" + symbol + " IPO GMP is above 15%", body, ("ipo-gmp-" + ipoId + "-" + today).hashCode());
                preferences.edit().putString(stateKey, today).apply();
            }
            return Result.success();
        } catch (Exception error) {
            return getRunAttemptCount() < 3 ? Result.retry() : Result.success();
        }
    }

    private JSONObject fetchPayload() throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(ENDPOINT).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(12_000);
        connection.setReadTimeout(20_000);
        connection.setRequestProperty("Accept", "application/json");
        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new IllegalStateException("IPO endpoint returned " + status);
            StringBuilder response = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) response.append(line);
            }
            return new JSONObject(response.toString());
        } finally {
            connection.disconnect();
        }
    }

    private void showNotification(Context context, String title, String body, int notificationId) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Daily IPO GMP alerts", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Daily alerts for open IPOs with GMP above 15 percent");
            channel.enableVibration(true);
            manager.createNotificationChannel(channel);
        }
        Intent launchIntent = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            notificationId,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setLargeIcon(android.graphics.BitmapFactory.decodeResource(context.getResources(), R.mipmap.ic_launcher))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(contentIntent)
            .setAutoCancel(true);
        manager.notify(notificationId & 0x7fffffff, notification.build());
    }
}
