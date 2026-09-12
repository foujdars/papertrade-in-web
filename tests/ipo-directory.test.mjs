import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { filterIpoBoard, issuerKey, matchIpoDirectory, parseIpoDirectory, parseIssuerLogo, parseSupplementalIpoLogo, safeIpoLogo, safeIpoPage } from "../lib/ipo-directory.ts";

const page = "https://www.chittorgarh.com/ipo/deepa-jewellers-ipo/2827/";
const logo = "https://www.chittorgarh.net/images/ipo/deepa-jewellers-ipo-logo.png";
const catalogue = `<a href="${page}"><b>Deepa Jewellers</b> IPO</a><a href="${page}">Deepa Jewellers IPO</a><a href="/ipo/ipo_dashboard.asp">Dashboard</a>`;

test("directory deduplicates real issue pages and ignores navigation/foreign URLs", () => {
  assert.deepEqual(parseIpoDirectory(catalogue + '<a href="https://evil.test/ipo/example/1/">Other</a>'), [{ name: "Deepa Jewellers IPO", url: page }]);
});

test("issuer matching is exact with legal suffixes and the verified Fly-Hi alias", () => {
  assert.equal(issuerKey("Fly-Hi Maritime Travels Limited IPO"), issuerKey("Fly-Hi Maritime IPO"));
  assert.equal(matchIpoDirectory("Deepa Jewellers Limited", parseIpoDirectory(catalogue))?.url, page);
  assert.equal(matchIpoDirectory("Deepa Gems", parseIpoDirectory(catalogue)), undefined);
  assert.equal(matchIpoDirectory("Deepa Jewellers", [{ name: "Deepa Jewellers", url: page }, { name: "Deepa Jewellers", url: page.replace("2827", "99") }]), undefined);
});

test("only the issuer's actual logo is used, never a broker or decorative image", () => {
  const html = `<img src="${logo}" alt="Broker logo"><img alt="Deepa Jewellers IPO Logo" src="${logo}">`;
  assert.equal(parseIssuerLogo(html, "Deepa Jewellers IPO"), logo);
  assert.equal(parseIssuerLogo(html, "Rays of Belief IPO"), undefined);
});

test("supplemental logos require the exact main issuer and an approved image destination", () => {
  const image = "https://media.ipoji.com/ipo/images/pranav-construction-ipo-logo.png";
  const html = `<section data-testid="ipo-summary-card" data-ipo-name="Pranav Constructions"><img alt="Pranav Constructions IPO logo" src="${image}"></section>`;
  assert.equal(parseSupplementalIpoLogo(html, "Pranav Constructions Limited IPO"), image);
  assert.equal(parseSupplementalIpoLogo(html, "Prasol Chemicals"), undefined);
  assert.equal(parseSupplementalIpoLogo(html.replace("ipo-summary-card", "related-issues"), "Pranav Constructions"), undefined);
  assert.equal(parseSupplementalIpoLogo(html.replace("media.ipoji.com", "media.ipoji.com.evil.test"), "Pranav Constructions"), undefined);
  assert.equal(safeIpoLogo(image + "?redirect=https://evil.test"), undefined);
  assert.equal(safeIpoLogo(image.replace(".png", ".svg")), undefined);
  assert.equal(issuerKey("Asset Reconstruction Co. (India)"), issuerKey("Asset Reconstruction Company (India) Limited IPO"));
});

test("supplemental logo requests share cached results and never follow arbitrary destinations", async t => {
  const input = (await readFile(new URL("../lib/ipo-logos-server.ts", import.meta.url), "utf8"))
    .replace('import "server-only";', "")
    .replace('from "./ipo-directory"', `from ${JSON.stringify(new URL("../lib/ipo-directory.ts", import.meta.url).href)}`)
    .replace('from "./ipo-publication"', `from ${JSON.stringify(new URL("../lib/ipo-publication.ts", import.meta.url).href)}`);
  const compiled = ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const { loadSupplementalIpoLogo } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  const logo = "https://media.ipoji.com/ipo/images/pranav-construction-ipo-logo.png";
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls++;
    assert.equal(url, "https://www.ipoji.com/ipo/pranav-constructions-ipo");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers, undefined);
    return new Response(`<section data-testid="ipo-summary-card" data-ipo-name="Pranav Constructions"><img alt="Pranav Constructions IPO logo" src="${logo}"></section>`, { headers: { "content-type": "text/html" } });
  });
  assert.equal(await loadSupplementalIpoLogo("https://evil.test"), undefined);
  assert.equal(calls, 0);
  assert.deepEqual(await Promise.all([loadSupplementalIpoLogo("Pranav Constructions"), loadSupplementalIpoLogo("Pranav Constructions")]), [logo, logo]);
  assert.equal(await loadSupplementalIpoLogo("Pranav Constructions"), logo);
  assert.equal(calls, 1);
});

