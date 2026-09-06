import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { densities, launcherBackground, launcherPng, paddedArtwork, launcherSource, lightBrandSource, darkBrandSource } from "../scripts/generate-brand-assets.mjs";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const file = (path) => readFile(new URL(`../${path}`, import.meta.url));

test("website header uses dedicated approved light and dark marks", async () => {
  const brand = await source("components/BrandMark.tsx");
  assert.match(brand, /papertrade-mark-light-v118\.png/);
  assert.match(brand, /papertrade-mark-dark-v118\.png/);
  assert.match(brand, /brand-logo-pair/);
  for (const path of [launcherSource, lightBrandSource, darkBrandSource, "public/papertrade-mark-light-v118.png", "public/papertrade-mark-dark-v118.png"]) {
    const metadata = await sharp(await file(path)).metadata();
    assert.ok(metadata.width && metadata.height, path);
  }
  const light = await sharp(await file("public/papertrade-mark-light-v118.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const dark = await sharp(await file("public/papertrade-mark-dark-v118.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
    assert.match(icon.src, /v=1\.18/);
    const png = await file(`public${icon.src.split("?")[0]}`);
    const metadata = await sharp(png).metadata();
    assert.equal(`${metadata.width}x${metadata.height}`, icon.sizes);
  }
  const layout = await source("app/layout.tsx");
  assert.match(layout, /favicon-32-v118\.png/);
  assert.match(layout, /apple-touch-icon-v118\.png/);
});

test("native notifications include the updated launcher image", async () => {
  for (const name of ["TradeAlertPlugin", "IpoGmpAlertWorker"]) {
    assert.match(await source(`android/app/src/main/java/in/papertrade/app/${name}.java`), /setLargeIcon\(android.graphics.BitmapFactory.decodeResource\(context.getResources\(\), R.mipmap.ic_launcher\)\)/);
  }
});

test("both website download links serve v1.18 with its real checksum", async () => {
  const name = "PaperTrade-IN-v1.18-beta.apk";
  const checksum = createHash("sha256").update(await file(`public/downloads/${name}`)).digest("hex").toUpperCase();
  for (const path of ["components/TradingDashboard.tsx", "components/AuthProvider.tsx"]) {
    const content = await source(path);
    assert.ok(content.includes(`/downloads/${name}`));
    assert.ok(!content.includes("PaperTrade-IN-v1.17-beta.apk"));
  }
  assert.ok((await source("components/TradingDashboard.tsx")).includes(checksum));
  assert.match(await source("android/app/build.gradle"), /versionName "1\.18"/);
});
