import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { indiaDateKey } from "../lib/ipo.ts";

async function serverWith(t, upstream) {
  t.mock.method(globalThis, "__allotmentTestFetch", upstream);
  let source = await readFile(new URL("../lib/ipo-allotment-server.ts", import.meta.url), "utf8");
  source = source.replace('import "server-only";', "")
    .replace('import { kfinPublicationReport } from "./ipo-kfin-server";', "const kfinPublicationReport = async () => undefined;")
    .replace('from "./ipo-allotment"', `from ${JSON.stringify(new URL("../lib/ipo-allotment.ts", import.meta.url).href)}`)
    .replace('from "./ipo"', `from ${JSON.stringify(new URL("../lib/ipo.ts", import.meta.url).href)}`)
    .replace('import { upstoxFetch } from "./upstox-server";', "const upstoxFetch = globalThis.__allotmentTestFetch;");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}#${Math.random()}`);
}

globalThis.__allotmentTestFetch = async () => { throw new Error("Unconfigured test provider"); };

test("KFin release checks require an exact catalogue match and an explicit release report", async (t) => {
  let source = await readFile(new URL("../lib/ipo-kfin-server.ts", import.meta.url), "utf8");
  source = source.replace('import "server-only";', "")
    .replace('from "./ipo-publication"', `from ${JSON.stringify(new URL("../lib/ipo-publication.ts", import.meta.url).href)}`);
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const server = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}#kfin`);
  const reportUrl = "https://www.ipoji.com/ipo-allotment-status/pranav-constructions-ipo";
  let released = false, catalogueCalls = 0;
  t.mock.method(globalThis, "fetch", async (input, options) => {
    const url = String(input);
    assert.equal(options.redirect, "error");
    if (url === "https://ipostatus.kfintech.com/") {
      catalogueCalls++;
      return new Response('<script src="./static/js/main.a123.js"></script>');
    }
    if (url === "https://ipostatus.kfintech.com/static/js/main.a123.js") return new Response(`JSON.parse('[{"clientId":"123","name":"PRANAV CONSTRUCTIONS LIMITED"}]')`);
    assert.equal(url, reportUrl, "no investor lookup or arbitrary URLs are requested");
    return new Response(`<section data-testid="ipo-summary-card" data-ipo-name="Pranav Constructions" data-ipo-status="${released ? "Allotment Out" : "Awaiting Allotment"}">`);
  });
  assert.equal(await server.kfinPublicationReport("Pranav Constructions IPO"), undefined);
  released = true;
  assert.equal(await server.kfinPublicationReport("Pranav Constructions IPO"), reportUrl);
  assert.equal(await server.kfinPublicationReport("Different Company IPO"), undefined);
  assert.equal(catalogueCalls, 1, "registrar catalogue is shared and cached");
  t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  assert.equal(await server.kfinPublicationReport("Pranav Constructions IPO"), undefined, "unavailable reports never become published");
});

test("IPO detail enrichment preserves missing prices and verifies publication rather than using dates", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "__allotmentTestFetch", async path => {
    calls++;
    const id = path.split("/").at(-1);
    return { data: { id, name: "Example IPO", status: "closed", listing_price: null, cut_off_price: 100, daily_end_time: "17:00",
      timeline: { allotment_date: "2020-01-01", refund_initiation_date: "2026-09-07", listing_date: "2026-09-08" },
      registrar_info: { name: id === "kfin" ? "KFin Technologies" : "MUFG Intime" } } };
  });
  let source = await readFile(new URL("../lib/ipo-details-server.ts", import.meta.url), "utf8");
  source = source.replace('import "server-only";', "")
    .replace('import { upstoxFetch } from "./upstox-server";', "const upstoxFetch = globalThis.__allotmentTestFetch;")
    .replace('from "./ipo-allotment"', `from ${JSON.stringify(new URL("../lib/ipo-allotment.ts", import.meta.url).href)}`)
    .replace('import { verifyPublishedAllotment } from "./ipo-allotment-server";', "const verifyPublishedAllotment = async (_name, registrar) => registrar === 'mufg' ? 'https://example.org/evidence.pdf' : undefined;");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const server = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}#details`);
  const [first, second] = await Promise.all([server.loadIpoDetails("kfin"), server.loadIpoDetails("kfin")]);
  assert.equal(calls, 1, "concurrent visitors share a detail request");
  assert.equal(first, second);
  assert.equal(first.listingPrice, null);
  assert.equal(first.dematDate, "", "refund date must not be guessed as demat date");
  assert.equal(first.dailyEndTime, "17:00:00");
  assert.equal(first.allotmentPublished, false, "an old date is not publication evidence");
  assert.equal(first.registrarUrl, "https://ipostatus.kfintech.com/");
  assert.equal((await server.loadIpoDetails("mufg")).allotmentPublished, true);
});

test("allotment server verifies a public PDF, preserves failed details and shares its cache", async (t) => {
  const today = indiaDateKey();
  const issues = ["sample", "other", "bad"].map((id) => ({ id, name: id === "sample" ? "Example IPO" : id, status: "closed", bidding_end_date: today }));
  let calls = 0;
  const server = await serverWith(t, async (path) => {
    calls++;
    if (path.includes("status=closed")) return { data: issues };
    if (path.includes("status=listed")) return { data: [] };
    const id = path.split("/").at(-1);
    if (id === "bad") throw new Error("Details unavailable");
    return { data: { id, status: "closed", timeline: { allotment_date: today }, registrar_info: { name: id === "sample" ? "MUFG Intime" : "KFINTECH" } } };
  });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.endsWith("IPO.aspx/GetDetails")) {
      assert.equal(options.body, "{}");
      return Response.json({ d: "<Table><company_id>123</company_id><companyname>Example Limited IPO</companyname></Table>" });
    }
    assert.equal(url, "https://in.mpms.mufg.com/Initial_Offer/PDF/123/BasisOfAllotment.pdf");
    assert.equal(options.redirect, "error");
    return new Response("%PDF-1.7 test", { headers: { "Content-Type": "application/pdf" } });
  });
  const data = await server.loadAllotments();
  assert.equal(data.partial, true);
  assert.equal(data.allotments.find(i => i.id === "sample").state, "published");
  assert.equal(data.allotments.find(i => i.id === "other").state, "unconfirmed");
  assert.equal(data.allotments.find(i => i.id === "bad").state, "unavailable");
  assert.equal(await server.loadAllotments(), data);
  assert.equal(calls, 5);
});

test("an HTML error document cannot produce an allotment publication alert", async (t) => {
  const today = indiaDateKey();
  const server = await serverWith(t, async (path) => path.includes("?")
    ? { data: path.includes("status=closed") ? [{ id: "sample", name: "Example IPO", status: "closed", bidding_end_date: today }] : [] }
    : { data: { id: "sample", status: "closed", timeline: { allotment_date: today }, registrar_info: { name: "MUFG Intime" } } });
  t.mock.method(globalThis, "fetch", async (url) => url.endsWith("GetDetails")
    ? Response.json({ d: "<Table><company_id>123</company_id><companyname>Example Limited IPO</companyname></Table>" })
    : new Response("<html>not ready</html>", { headers: { "Content-Type": "application/pdf" } }));
  assert.equal((await server.loadAllotments()).allotments[0].state, "unconfirmed");
});

test("total upstream failure is an error, not a successful empty allotment list", async (t) => {
  const server = await serverWith(t, async () => { throw new Error("offline"); });
  await assert.rejects(server.loadAllotments(), /temporarily unavailable/);
});
