import type { CapacitorConfig } from "@capacitor/cli";

// Use the canonical host directly in the Android WebView. Avoiding the apex
// redirect removes an unnecessary network hop during a cold mobile start.
const appUrl = process.env.PAPERTRADE_APP_URL ?? "https://www.papertrade.site";

const config: CapacitorConfig = {
  appId: "in.papertrade.app",
  appName: "PaperTrade IN",
  webDir: "android-shell",
  backgroundColor: "#ffffff",
  zoomEnabled: true,
  // Never forward console output from the production WebView to Android logs.
  loggingBehavior: "none",
  server: {
    url: appUrl,
    appStartPath: "/",
    cleartext: false,
    errorPath: "offline.html",
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#ffffff",
    zoomEnabled: true,
    minWebViewVersion: 60,
  },
};

export default config;
