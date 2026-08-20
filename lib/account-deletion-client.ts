import { getSupabaseBrowserClient } from "@/lib/supabase-client";

export function clearPaperTradeDeviceData() {
  if (typeof window === "undefined") return;
  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith("papertrade-")) window.localStorage.removeItem(key);
  }
}

export async function deletePaperTradeAccount(accessToken: string) {
  const response = await fetch("/api/account/delete", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ confirmation: "DELETE" }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || "We could not delete the account. Please try again.");

  const client = getSupabaseBrowserClient();
  await client?.auth.signOut({ scope: "local" }).catch(() => undefined);
  clearPaperTradeDeviceData();
}
