// The website and Android use the same approved image. Only asset sizing,
// safe padding and launcher masks are applied here, never a redrawn logo.
import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const asset = (path) => new URL(path, root);
export const launcherBackground = "#6840D9";
export const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
export const brandSource = "assets/brand/papertrade-brand-master.png";

export async function paddedArtwork(size, artworkFraction = 1) {
  const side = Math.round(size * artworkFraction);
  const input = await sharp(await readFile(asset(brandSource))).resize(side, side).png().toBuffer();
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
  const source = await readFile(asset(brandSource));
  const mark = await sharp(source).resize(512, 512).png().toBuffer();
  await writeFile(asset("public/papertrade-mark-v117.png"), mark);
  await writeFile(asset("public/papertrade-mark.png"), mark);
  // Old SVG URLs remain usable, but show the same new artwork.
  const alias = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><clipPath id="icon"><rect width="512" height="512" rx="112"/></clipPath></defs><image width="512" height="512" clip-path="url(#icon)" href="data:image/png;base64,${mark.toString("base64")}"/></svg>\n`;
  for (const name of ["papertrade-mark.svg", "papertrade-mark-light.svg", "favicon.svg"]) await writeFile(asset(`public/${name}`), alias);
  for (const size of [192, 512]) {
    await writeFile(asset(`public/papertrade-icon-${size}.png`), await launcherPng(size));
    await writeFile(asset(`public/papertrade-maskable-${size}.png`), await paddedArtwork(size, .94));
  }
  await sharp(source).resize(180, 180).png().toFile(fileURLToPath(asset("public/apple-touch-icon-v117.png")));
  for (const size of [32, 64]) await writeFile(asset(`public/favicon-${size}-v117.png`), await launcherPng(size));
  for (const [density, scale] of Object.entries(densities)) {
    const folder = `android/app/src/main/res/mipmap-${density}/`;
    for (const [name, shape] of [["ic_launcher", "square"], ["ic_launcher_round", "round"]]) {
      await writeFile(asset(`${folder}${name}.png`), await launcherPng(48 * scale, shape));
    }
    // Android reveals central 72dp of 108dp; the paper fits its 66dp safe circle.
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
  console.log("Generated website, favicon, PWA, Android adaptive/legacy and splash artwork from one master.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await generate();
