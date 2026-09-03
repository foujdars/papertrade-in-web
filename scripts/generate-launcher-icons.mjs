// The launcher artwork is independent of public/papertrade-mark.svg (in-app branding).
// Convert the path-only SVG into an Android vector and legacy raster fallbacks.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const asset = (path) => new URL(path, root);
export const launcherBackground = "#F5F4FC";
export const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

export function launcherVector(svg) {
  // Fail rather than silently dropping unsupported artwork in a future edit.
  const tags = [...svg.matchAll(/<([a-zA-Z]+)\b/g)].map((match) => match[1]);
  if (!tags.every((tag) => tag === "svg" || tag === "path") || !svg.includes('viewBox="0 0 108 108"')) {
    throw new Error("Launcher source must contain only paths on a 108 x 108 viewport.");
  }
  const keys = { d: "pathData", fill: "fillColor", stroke: "strokeColor", "stroke-width": "strokeWidth", "stroke-linecap": "strokeLineCap", "stroke-linejoin": "strokeLineJoin" };
  const paths = [...svg.matchAll(/<path\s+([^>]+)\/>/g)].map((match) => {
    const attributes = [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => {
      if (!keys[key]) throw new Error(`Unsupported launcher attribute: ${key}`);
      return `android:${keys[key]}="${value === "none" ? "#00000000" : value}"`;
    });
    return `    <path ${attributes.join(" ")} />`;
  });
  if (!paths.length) throw new Error("Launcher has no paths.");
  return `<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated from assets/brand/papertrade-launcher-foreground.svg. -->\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">\n${paths.join("\n")}\n</vector>\n`;
}

export function launcherSvg(foreground, shape = "square") {
  const paths = foreground.slice(foreground.indexOf(">") + 1, foreground.lastIndexOf("</svg>"));
  const mask = shape === "round"
    ? '<circle cx="54" cy="54" r="36"/>'
    : '<rect x="18" y="18" width="72" height="72" rx="16"/>';
  // Android displays the central 72dp of an adaptive layer. Match that scale in legacy icons.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 18 72 72"><defs><clipPath id="mask">${mask}</clipPath></defs><g clip-path="url(#mask)"><path d="M18 18h72v72H18Z" fill="${launcherBackground}"/>${paths}</g></svg>`;
}

async function generate() {
  const foreground = await readFile(asset("assets/brand/papertrade-launcher-foreground.svg"), "utf8");
  await writeFile(asset("android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml"), launcherVector(foreground));
  for (const [density, scale] of Object.entries(densities)) {
    const folder = `android/app/src/main/res/mipmap-${density}/`;
    for (const [name, shape] of [["ic_launcher", "square"], ["ic_launcher_round", "round"]]) {
      await sharp(Buffer.from(launcherSvg(foreground, shape))).resize(48 * scale, 48 * scale).png().toFile(fileURLToPath(asset(`${folder}${name}.png`)));
    }
    await sharp(Buffer.from(foreground)).resize(108 * scale, 108 * scale).png().toFile(fileURLToPath(asset(`${folder}ic_launcher_foreground.png`)));
  }
  const preview = launcherSvg(foreground);
  await writeFile(asset("assets/brand/papertrade-launcher.svg"), preview + "\n");
  await sharp(Buffer.from(preview)).resize(512, 512).png().toFile(fileURLToPath(asset("assets/brand/papertrade-launcher-512.png")));
  console.log("Generated Android vector, adaptive foregrounds, legacy icons and launcher preview. Website branding unchanged.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generate();
}
