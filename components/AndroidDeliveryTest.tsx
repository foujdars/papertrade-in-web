"use client";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { requestAndroidDeliveryTest } from "@/lib/push-client";
export function AndroidDeliveryTest({ ready }: { ready: boolean }) {
  const [android, setAndroid] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [test, setTest] = useState<{ id: string; status: string } | null>(null);
  useEffect(() => { setAndroid(Capacitor.getPlatform() === "android"); }, []);
  if (!android) return null;
  async function act(action: "queue" | "status" | "confirm") {
    setBusy(true);
    try {
      const result = await requestAndroidDeliveryTest(action, test?.id);
      if (action === "queue") { setTest({ id: result.id, status: "pending" }); setMessage(result.message); }
      else if (action === "confirm") { setTest(t => t && ({ ...t, status: "confirmed" })); setMessage("Receipt confirmed by you. This verifies this test, not future market triggers."); }
      else { setTest(result.test); setMessage(result.test ? ({ pending: "Waiting for the scheduler. Close the app normally and allow up to two minutes.", accepted: "Firebase accepted the test. Did you see it while the app was closed?", confirmed: "You confirmed receipt of this test.", sending: "Send started; receipt is not yet confirmed.", "needs-review": "Transport outcome uncertain. Confirm only if you actually received the test.", expired: "Test expired before delivery. The scheduler needs checking.", cancelled: "Test cancelled: device disconnected or notifications disabled." }[result.test.status as string] ?? "Check your notification tray.") : "No test has been requested for this account."); }
    } catch (e) { setMessage(e instanceof Error ? e.message : "Test unavailable."); }
    finally { setBusy(false); }
  }
  return <section className="technical-summary"><div><b>Android closed-app delivery test</b><p>Enable Trade notifications first. This sends one test to this phone, not a market alert.</p><div className="technical-rule-actions"><button disabled={busy || !ready} onClick={() => void act("queue")}>Test closed-app delivery</button><button disabled={busy || !ready} onClick={() => void act("status")}>Check test status</button>{test && ["accepted", "sending", "needs-review"].includes(test.status) && <button disabled={busy} onClick={() => void act("confirm")}>I received it with the app closed</button>}</div>{!ready && <small>A healthy server scheduler is required.</small>}{message && <p role="status">{message}</p>}</div></section>;
}
