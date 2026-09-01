package in.papertrade.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "TradeAlert",
    permissions = @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
)
public class TradeAlertPlugin extends Plugin {
    private static final String CHANNEL_ID = "papertrade_protection_alerts_v2";

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve();
            return;
        }
        requestPermissionForAlias("notifications", call, "permissionCallback");
    }

    @PluginMethod
    public void show(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "showPermissionCallback");
            return;
        }
        showNotification(call);
    }

    @PluginMethod
    public void setIpoAlerts(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getContext().getSharedPreferences(IpoGmpAlertWorker.PREFERENCES_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(IpoGmpAlertWorker.ENABLED_KEY, enabled)
            .apply();
        if (enabled) IpoGmpAlertWorker.schedule(getContext());
        else IpoGmpAlertWorker.cancel(getContext());
        call.resolve();
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PermissionCallback
    private void showPermissionCallback(PluginCall call) {
        if (getPermissionState("notifications") == PermissionState.GRANTED) showNotification(call);
        else call.resolve();
    }

    private void showNotification(PluginCall call) {
        Context context = getContext();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            call.resolve();
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "PaperTrade alerts", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Paper trade protection, portfolio, market and IPO alerts");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[] { 0, 250, 120, 250 });
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setShowBadge(true);
            manager.createNotificationChannel(channel);
        }
        String title = call.getString("title", "PaperTrade IN");
        String body = call.getString("body", "A paper trade protection level was reached.");
        Intent launchIntent = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            (int) (System.currentTimeMillis() & 0x7fffffff),
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(Notification.DEFAULT_ALL)
            .setVibrate(new long[] { 0, 250, 120, 250 })
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(Notification.CATEGORY_ALARM)
            .setContentIntent(contentIntent)
            .setAutoCancel(true);
        String requestedId = call.getString("notificationId");
        int notificationId = requestedId == null
            ? (int) (System.currentTimeMillis() & 0x7fffffff)
            : requestedId.hashCode() & 0x7fffffff;
        manager.notify(notificationId, notification.build());
        call.resolve();
    }
}