test("external page and logo URLs reject unsafe destinations", () => {
  for (const url of ["javascript:alert(1)", "http://www.chittorgarh.com/ipo/test/1/", "https://www.chittorgarh.com.evil.test/ipo/test/1/", "https://user@www.chittorgarh.com/ipo/test/1/", page + "?redirect=https://evil.test", "https://127.0.0.1/ipo/test/1/"]) assert.equal(safeIpoPage(url), undefined);
  for (const url of [logo.replace(".net", ".net.evil.test"), logo.replace(".png", ".svg"), logo + "?token=secret", "data:image/png;base64,test"]) assert.equal(safeIpoLogo(url), undefined);
  assert.equal(safeIpoPage("/ipo/deepa-jewellers-ipo/2827/"), page);
  assert.equal(safeIpoLogo(logo), logo);
});

test("board filters separate open, upcoming and allotment rows without classifying unknowns", () => {
  const rows = [{ id: "main", issueType: "regular" }, { id: "sme", issueType: "sme" }, { id: "unknown" }];
  assert.deepEqual(filterIpoBoard(rows, "regular").map(x => x.id), ["main"]);
  assert.deepEqual(filterIpoBoard(rows, "sme").map(x => x.id), ["sme"]);
  assert.equal(rows.length, 3);
});

async function directoryServer() {
  const source = (await readFile(new URL("../lib/ipo-directory-server.ts", import.meta.url), "utf8"))
    .replace('import "server-only";', "")
    .replace('from "./ipo-directory"', `from ${JSON.stringify(new URL("../lib/ipo-directory.ts", import.meta.url).href)}`);
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}#${Math.random()}`);
}

test("directory shares in-flight requests and caches public metadata without credentials", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls++;
    assert.equal(options.redirect, "error");
    assert.equal(options.headers, undefined);
    return new Response(url === page ? `<img src="${logo}" alt="Deepa Jewellers IPO Logo">` : catalogue, { headers: { "content-type": "text/html" } });
  });
  const server = await directoryServer();
  const [one, two] = await Promise.all([server.loadIpoDirectory(), server.loadIpoDirectory()]);
  assert.equal(one, two);
  assert.equal(one.partial, false);
  assert.equal(one.entries[0].logoUrl, logo);
  assert.equal(await server.loadIpoDirectory(), one);
  assert.equal(calls, 2);
});

test("directory failure does not break IPO listings or invent a company link", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  const result = await (await directoryServer()).loadIpoDirectory();
  assert.equal(result.partial, true);
  assert.deepEqual(result.entries, []);
});

test("missing logo leaves the verified research link intact", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url === page) throw new Error("logo unavailable");
    return new Response(catalogue, { headers: { "content-type": "text/html" } });
  });
  const result = await (await directoryServer()).loadIpoDirectory();
  assert.equal(result.partial, true);
  assert.equal(result.entries[0].url, page);
  assert.equal(result.entries[0].logoUrl, undefined);
});

test("Markets and IPO have mutually exclusive top-level screens", async () => {
  const dashboard = await readFile(new URL("../components/TradingDashboard.tsx", import.meta.url), "utf8");
  const markets = await readFile(new URL("../components/MarketsWorkspace.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /marketsOpen && marketsInitialGroup === "IPO"/);
  assert.match(dashboard, /marketsOpen && marketsInitialGroup !== "IPO"/);
  assert.match(dashboard, /key={marketsInitialGroup}/);
  assert.match(dashboard, /lastScannerGroupRef\.current/);
  assert.doesNotMatch(markets, /IpoWorkspace|useState<ScannerGroup>/);
  assert.match(markets, /const scannerGroup = group/);
});

test("home omits the redundant activity feed while paper-order charts remain exact", async () => {
  const home = await readFile(new URL("../components/HomeWorkspace.tsx", import.meta.url), "utf8");
  const dashboard = await readFile(new URL("../components/TradingDashboard.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(home, /timeline\.map|onOpenActivity\(item\.id\)|No activity yet/);
  assert.match(dashboard, /function openPaperOrderChart\(order: PaperOrder\) {[\s\S]*?setHomeOpen\(false\)[\s\S]*?instrumentFromPaperOrder\(order, tradingUniverse\)/);
});
