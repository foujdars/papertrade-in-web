package in.papertrade.app;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handlePaperTradeBack();
            }
        });
    }

    private void handlePaperTradeBack() {
        if (getBridge() == null || getBridge().getWebView() == null) {
            finish();
            return;
        }

        WebView webView = getBridge().getWebView();
        String currentUrl = webView.getUrl();
        if (currentUrl != null) {
            Uri currentUri = Uri.parse(currentUrl);
            if (currentUri.getPath() != null && currentUri.getPath().startsWith("/chart")) {
                String symbol = currentUri.getQueryParameter("symbol");
                String timeframe = currentUri.getQueryParameter("timeframe");
                Uri.Builder tradeUri = currentUri.buildUpon().path("/").clearQuery().fragment(null);
                if (symbol != null && !symbol.isEmpty()) {
                    tradeUri.appendQueryParameter("symbol", symbol);
                }
                if (timeframe != null && !timeframe.isEmpty()) {
                    tradeUri.appendQueryParameter("timeframe", timeframe);
                }
                webView.clearHistory();
                webView.loadUrl(tradeUri.build().toString());
                return;
            }
        }

        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            finish();
        }
    }
}
