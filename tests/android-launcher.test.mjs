import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { densities, launcherBackground, launcherPng, paddedArtwork, launcherSource, lightBrandSource, darkBrandSource } from "../scripts/generate-brand-assets.mjs";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const file = (path) => readFile(new URL(`../${path}`, import.meta.url));

test("website header uses the approved transparent document mark in both themes", async () => {
  const brand = await source("components/BrandMark.tsx");
  assert.match(brand, /papertrade-mark-light-v120\.png/);
  assert.match(brand, /papertrade-mark-dark-v120\.png/);
  assert.match(brand, /brand-logo-pair/);
  for (const path of [launcherSource, lightBrandSource, darkBrandSource, "public/papertrade-mark-light-v120.png", "public/papertrade-mark-dark-v120.png"]) {
    const metadata = await sharp(await file(path)).metadata();
    assert.ok(metadata.width && metadata.height, path);
  }
  const light = await sharp(await file("public/papertrade-mark-light-v120.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const dark = await sharp(await file("public/papertrade-mark-dark-v120.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.ok(light.data.some((value, index) => index % 4 === 3 && value === 0), "light mark must remain transparent");
  assert.ok(dark.data.some((value, index) => index % 4 === 3 && value === 0), "dark mark must remove preview checkerboard");
});

test("adaptive square and round icons use the requested white launcher artwork", async () => {
  const root = "android/app/src/main/res/";
  const manifest = await source("android/app/src/main/AndroidManifest.xml");
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
  assert.match(manifest, /android:roundIcon="@mipmap\/ic_launcher_round"/);
  for (const name of ["ic_launcher", "ic_launcher_round"]) {
    const xml = await source(`${root}mipmap-anydpi-v26/${name}.xml`);
    assert.match(xml, /foreground android:drawable="@drawable\/ic_launcher_foreground"/);
    assert.match(xml, /background android:drawable="@color\/ic_launcher_background"/);
  }
  assert.equal(launcherBackground.toLowerCase(), "#ffffff");
  assert.ok((await source(`${root}values/ic_launcher_background.xml`)).toLowerCase().includes(launcherBackground));
  assert.match(await source(`${root}drawable-v24/ic_launcher_foreground.xml`), /android:src="@mipmap\/ic_launcher_foreground"/);
});

test("launcher artwork contains both green and red candles", async () => {
  const { data } = await sharp(await file(launcherSource)).removeAlpha().resize(256, 256).raw().toBuffer({ resolveWithObject: true });
  let green = 0, red = 0;
  for (let i = 0; i < data.length; i += 3) {
    const [r, g, b] = data.subarray(i, i + 3);
    if (g > r * 1.5 && g > b * 1.4) green++;
    if (r > g * 1.5 && r > b * 1.4) red++;
  }
  assert.ok(green > 1000 && red > 1000);
});

test("all Android density fallbacks derive from the same launcher master", async () => {
  for (const [density, scale] of Object.entries(densities)) {
    const root = `android/app/src/main/res/mipmap-${density}/`;
    for (const [name, shape] of [["ic_launcher", "square"], ["ic_launcher_round", "round"]]) {
      assert.deepEqual(await file(`${root}${name}.png`), await launcherPng(48 * scale, shape));
    }
    assert.deepEqual(await file(`${root}ic_launcher_foreground.png`), await paddedArtwork(108 * scale, 2 / 3));
  }
  assert.deepEqual(await file("assets/brand/papertrade-launcher-512.png"), await launcherPng(512));
});

test("PWA icon assets and cache versions are current", async () => {
  const manifest = JSON.parse(await source("public/manifest.webmanifest"));
  assert.equal(manifest.icons.length, 4);
  for (const icon of manifest.icons) {
    assert.match(icon.src, /v=1\.20/);
    const png = await file(`public${icon.src.split("?")[0]}`);
    const metadata = await sharp(png).metadata();
    assert.equal(`${metadata.width}x${metadata.height}`, icon.sizes);
  }
  const layout = await source("app/layout.tsx");
  assert.match(layout, /favicon-32-v120\.png/);
  assert.match(layout, /apple-touch-icon-v120\.png/);
});

test("native notifications include the updated launcher image", async () => {
  for (const name of ["TradeAlertPlugin", "IpoGmpAlertWorker", "IpoOpeningAlertWorker", "PriceAlertMonitorService"]) {
    const notificationSource = await source(`android/app/src/main/java/in/papertrade/app/${name}.java`);
    assert.match(notificationSource, /setLargeIcon\(android.graphics.BitmapFactory.decodeResource\(/);
    assert.match(notificationSource, /R\.mipmap\.ic_launcher/);
  }
  const ipoWorker = await source("android/app/src/main/java/in/papertrade/app/IpoGmpAlertWorker.java");
  assert.match(ipoWorker, /last_closing_alert_date_/);
  assert.match(ipoWorker, /last day to apply/);
  assert.doesNotMatch(ipoWorker, /!payload\.optBoolean\("gmpFeedConfigured"/);
  const openingWorker = await source("android/app/src/main/java/in/papertrade/app/IpoOpeningAlertWorker.java");
  assert.match(openingWorker, /withHour\(10\)\.withMinute\(20\)/);
  assert.match(openingWorker, /opened today/);
  const protectionMonitor = await source("android/app/src/main/java/in/papertrade/app/PriceAlertMonitorService.java");
  assert.match(protectionMonitor, /scheduleWithFixedDelay\(this::monitorSafely, 0, 20, TimeUnit\.SECONDS\)/);
  assert.match(protectionMonitor, /TRIGGERED_ALERTS_KEY/);
});

test("both website download links serve v1.21 with its real checksum", async () => {
  const name = "PaperTrade-IN-v1.21-beta.apk";
  const checksum = createHash("sha256").update(await file(`public/downloads/${name}`)).digest("hex").toUpperCase();
  for (const path of ["components/TradingDashboard.tsx", "components/AuthProvider.tsx"]) {
    const content = await source(path);
    assert.ok(content.includes(`/downloads/${name}`));
    assert.ok(!content.includes("PaperTrade-IN-v1.20-beta.apk"));
  }
  assert.ok((await source("components/TradingDashboard.tsx")).includes(checksum));
  assert.match(await source("android/app/build.gradle"), /versionName "1\.21"/);
});
