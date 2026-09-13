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
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

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
            call.resolve();
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
        IpoGmpAlertWorker.cancel(getContext());
        call.resolve();
    }

    @PluginMethod
    public void setPriceAlerts(PluginCall call) {
        JSArray requested = call.getArray("alerts", new JSArray());
        JSONArray active = new JSONArray();
        android.content.SharedPreferences preferences = getContext().getSharedPreferences(
            PriceAlertMonitorService.PREFERENCES_NAME,
            Context.MODE_PRIVATE
        );
        for (int index = 0; index < requested.length(); index++) {
            JSONObject alert = requested.optJSONObject(index);
            if (alert == null) continue;
            String id = alert.optString("id", "");
            String instrumentKey = alert.optString("instrumentKey", "");
            if (id.isEmpty() || instrumentKey.isEmpty() || preferences.getBoolean(PriceAlertMonitorService.FIRED_PREFIX + id, false)) continue;
            active.put(alert);
        }
        preferences.edit().putString(PriceAlertMonitorService.ACTIVE_ALERTS_KEY, active.toString()).apply();
        Intent serviceIntent = new Intent(getContext(), PriceAlertMonitorService.class);
        if (active.length() > 0) ContextCompat.startForegroundService(getContext(), serviceIntent);
        else getContext().stopService(serviceIntent);
        call.resolve();
    }

    @PluginMethod
    public void consumeTriggeredPriceAlerts(PluginCall call) {
        android.content.SharedPreferences preferences = getContext().getSharedPreferences(
            PriceAlertMonitorService.PREFERENCES_NAME,
            Context.MODE_PRIVATE
        );
        JSONArray triggered;
        try {
            triggered = new JSONArray(preferences.getString(PriceAlertMonitorService.TRIGGERED_ALERTS_KEY, "[]"));
        } catch (Exception ignored) {
            triggered = new JSONArray();
        }
        preferences.edit().putString(PriceAlertMonitorService.TRIGGERED_ALERTS_KEY, "[]").apply();
        JSObject result = new JSObject();
        result.put("alerts", triggered);
        call.resolve(result);
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

    @PluginMethod
    public void configurePush(PluginCall call) {
        JSObject preferences=call.getObject("preferences",new JSObject());
        getContext().getSharedPreferences(NotificationDelivery.PREFS,0).edit().putString("preferences",preferences.toString()).apply();
        IpoGmpAlertWorker.cancel(getContext());
        if(Boolean.TRUE.equals(call.getBoolean("requestPermission",false)) && Build.VERSION.SDK_INT>=33 && getPermissionState("notifications")!=PermissionState.GRANTED) {
            requestPermissionForAlias("notifications",call,"pushPermissionCallback");return;
        }
        finishPushSetup(call);
    }
    @PermissionCallback private void pushPermissionCallback(PluginCall call) { finishPushSetup(call); }
    private void finishPushSetup(PluginCall call) {
        if(com.google.firebase.FirebaseApp.getApps(getContext()).isEmpty()){
            JSObject result=new JSObject();result.put("error","Firebase app configuration is pending. Install the updated app after setup.");call.resolve(result);return;
        }
        if(Build.VERSION.SDK_INT>=33&&getPermissionState("notifications")!=PermissionState.GRANTED){call.reject("Allow notifications in phone settings.");return;}
        com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token->{JSObject result=new JSObject();result.put("token",token);call.resolve(result);}).addOnFailureListener(error->call.reject("Push registration failed. Please retry."));
    }
    @PluginMethod public void consumeNotifications(PluginCall call) {
        android.content.SharedPreferences state=getContext().getSharedPreferences(NotificationDelivery.PREFS,0);
        JSObject result=new JSObject();
        synchronized(NotificationDelivery.class) {
            try{result.put("notifications",new JSONArray(state.getString("inbox","[]")));state.edit().putString("inbox","[]").apply();}catch(Exception ignored){}
        }
        call.resolve(result);
    }
    private void showNotification(PluginCall call) {
        JSONObject notice=new JSONObject();
        try{
            notice.put("id",call.getString("notificationId","event-"+System.currentTimeMillis()));
            notice.put("title",call.getString("title","PaperTrade IN"));notice.put("body",call.getString("body",""));
            notice.put("kind",call.getString("kind","trade"));notice.put("url",call.getString("url","/?screen=pnl"));
            notice.put("silent",Boolean.TRUE.equals(call.getBoolean("silent",false)));
            NotificationDelivery.show(getContext(),notice);
        }catch(Exception ignored){}
        call.resolve();
    }
}
