import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import postcss from "postcss";
import ts from "typescript";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const css = await source("app/motion.css");
const tree = postcss.parse(css);

test("motion stylesheet is loaded after the existing theme and uses bounded entrances", async () => {
  assert.match(await source("app/layout.tsx"), /import "\.\/globals\.css";\s*import "\.\/motion\.css";/);
  const keyframes = [];
  tree.walkAtRules("keyframes", (rule) => keyframes.push(rule.params));
  assert.deepEqual(keyframes, ["pt-fade-in", "pt-rise-in", "pt-panel-in", "pt-icon-in"]);
  tree.walkDecls("animation", (decl) => {
    if (decl.value === "none") return;
    assert.doesNotMatch(decl.value, /infinite|forwards|both/);
    assert.match(decl.parent.selector, /\[data-motion="full"\]/);
    let parent = decl.parent;
    while (parent && !(parent.type === "atrule" && parent.name === "media")) parent = parent.parent;
    assert.match(parent?.params ?? "", /prefers-reduced-motion: no-preference/);
  });
});

test("both reduced-motion paths stop old and new animations including pseudo-elements", () => {
  const checks = [];
  tree.walkRules((rule) => {
    if (!rule.selector.includes("*::after")) return;
    const values = Object.fromEntries(rule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node]));
    if (values.animation?.value !== "none") return;
    assert.equal(values.animation.important, true);
    assert.equal(values.transition?.value, "none");
    assert.equal(values.transition.important, true);
    assert.equal(values["scroll-behavior"]?.value, "auto");
    checks.push(rule.parent.type === "atrule" ? rule.parent.params : rule.selector);
  });
  assert.equal(checks.length, 2);
  assert.ok(checks.some((entry) => entry.includes('data-motion="reduced"')));
  assert.ok(checks.includes("(prefers-reduced-motion: reduce)"));
});

test("page motion leaves fixed children and price-chart coordinates unchanged", () => {
  tree.walkRules((rule) => {
    if (!rule.selector.includes(".home-workspace")) return;
    assert.deepEqual(rule.nodes.map(({ prop, value }) => [prop, value]), [["animation", "pt-fade-in 180ms ease-out"]]);
  });
  const fade = tree.nodes.find((node) => node.type === "atrule" && node.params === "pt-fade-in");
  fade.walkDecls((decl) => assert.equal(decl.prop, "opacity"));
  assert.doesNotMatch(css, /\.chart-area|\.chart-risk-tool|\.risk-target-line|\.risk-stop-line|\bwill-change\s*:/);
});

test("motion preference persists and navigation highlight does not remount the chart", async () => {
  const dashboard = await source("components/TradingDashboard.tsx");
  assert.match(dashboard, /setMotionEnabled\(saved\.motionEnabled !== false\)/);
  assert.match(dashboard, /density: uiDensity,\s*motionEnabled,/);
  assert.match(dashboard, /data-motion=\{uiPreferencesReady && motionEnabled \? "full" : "reduced"\}/);
  assert.match(dashboard, /role="switch" aria-checked=\{motionEnabled\}/);
  assert.match(dashboard, /"--nav-index": activeNavigationSection/);
  assert.doesNotMatch(dashboard, /key=\{(?:motionEnabled|activeNavigationSection)\}/);
  const result = ts.transpileModule(dashboard, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 }, fileName: "TradingDashboard.tsx", reportDiagnostics: true });
  assert.deepEqual(result.diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error), []);
});
