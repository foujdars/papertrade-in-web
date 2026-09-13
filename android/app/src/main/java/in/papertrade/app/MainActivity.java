package in.papertrade.app;

import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onResume() { super.onResume(); NotificationDelivery.foreground=true; openNotification(); }
    @Override public void onPause() { NotificationDelivery.foreground=false; super.onPause(); }
    @Override protected void onNewIntent(android.content.Intent intent) { super.onNewIntent(intent); setIntent(intent); openNotification(); }
    private void openNotification() {
        String path=getIntent().getStringExtra("notificationPath");
        if(path!=null && getBridge()!=null && getBridge().getWebView()!=null) {
            getIntent().removeExtra("notificationPath");
            getBridge().getWebView().post(()->getBridge().getWebView().loadUrl("https://www.papertrade.site"+NotificationDelivery.safePath(path)));
        }
    }
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        boolean isDebuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (!isDebuggable) {
            WebView.setWebContentsDebuggingEnabled(false);
        }
        registerPlugin(TradeAlertPlugin.class);
        super.onCreate(savedInstanceState);
        // Retire the imprecise device-polling schedules after the app update.
        IpoGmpAlertWorker.cancel(this);
    }
}
