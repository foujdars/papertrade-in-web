package in.papertrade.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Refresh existing notices after an in-place app update without dismissing them. */
public class BrandUpdateReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) {
            NotificationDelivery.refreshBranding(context);
        }
    }
}
