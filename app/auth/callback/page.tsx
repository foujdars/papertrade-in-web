"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Completing secure Google sign-in…");

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    const code = new URLSearchParams(window.location.search).get("code");
    const requestedReturn = window.sessionStorage.getItem("papertrade-auth-return");
    window.sessionStorage.removeItem("papertrade-auth-return");
    const returnTo = requestedReturn === "/delete-account" ? requestedReturn : "/";
    if (!client || !code) {
      queueMicrotask(() => setMessage("The sign-in link is incomplete. Return to PaperTrade IN and try again."));
      return;
    }
    void client.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        router.replace(returnTo);
        return;
      }
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) setMessage(error.message);
      else router.replace(returnTo);
    });
  }, [router]);

  return <main className="auth-screen auth-loading-screen"><b>{message}</b></main>;
}
