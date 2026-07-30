import type { CapacitorConfig } from "@capacitor/cli";

const appUrl = process.env.PAPERTRADE_APP_URL ?? "https://papertrade-in-web.vercel.app";

const config: CapacitorConfig = {
  appId: "in.papertrade.app",
  appName: "PaperTrade IN",
  webDir: "android-shell",
  backgroundColor: "#ffffff",
  zoomEnabled: true,
  loggingBehavior: "debug",
  server: {
    url: appUrl,
    appStartPath: "/chart?symbol=RELIANCE&timeframe=5m",
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
