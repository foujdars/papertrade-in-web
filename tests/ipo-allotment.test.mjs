import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { allotmentLink, classifyAllotment, identifyRegistrar, parseMufgCompanies, shouldSendAllotmentAlert, validIpoDate } from "../lib/ipo-allotment.ts";

test("allotment dates alone never announce publication", () => {
  assert.equal(classifyAllotment("closed", "2026-09-02", "2026-09-02", false), "unconfirmed");
  assert.equal(classifyAllotment("closed", "2026-09-01", "2026-09-02", false), "unconfirmed");
  assert.equal(classifyAllotment("closed", "2026-09-04", "2026-09-02", false), "scheduled");
  assert.equal(classifyAllotment("closed", "2026-09-02", "2026-09-02", true), "published");
  assert.equal(classifyAllotment("listed", "2026-09-01", "2026-09-02", false), "listed");
  assert.notEqual(classifyAllotment("open", "2026-09-02", "2026-09-02", true), "published");
});

test("result links are fixed HTTPS destinations with no investor data or arbitrary redirects", () => {
  assert.equal(identifyRegistrar("LINK INTIME INDIA PRIVATE LIMITED"), "mufg");
  assert.equal(identifyRegistrar("KFIN TECHNOLOGIES LIMITED KFINTECH"), "kfin");
  assert.equal(identifyRegistrar("BIGSHARE SERVICES"), "bigshare");
  assert.equal(identifyRegistrar("Unknown Registrar"), "bse");
  for (const key of ["mufg", "kfin", "bigshare", "bse"]) {
    const url = new URL(allotmentLink(key));
    assert.equal(url.protocol, "https:"); assert.equal(url.search, ""); assert.equal(url.username, "");
  }
  for (const bad of ["__proto__", "constructor", "https://evil.example", "//evil.example", "javascript:alert(1)", null]) assert.equal(allotmentLink(bad), null);
});

test("invalid timeline dates are ignored", () => {
  assert.equal(validIpoDate("2026-02-30"), "");
  assert.equal(validIpoDate("2026-09-01"), "2026-09-01");
  assert.equal(validIpoDate("September 1"), "");
});

test("allotment alerts are once per IPO and do not flood old listings or pending results", () => {
  const now = Date.parse("2026-09-02T12:00:00Z");
  const ipo = { id: "example", registrar: "mufg", state: "published", allotmentDate: "2026-09-02", listingDate: "2026-09-04", closeDate: "2026-09-01" };
  assert.equal(shouldSendAllotmentAlert(ipo, {}, now - 1000, now), true);
  assert.equal(shouldSendAllotmentAlert(ipo, { "ipo-allotment-example": now - 500 }, now - 1000, now), false);
  assert.equal(shouldSendAllotmentAlert(ipo, {}, 0, now), false);
  assert.equal(shouldSendAllotmentAlert({ ...ipo, state: "scheduled" }, {}, now - 1000, now), false);
  assert.equal(shouldSendAllotmentAlert({ ...ipo, state: "unconfirmed" }, {}, now - 1000, now), false);
  assert.equal(shouldSendAllotmentAlert({ ...ipo, allotmentDate: "2026-08-01" }, {}, now - 1000, now), false);
  assert.equal(shouldSendAllotmentAlert({ ...ipo, registrar: "constructor" }, {}, now - 1000, now), false);
});

test("registrar company matching only accepts numeric IDs and exact normalized names", () => {
  const xml = '<NewDataSet><Table><company_id>123</company_id><companyname>Example Limited - IPO</companyname></Table><Table><company_id>../../evil</company_id><companyname>Bad</companyname></Table></NewDataSet>';
  assert.deepEqual(parseMufgCompanies(xml), [{ id: "123", name: "EXAMPLE" }]);
});

test("notification worker cannot cache pages, collect PANs, or open arbitrary external links", async () => {
  const sw = await readFile(new URL("../public/notifications-sw.js", import.meta.url), "utf8");
  assert.doesNotMatch(sw, /addEventListener\(["'](?:fetch|push)["']/);
  assert.match(sw, /allowed\.includes\(registrar\)/);
  assert.match(sw, /self\.location\.origin/);
  const panel = await readFile(new URL("../components/IpoAllotments.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(panel, /<input/);
  assert.match(panel, /rel="noopener noreferrer"/);
});
