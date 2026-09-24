import assert from "node:assert/strict";
import test from "node:test";
import { sessionOpenNotice } from "../lib/market-sessions.ts";
import { notificationPreferences } from "../lib/notification-policy.ts";

const at = (iso) => Date.parse(iso);

test("session opens follow each city's local clock, including daylight saving", () => {
  const india = sessionOpenNotice(at("2026-09-15T03:45:00Z"));
  assert.equal(india.id, "session-india-2026-09-15");
  assert.match(india.title, /India session is open/);
  assert.match(india.body, /9:15 am local time/);
  assert.match(india.body, /IST/);
  assert.equal(sessionOpenNotice(at("2026-09-15T03:44:00Z")), null);
  assert.ok(sessionOpenNotice(at("2026-09-15T03:47:00Z")));
  assert.equal(sessionOpenNotice(at("2026-09-15T03:48:00Z")), null);

  assert.equal(sessionOpenNotice(at("2026-01-06T00:00:00Z")).id, "session-tokyo-2026-01-06");
  assert.equal(sessionOpenNotice(at("2026-01-06T08:00:00Z")).id, "session-london-2026-01-06");
  assert.equal(sessionOpenNotice(at("2026-07-06T07:00:00Z")).id, "session-london-2026-07-06");
  assert.equal(sessionOpenNotice(at("2026-07-06T08:00:00Z")), null);
  assert.equal(sessionOpenNotice(at("2026-01-06T13:00:00Z")).id, "session-newyork-2026-01-06");
  assert.equal(sessionOpenNotice(at("2026-07-06T12:00:00Z")).id, "session-newyork-2026-07-06");
  assert.equal(sessionOpenNotice(at("2026-07-06T13:00:00Z")), null);
  assert.equal(sessionOpenNotice(at("2026-07-05T21:00:00Z")).id, "session-sydney-2026-07-06");
  assert.equal(sessionOpenNotice(at("2026-01-05T20:00:00Z")).id, "session-sydney-2026-01-06");
});

test("weekends and NSE holidays do not open the India session", () => {
  assert.equal(sessionOpenNotice(at("2026-01-10T03:45:00Z")), null);
  assert.equal(sessionOpenNotice(at("2026-10-02T03:45:00Z")), null);
  assert.equal(sessionOpenNotice(at("2026-10-02T00:00:00Z")).id, "session-tokyo-2026-10-02");
});

test("session alerts are on unless the user turns them off", () => {
  assert.equal(notificationPreferences(null).sessions, true);
  assert.equal(notificationPreferences({ sessions: false }).sessions, false);
});
