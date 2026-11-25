import type { CapacitorConfig } from "@capacitor/cli";

// Open the current hosted deployment directly in the Android WebView.
const appUrl = process.env.PAPERTRADE_APP_URL ?? "https://foujdars-papertrade-in-web.vercel.app";

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
