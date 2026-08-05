"use client";

import { App as CapacitorApp, type URLOpenListenerEvent } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import type { Session, User } from "@supabase/supabase-js";
import { Cloud, LogIn, ShieldCheck, TrendingUp } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-client";

type SyncStatus = "disabled" | "loading" | "synced" | "saving" | "error";

type AuthContextValue = {
  configured: boolean;
  session: Session | null;
  user: User | null;
  syncStatus: SyncStatus;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const NATIVE_AUTH_CALLBACK = "in.papertrade.app://auth/callback";
const CLOUD_STORAGE_KEYS = [
  "papertrade-orders",
  "papertrade-protections",
  "papertrade-balance",
  "papertrade-custom-watchlists",
  "papertrade-last-chart",
  "papertrade-theme",
] as const;

type CloudTradingState = Record<string, string>;

function readCloudTradingState(): CloudTradingState {
  return Object.fromEntries(
    CLOUD_STORAGE_KEYS.flatMap((key) => {
      const value = window.localStorage.getItem(key);
      return value === null ? [] : [[key, value]];
    }),
  );
}

function restoreCloudTradingState(state: unknown) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return;
  const record = state as Record<string, unknown>;
  for (const key of CLOUD_STORAGE_KEYS) {
    const value = record[key];
    if (typeof value === "string") window.localStorage.setItem(key, value);
  }
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(configured);
  const [cloudReady, setCloudReady] = useState(!configured);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(configured ? "loading" : "disabled");
  const [authError, setAuthError] = useState("");
  const lastUploadedState = useRef("");
  const activeUserId = useRef<string | null>(null);

  const finishNativeSignIn = useCallback(async (url: string) => {
    if (!url.startsWith(NATIVE_AUTH_CALLBACK)) return;
    const code = new URL(url).searchParams.get("code");
    const client = getSupabaseBrowserClient();
    if (!code || !client) return;
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) setAuthError(error.message);
    await Browser.close().catch(() => undefined);
  }, []);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!configured || !client) return;

    let active = true;
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      activeUserId.current = data.session?.user.id ?? null;
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user.id ?? null;
      const userChanged = activeUserId.current !== nextUserId;
      activeUserId.current = nextUserId;
      setSession(nextSession);
      setAuthLoading(false);
      if (!nextSession) setCloudReady(true);
      else if (userChanged) setCloudReady(false);
    });

    let removeDeepLinkListener: (() => Promise<void>) | undefined;
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
        void finishNativeSignIn(event.url);
      }).then((handle) => { removeDeepLinkListener = () => handle.remove(); });
      void CapacitorApp.getLaunchUrl().then((result) => {
        if (result?.url) void finishNativeSignIn(result.url);
      });
    }

    return () => {
      active = false;
      listener.subscription.unsubscribe();
      void removeDeepLinkListener?.();
    };
  }, [configured, finishNativeSignIn]);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!configured || !client || !session?.user.id) return;
    let active = true;

    void client
      .from("trading_states")
      .select("state")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (!active) return;
        if (error) {
          setSyncStatus("error");
          setAuthError("Google login works, but cloud storage is not ready. Run the supplied Supabase database setup.");
          setCloudReady(true);
          return;
        }
        let syncFailed = false;
        if (data?.state) {
          restoreCloudTradingState(data.state);
        } else {
          const initialState = readCloudTradingState();
          const result = await client.from("trading_states").upsert({ user_id: session.user.id, state: initialState });
          if (result.error) {
            syncFailed = true;
            setSyncStatus("error");
            setAuthError("Google login works, but cloud storage is not ready. Run the supplied Supabase database setup.");
          }
        }
        lastUploadedState.current = JSON.stringify(readCloudTradingState());
        if (!syncFailed) setSyncStatus("synced");
        setCloudReady(true);
      });

    return () => { active = false; };
  }, [configured, session?.user.id]);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!configured || !client || !session?.user.id || !cloudReady) return;
    let saving = false;
    const interval = window.setInterval(async () => {
      if (saving) return;
      const state = readCloudTradingState();
      const serialized = JSON.stringify(state);
      if (serialized === lastUploadedState.current) return;
      saving = true;
      setSyncStatus("saving");
      const { error } = await client.from("trading_states").upsert({ user_id: session.user.id, state });
      if (error) {
        setSyncStatus("error");
      } else {
        lastUploadedState.current = serialized;
        setSyncStatus("synced");
      }
      saving = false;
    }, 1_500);
    return () => window.clearInterval(interval);
  }, [cloudReady, configured, session?.user.id]);

  const signInWithGoogle = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setAuthError("");
    const native = Capacitor.isNativePlatform();
    const redirectTo = native ? NATIVE_AUTH_CALLBACK : `${window.location.origin}/auth/callback`;
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: native },
    });
    if (error) {
      setAuthError(error.message);
      return;
    }
    if (native && data.url) await Browser.open({ url: data.url, windowName: "_system" });
  }, []);

  const signOut = useCallback(async () => {
    const client = getSupabaseBrowserClient();
    if (client && session?.user.id) {
      await client.from("trading_states").upsert({ user_id: session.user.id, state: readCloudTradingState() });
    }
    await client?.auth.signOut();
    for (const key of CLOUD_STORAGE_KEYS) window.localStorage.removeItem(key);
    lastUploadedState.current = "";
    setSession(null);
    setSyncStatus(configured ? "loading" : "disabled");
  }, [configured, session]);

  const contextValue = useMemo<AuthContextValue>(() => ({
    configured,
    session,
    user: session?.user ?? null,
    syncStatus,
    signInWithGoogle,
    signOut,
  }), [configured, session, signInWithGoogle, signOut, syncStatus]);

  return (
    <AuthContext.Provider value={contextValue}>
      {configured && (authLoading || (session && !cloudReady)) ? (
        <main className="auth-screen auth-loading-screen"><span className="auth-logo"><TrendingUp size={28} /></span><b>Preparing PaperTrade IN…</b><small>Securing your account and loading your paper portfolio.</small></main>
      ) : configured && !session ? (
        <main className="auth-screen">
          <section className="auth-card">
            <span className="auth-logo"><TrendingUp size={30} /></span>
            <span className="eyebrow">Secure paper trading</span>
            <h1>Welcome to PaperTrade IN</h1>
            <p>Sign in to keep your virtual balance, watchlists, orders and P&amp;L securely connected to your account.</p>
            <button className="google-signin" onClick={() => void signInWithGoogle()}><LogIn size={19} /><span>Continue with Google</span></button>
            {authError && <div className="auth-error">{authError}</div>}
            <div className="auth-points"><span><ShieldCheck size={15} /> Paper trading only</span><span><Cloud size={15} /> Cloud-synced portfolio</span></div>
            <small className="auth-disclaimer">No real exchange orders are placed. Your Google password is never shared with PaperTrade IN.</small>
          </section>
        </main>
      ) : children}
    </AuthContext.Provider>
  );
}
