import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import ts from "typescript";
import { densities, launcherBackground, launcherSvg, launcherVector } from "../scripts/generate-launcher-icons.mjs";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const file = (path) => readFile(new URL(`../${path}`, import.meta.url));
const foregroundPath = "assets/brand/papertrade-launcher-foreground.svg";

test("in-app branding remains the original single logo in both themes", async () => {
  const input = await source("components/BrandMark.tsx");
  const compiled = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {};
  new Function("require", "exports", compiled.outputText)(createRequire(import.meta.url), exports);
  const { props } = exports.BrandMark({ size: 34, className: "custom-logo" });
  assert.equal(props.src, "/papertrade-mark.svg");
  assert.equal(props.width, 34);
  assert.equal(props.height, 34);
  assert.equal(props.alt, "");
  assert.equal(props["aria-hidden"], "true");
  assert.equal(props.className, "brand-logo-image custom-logo");
  assert.doesNotMatch(await source("app/globals.css"), /brand-logo-light|brand-logo-dark|#007d73/);
  const favicon = await source("public/favicon.svg");
  assert.match(favicon, /#00c781/);
  assert.match(favicon, /#ff315f/);
  assert.match(await source("app/layout.tsx"), /favicon.svg\?v=original-20260903/);
});

test("adaptive square and round launcher resources use the native vector", async () => {
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
  const svg = await source(foregroundPath);
  const vector = await source(`${root}drawable-v24/ic_launcher_foreground.xml`);
  assert.equal(vector, launcherVector(svg));
  assert.match(vector, /android:fillColor="#0DA66D"/);
  assert.match(vector, /android:fillColor="#EF4444"/);
  assert.equal([...vector.matchAll(/<path /g)].length, 7);
  assert.doesNotMatch(svg, /<image\b|<script\b|<filter\b|href=/);
});

test("launcher foreground is centered and fits the adaptive 66dp safe circle", async () => {
  const { data, info } = await sharp(Buffer.from(await source(foregroundPath))).resize(432, 432).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = 432, maxX = 0, minY = 432, maxY = 0, green = 0, red = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      if (data[i + 3] < 16) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      assert.ok(Math.hypot((x + .5) / 4 - 54, (y + .5) / 4 - 54) <= 33, `outside safe zone at ${x},${y}`);
      if (data[i + 1] > data[i] * 2 && data[i + 1] > data[i + 2]) green++;
      if (data[i] > data[i + 1] * 2 && data[i] > data[i + 2] * 2) red++;
    }
  }
  assert.ok(Math.abs((minX + maxX + 1) / 8 - 54) < 1);
  assert.ok(Math.abs((minY + maxY + 1) / 8 - 54) < 1);
  assert.ok(green > 1000 && red > 1000, "both green and red candles remain visible");
});

test("all Android density fallbacks match the same vector artwork", async () => {
  const svg = await source(foregroundPath);
  for (const [density, scale] of Object.entries(densities)) {
    const root = `android/app/src/main/res/mipmap-${density}/`;
    for (const [name, shape] of [["ic_launcher", "square"], ["ic_launcher_round", "round"]]) {
      const png = await file(`${root}${name}.png`);
      const metadata = await sharp(png).metadata();
      assert.equal(metadata.width, 48 * scale);
      assert.equal(metadata.height, 48 * scale);
      assert.deepEqual(await sharp(png).raw().toBuffer(), await sharp(Buffer.from(launcherSvg(svg, shape))).resize(48 * scale, 48 * scale).raw().toBuffer());
    }
    const foreground = await file(`${root}ic_launcher_foreground.png`);
    assert.equal((await sharp(foreground).metadata()).width, 108 * scale);
  }
});

test("standalone launcher export matches the APK artwork", async () => {
  const svg = await source(foregroundPath);
  assert.equal(await source("assets/brand/papertrade-launcher.svg"), launcherSvg(svg) + "\n");
  const metadata = await sharp(await file("assets/brand/papertrade-launcher-512.png")).metadata();
  assert.equal(metadata.width, 512);
  assert.equal(metadata.height, 512);
});

test("vector conversion rejects unsupported artwork instead of losing it silently", () => {
  assert.throws(() => launcherVector('<svg viewBox="0 0 108 108"><rect/></svg>'), /only paths/);
  assert.throws(() => launcherVector('<svg viewBox="0 0 108 108"><path d="M1 1" transform="scale(2)"/></svg>'), /Unsupported/);
});

test("both website download links serve the new APK with its real checksum", async () => {
  const name = "PaperTrade-IN-v1.15-beta.apk";
  const apk = await file(`public/downloads/${name}`);
  const checksum = createHash("sha256").update(apk).digest("hex").toUpperCase();
  for (const path of ["components/TradingDashboard.tsx", "components/AuthProvider.tsx"]) {
    const content = await source(path);
    assert.ok(content.includes(`/downloads/${name}`));
    assert.ok(!content.includes("PaperTrade-IN-v1.10-beta.apk"));
  }
  assert.ok((await source("components/TradingDashboard.tsx")).includes(checksum));
  assert.match(await source("android/app/build.gradle"), /versionName "1.15"/);
});
