package in.papertrade.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class PriceAlertMonitorService extends Service {
    public static final String PREFERENCES_NAME = "papertrade_price_alerts";
    public static final String ACTIVE_ALERTS_KEY = "active_alerts";
    public static final String TRIGGERED_ALERTS_KEY = "triggered_alerts";
    public static final String FIRED_PREFIX = "fired_";
    private static final String MONITOR_CHANNEL_ID = "papertrade_protection_monitor_v1";
    private static final String ALERT_CHANNEL_ID = "papertrade_protection_alerts_v2";
    private static final int MONITOR_NOTIFICATION_ID = 28120;
    private static final ZoneId INDIA_ZONE = ZoneId.of("Asia/Kolkata");
    private ScheduledExecutorService executor;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannels();
        executor = Executors.newSingleThreadScheduledExecutor();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(MONITOR_NOTIFICATION_ID, buildMonitorNotification());
        if (executor != null) {
            executor.shutdownNow();
            executor = Executors.newSingleThreadScheduledExecutor();
            executor.scheduleWithFixedDelay(this::monitorSafely, 0, 20, TimeUnit.SECONDS);
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (executor != null) executor.shutdownNow();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void monitorSafely() {
        try {
            monitorOnce();
        } catch (Exception ignored) {
            // A temporary quote or network failure is retried on the next cycle.
        }
    }

    private void monitorOnce() throws Exception {
        SharedPreferences preferences = getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
        JSONArray active = new JSONArray(preferences.getString(ACTIVE_ALERTS_KEY, "[]"));
        if (active.length() == 0) {
            stopSelf();
            return;
        }
        if (!isNseMarketOpen()) return;

        List<String> keys = new ArrayList<>();
        for (int index = 0; index < active.length(); index++) {
            JSONObject alert = active.optJSONObject(index);
            String key = alert == null ? "" : alert.optString("instrumentKey", "");
            if (!key.isEmpty() && !keys.contains(key)) keys.add(key);
        }
        if (keys.isEmpty()) return;
        JSONObject quotes = fetchQuotes(keys);
        JSONArray remaining = new JSONArray();
        JSONArray pending = new JSONArray(preferences.getString(TRIGGERED_ALERTS_KEY, "[]"));

        for (int index = 0; index < active.length(); index++) {
            JSONObject alert = active.optJSONObject(index);
            if (alert == null) continue;
            String id = alert.optString("id", "");
            String key = alert.optString("instrumentKey", "");
            JSONObject quote = quotes.optJSONObject(key);
            double price = quote == null ? Double.NaN : quote.optDouble("lastPrice", Double.NaN);
            String trigger = triggerFor(alert, price);
            if (trigger == null) {
                remaining.put(alert);
                continue;
            }

            long triggeredAt = System.currentTimeMillis();
            JSONObject event = new JSONObject();
            event.put("id", id);
            event.put("symbol", alert.optString("symbol", "Stock"));
            event.put("trigger", trigger);
            event.put("triggeredPrice", price);
            event.put("triggeredAt", triggeredAt);
            pending.put(event);
            preferences.edit().putBoolean(FIRED_PREFIX + id, true).apply();
            showTriggeredNotification(alert, trigger, price);
        }

        while (pending.length() > 100) {
            JSONArray trimmed = new JSONArray();
            for (int index = pending.length() - 100; index < pending.length(); index++) trimmed.put(pending.opt(index));
            pending = trimmed;
        }
        preferences.edit()
            .putString(ACTIVE_ALERTS_KEY, remaining.toString())
            .putString(TRIGGERED_ALERTS_KEY, pending.toString())
            .apply();
        if (remaining.length() == 0) stopSelf();
    }

    private boolean isNseMarketOpen() {
        ZonedDateTime now = ZonedDateTime.now(INDIA_ZONE);
        DayOfWeek day = now.getDayOfWeek();
        if (day == DayOfWeek.SATURDAY || day == DayOfWeek.SUNDAY) return false;
        LocalTime time = now.toLocalTime();
        return !time.isBefore(LocalTime.of(9, 15)) && !time.isAfter(LocalTime.of(15, 30));
    }

    private String triggerFor(JSONObject alert, double price) {
        if (!Double.isFinite(price) || price <= 0) return null;
        boolean isLong = "LONG".equalsIgnoreCase(alert.optString("side"));
        double target = alert.optDouble("targetPrice", Double.NaN);
        double stopLoss = alert.optDouble("stopLossPrice", Double.NaN);
        if (Double.isFinite(target) && (isLong ? price >= target : price <= target)) return "TARGET";
        if (Double.isFinite(stopLoss) && (isLong ? price <= stopLoss : price >= stopLoss)) return "STOP_LOSS";
        return null;
    }

    private JSONObject fetchQuotes(List<String> keys) throws Exception {
        String joined = String.join(",", keys);
        String endpoint = "https://www.papertrade.site/api/upstox/quotes?keys="
            + URLEncoder.encode(joined, StandardCharsets.UTF_8.toString());
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(10_000);
        connection.setReadTimeout(15_000);
        connection.setRequestProperty("Accept", "application/json");
        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new IllegalStateException("Quote endpoint returned " + status);
            StringBuilder response = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) response.append(line);
            }
            JSONObject payload = new JSONObject(response.toString());
            if (!payload.optBoolean("ok", false)) throw new IllegalStateException("Quote response was unavailable");
            return payload.optJSONObject("quotes") == null ? new JSONObject() : payload.optJSONObject("quotes");
        } finally {
            connection.disconnect();
        }
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel monitor = new NotificationChannel(MONITOR_CHANNEL_ID, "Protection monitoring", NotificationManager.IMPORTANCE_LOW);
        monitor.setDescription("Keeps target and stop-loss alerts active while PaperTrade IN is closed");
        monitor.setShowBadge(false);
        manager.createNotificationChannel(monitor);
        NotificationChannel alerts = new NotificationChannel(ALERT_CHANNEL_ID, "PaperTrade alerts", NotificationManager.IMPORTANCE_HIGH);
        alerts.setDescription("Target and stop-loss alerts");
        alerts.enableVibration(true);
        manager.createNotificationChannel(alerts);
    }

    private PendingIntent launchIntent(int requestCode) {
        Intent intent = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification buildMonitorNotification() {
        return new NotificationCompat.Builder(this, MONITOR_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setLargeIcon(android.graphics.BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher))
            .setContentTitle("PaperTrade protection is active")
            .setContentText("Targets and stop losses are being monitored in the background.")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(launchIntent(MONITOR_NOTIFICATION_ID))
            .build();
    }

    private void showTriggeredNotification(JSONObject alert, String trigger, double price) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        String symbol = alert.optString("symbol", "Stock");
        String reason = "TARGET".equals(trigger) ? "Target reached" : "Stop-loss reached";
        String body = String.format(Locale.ENGLISH, "%s reached the protected level at Rs %,.2f. Open the app to review the completed exit.", symbol, price);
        Notification notification = new NotificationCompat.Builder(this, ALERT_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setLargeIcon(android.graphics.BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher))
            .setContentTitle("PaperTrade IN - " + reason)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setDefaults(Notification.DEFAULT_ALL)
            .setContentIntent(launchIntent(alert.optString("id", symbol).hashCode()))
            .setAutoCancel(true)
            .build();
        manager.notify(alert.optString("id", symbol).hashCode() & 0x7fffffff, notification);
    }
}
