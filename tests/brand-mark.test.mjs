import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import sharp from "sharp";
import ts from "typescript";
import postcss from "postcss";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("light logo is a self-contained vector and stays renderable at header and export sizes", async () => {
  const svg = await source("public/papertrade-mark-light.svg");
  assert.match(svg, /viewBox="0 0 64 64"/);
  assert.doesNotMatch(svg, /<image\b|<script\b|<filter\b|href=|data:image/);
  for (const size of [30, 34, 42, 58, 256]) {
    const { info } = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, size);
    assert.equal(info.height, size);
  }
});

test("shared brand component keeps intrinsic sizing and decorative accessibility in both themes", async () => {
  const input = await source("components/BrandMark.tsx");
  const compiled = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {};
  new Function("require", "exports", compiled.outputText)(createRequire(import.meta.url), exports);
  const children = exports.BrandMark({ size: 34, className: "custom-logo" }).props.children;
  assert.deepEqual(children.map(({ props }) => props.src), ["/papertrade-mark-light.svg", "/papertrade-mark.svg"]);
  for (const { props } of children) {
    assert.equal(props.width, 34);
    assert.equal(props.height, 34);
    assert.equal(props.alt, "");
    assert.equal(props["aria-hidden"], "true");
    assert.match(props.className, /custom-logo/);
  }
  assert.equal(children[1].props.loading, "eager");
});

test("the application's theme, not OS preference, selects the logo without a client-side delay", async () => {
  const tree = postcss.parse(await source("app/globals.css"));
  const displays = {};
  tree.walkRules((rule) => {
    rule.walkDecls("display", (decl) => { displays[rule.selector] = decl.value; });
  });
  assert.equal(displays[".brand-logo-dark"], "none");
  assert.equal(displays['.terminal-shell[data-theme="neon"] .brand-logo-light, .auth-screen .brand-logo-light'], "none");
  assert.equal(displays['.terminal-shell[data-theme="neon"] .brand-logo-dark, .auth-screen .brand-logo-dark'], "block");
  assert.doesNotMatch(await source("components/BrandMark.tsx"), /useEffect|localStorage|matchMedia/);
});

test("browser icon uses the matching vector palette and has a fresh cache key", async () => {
  const favicon = await source("public/favicon.svg");
  assert.match(favicon, /#008577/);
  assert.match(favicon, /#6351bc/);
  assert.doesNotMatch(favicon, /<image\b|<filter\b|#050d22/);
  assert.match(await source("app/layout.tsx"), /favicon.svg\?v=light-20260903/);
});
