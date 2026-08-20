"use client";

import type { Session } from "@supabase/supabase-js";
import { LogIn, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { deletePaperTradeAccount } from "@/lib/account-deletion-client";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import styles from "@/app/legal.module.css";

export function DeleteAccountClient() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmation, setConfirmation] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      queueMicrotask(() => { setLoading(false); setError("Secure account services are temporarily unavailable."); });
      return;
    }
    void client.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, []);

  async function signIn() {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setError("");
    window.sessionStorage.setItem("papertrade-auth-return", "/delete-account");
    const { error: signInError } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (signInError) setError(signInError.message);
  }

  async function removeAccount() {
    if (!session || confirmation !== "DELETE" || working) return;
    setWorking(true);
    setError("");
    try {
      await deletePaperTradeAccount(session.access_token);
      setSession(null);
      setDeleted(true);
    } catch (deletionError) {
      setError(deletionError instanceof Error ? deletionError.message : "Account deletion failed.");
    } finally {
      setWorking(false);
    }
  }

  if (deleted) return <div className={styles.success}><b>Your PaperTrade IN account has been deleted.</b><br />Your profile and synchronized paper-trading data were permanently removed. You may now close this page.</div>;
  if (loading) return <div className={styles.actionCard}><b>Checking your secure session…</b></div>;

  if (!session) {
    return (
      <div className={styles.actionCard}>
        <b>Verify the account you want to delete</b>
        <p>Sign in with the same Google account used for PaperTrade IN. We use this only to prevent another person from deleting your account.</p>
        <button className={styles.button} type="button" onClick={() => void signIn()}><LogIn size={17} /> Sign in with Google</button>
        {error && <p className={styles.error}>{error}</p>}
      </div>
    );
  }

  return (
    <div className={styles.actionCard}>
      <b>Signed in as {session.user.email}</b>
      <p><ShieldCheck size={14} /> This permanently removes your authentication account, profile, and synchronized balance, orders, watchlists, preferences, holdings, and P&amp;L data. It cannot be undone.</p>
      <label htmlFor="delete-confirmation">Type <b>DELETE</b> to confirm</label>
      <input id="delete-confirmation" className={styles.confirmInput} value={confirmation} onChange={(event) => setConfirmation(event.target.value.toUpperCase())} autoComplete="off" />
      <div className={styles.actions}>
        <button className={styles.dangerButton} type="button" disabled={confirmation !== "DELETE" || working} onClick={() => void removeAccount()}><Trash2 size={17} /> {working ? "Deleting…" : "Permanently delete account"}</button>
        <button className={styles.secondaryButton} type="button" onClick={() => window.location.assign("/")}>Cancel</button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
