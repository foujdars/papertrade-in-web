// Branding is intentionally split by surface: the approved white tile is the
// launcher/PWA icon, while the header uses dedicated light and dark marks.
import { readFile, writeFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const asset = (path) => new URL(path, root);
export const launcherBackground = "#ffffff";
export const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
export const launcherSource = "assets/brand/papertrade-launcher-master-v118.png";
export const lightBrandSource = "assets/brand/papertrade-logo-light-master-v118.png";
export const darkBrandSource = "assets/brand/papertrade-logo-dark-master-v118.png";
export const brandSource = launcherSource;

async function fittedSource(path, size, background = { r: 0, g: 0, b: 0, alpha: 0 }) {
  return sharp(await readFile(asset(path)))
    .resize(size, size, { fit: "contain", background })
    .png()
    .toBuffer();
}

async function darkHeaderMark(size) {
  const source = await readFile(asset(darkBrandSource));
  // The supplied preview has a checkerboard baked into it. Keep only the dark
  // document silhouette so the real app background shows around the mark.
  const mask = Buffer.from(`<svg width="1254" height="1254" viewBox="0 0 1254 1254"><path fill="white" d="M355 136H792L1032 382V967c0 96-66 145-151 145H356c-92 0-145-57-145-145V281c0-94 57-145 144-145Z"/></svg>`);
  const transparent = await sharp(source).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  return sharp(transparent).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

export async function paddedArtwork(size, artworkFraction = 1) {
  const side = Math.round(size * artworkFraction);
  const input = await fittedSource(launcherSource, side, launcherBackground);
  const offset = Math.floor((size - side) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: launcherBackground } })
    .composite([{ input, left: offset, top: offset }]).png().toBuffer();
}

export async function launcherPng(size, shape = "square") {
  const artwork = await paddedArtwork(size);
  const mask = shape === "round"
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>`
    : `<rect width="${size}" height="${size}" rx="${size * .22}" fill="white"/>`;
  return sharp(artwork).composite([{ input: Buffer.from(`<svg width="${size}" height="${size}">${mask}</svg>`), blend: "dest-in" }]).png().toBuffer();
}

async function generate() {
  const lightMark = await fittedSource(lightBrandSource, 512);
  const darkMark = await darkHeaderMark(512);
  await writeFile(asset("public/papertrade-mark-light-v118.png"), lightMark);
  await writeFile(asset("public/papertrade-mark-dark-v118.png"), darkMark);
  await writeFile(asset("public/papertrade-mark.png"), lightMark);
  const alias = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image width="512" height="512" href="data:image/png;base64,${lightMark.toString("base64")}"/></svg>\n`;
  for (const name of ["papertrade-mark.svg", "papertrade-mark-light.svg", "favicon.svg"]) await writeFile(asset(`public/${name}`), alias);
  for (const size of [192, 512]) {
    await writeFile(asset(`public/papertrade-icon-${size}.png`), await launcherPng(size));
    await writeFile(asset(`public/papertrade-maskable-${size}.png`), await paddedArtwork(size, .94));
  }
  await writeFile(asset("public/apple-touch-icon-v118.png"), await launcherPng(180));
  for (const size of [32, 64]) await writeFile(asset(`public/favicon-${size}-v118.png`), await launcherPng(size));
  for (const [density, scale] of Object.entries(densities)) {
    const folder = `android/app/src/main/res/mipmap-${density}/`;
    for (const [name, shape] of [["ic_launcher", "square"], ["ic_launcher_round", "round"]]) {
      await writeFile(asset(`${folder}${name}.png`), await launcherPng(48 * scale, shape));
    }
    await writeFile(asset(`${folder}ic_launcher_foreground.png`), await paddedArtwork(108 * scale, 2 / 3));
  }
  await writeFile(asset("assets/brand/papertrade-launcher-512.png"), await launcherPng(512));
  await writeFile(asset("assets/brand/papertrade-launcher.svg"), alias);
  await writeFile(asset("android-shell/papertrade-mark.svg"), alias);
  const res = "android/app/src/main/res/";
  for (const dir of await readdir(asset(res), { withFileTypes: true })) {
    if (!dir.isDirectory() || !dir.name.startsWith("drawable")) continue;
    const splash = asset(`${res}${dir.name}/splash.png`);
    let metadata;
    try { metadata = await sharp(await readFile(splash)).metadata(); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    const icon = await launcherPng(Math.round(Math.min(metadata.width, metadata.height) * .24));
    const image = await sharp({ create: { width: metadata.width, height: metadata.height, channels: 4, background: "#070d20" } })
      .composite([{ input: icon, gravity: "centre" }]).png().toBuffer();
    await writeFile(splash, image);
  }
  console.log("Generated separate header marks plus launcher, PWA, favicon and Android artwork.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await generate();
