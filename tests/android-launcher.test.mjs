import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import ts from "typescript";
import { densities, launcherBackground, launcherPng, paddedArtwork, brandSource } from "../scripts/generate-brand-assets.mjs";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const file = (path) => readFile(new URL(`../${path}`, import.meta.url));

test("website branding uses the approved shared artwork in both themes", async () => {
  const input = await source("components/BrandMark.tsx");
  const compiled = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {};
  new Function("require", "exports", compiled.outputText)(createRequire(import.meta.url), exports);
  const { props } = exports.BrandMark({ size: 34, className: "custom-logo" });
  assert.equal(props.src, "/papertrade-mark-v117.png");
  assert.equal(props.width, 34);
  assert.equal(props.height, 34);
  assert.equal(props.alt, "");
  assert.equal(props["aria-hidden"], "true");
  assert.equal(props.className, "brand-logo-image custom-logo");
  const expected = await sharp(await file(brandSource)).resize(512, 512).png().toBuffer();
  assert.deepEqual(await file("public/papertrade-mark-v117.png"), expected);
  for (const path of ["public/papertrade-mark.svg", "public/papertrade-mark-light.svg", "public/favicon.svg", "android-shell/papertrade-mark.svg"]) {
    assert.ok((await source(path)).includes(expected.toString("base64")), path);
  }
});

test("adaptive square and round icons use the approved density-specific bitmap", async () => {
  const root = "android/app/src/main/res/";
  const manifest = await source("android/app/src/main/AndroidManifest.xml");
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
  assert.match(manifest, /android:roundIcon="@mipmap\/ic_launcher_round"/);
  for (const name of ["ic_launcher", "ic_launcher_round"]) {
    const xml = await source(`${root}mipmap-anydpi-v26/${name}.xml`);
    assert.match(xml, /foreground android:drawable="@drawable\/ic_launcher_foreground"/);
    assert.match(xml, /background android:drawable="@color\/ic_launcher_background"/);
  }
  assert.ok((await source(`${root}values/ic_launcher_background.xml`)).includes(launcherBackground));
  assert.match(await source(`${root}drawable-v24/ic_launcher_foreground.xml`), /android:src="@mipmap\/ic_launcher_foreground"/);
});

test("document and green/red candles fit within the adaptive safe circle", async () => {
  const { data, info } = await sharp(await paddedArtwork(432, 2 / 3)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = 432, maxX = 0, minY = 432, maxY = 0, green = 0, red = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 3;
    const [r, g, b] = data.subarray(i, i + 3);
    const isGreen = g > r * 1.8 && g > b * 1.5;
    const isRed = r > g * 1.8 && r > b * 1.5;
    const isPaper = (r > 210 && g > 210 && b > 210) || (r < 55 && g < 55 && b < 55);
    if (!isPaper && !isGreen && !isRed) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    assert.ok(Math.hypot((x + .5) / 4 - 54, (y + .5) / 4 - 54) <= 33, `outside safe zone: ${x},${y}`);
    if (isGreen) green++;
    if (isRed) red++;
  }
  assert.ok(Math.abs((minX + maxX + 1) / 8 - 54) < 1);
  assert.ok(Math.abs((minY + maxY + 1) / 8 - 54) < 1);
  assert.ok(green > 1000 && red > 1000);
});

test("all Android density fallbacks derive from the same master artwork", async () => {
  for (const [density, scale] of Object.entries(densities)) {
    const root = `android/app/src/main/res/mipmap-${density}/`;
    for (const [name, shape] of [["ic_launcher", "square"], ["ic_launcher_round", "round"]]) {
      assert.deepEqual(await file(`${root}${name}.png`), await launcherPng(48 * scale, shape));
    }
    assert.deepEqual(await file(`${root}ic_launcher_foreground.png`), await paddedArtwork(108 * scale, 2 / 3));
  }
  assert.deepEqual(await file("assets/brand/papertrade-launcher-512.png"), await launcherPng(512));
});

test("PWA maskable icons are full-bleed and separate from rounded icons", async () => {
  const manifest = JSON.parse(await source("public/manifest.webmanifest"));
  assert.equal(manifest.icons.length, 4);
  for (const icon of manifest.icons) {
    const png = await file(`public${icon.src.split("?")[0]}`);
    const metadata = await sharp(png).metadata();
    assert.equal(`${metadata.width}x${metadata.height}`, icon.sizes);
    if (icon.purpose === "maskable") {
      const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let i = 3; i < data.length; i += 4) assert.equal(data[i], 255);
    }
  }
  assert.match(await source("app/layout.tsx"), /favicon-32-v117.png/);
  assert.match(await source("app/layout.tsx"), /apple-touch-icon-v117.png/);
});

test("native notifications include the updated brand image", async () => {
  for (const name of ["TradeAlertPlugin", "IpoGmpAlertWorker"]) {
    assert.match(await source(`android/app/src/main/java/in/papertrade/app/${name}.java`), /setLargeIcon\(android.graphics.BitmapFactory.decodeResource\(context.getResources\(\), R.mipmap.ic_launcher\)\)/);
  }
});

test("both website download links serve v1.17 with its real checksum", async () => {
  const name = "PaperTrade-IN-v1.17-beta.apk";
  const checksum = createHash("sha256").update(await file(`public/downloads/${name}`)).digest("hex").toUpperCase();
  for (const path of ["components/TradingDashboard.tsx", "components/AuthProvider.tsx"]) {
    const content = await source(path);
    assert.ok(content.includes(`/downloads/${name}`));
    assert.ok(!content.includes("PaperTrade-IN-v1.16-beta.apk"));
  }
  assert.ok((await source("components/TradingDashboard.tsx")).includes(checksum));
  assert.match(await source("android/app/build.gradle"), /versionName "1.17"/);
});

test("launcher padding uses the same violet as the app's light-theme accent", async () => {
  assert.equal(launcherBackground.toLowerCase(), "#6840d9");
  assert.ok((await source("app/globals.css")).includes(`--purple: ${launcherBackground.toLowerCase()}`));
});
