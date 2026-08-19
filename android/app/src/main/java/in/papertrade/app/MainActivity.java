package in.papertrade.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(TradeAlertPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
