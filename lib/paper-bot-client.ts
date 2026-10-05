"use client";
import { getSupabaseBrowserClient } from './supabase-client';
import type { CloudBotAccount } from './paper-bot-background';
export type BackgroundState = { mode: 'checking' | 'local' | 'cloud' | 'blocked'; ready: boolean; message: string; lastChecked: number };
export type CloudBotResponse = { configured?: boolean; ready?: boolean; message?: string; record?: CloudBotAccount | null; error?: string };
export const signedInBotOwner = (owner: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner);
export class BotCloudError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function requestBotCloud(owner: string, body?: unknown): Promise<CloudBotResponse> {
  const session = (await getSupabaseBrowserClient()?.auth.getSession())?.data.session;
  if (!session || session.user.id !== owner) throw new BotCloudError('Sign in again to reconnect the background wallet.', 401);
  const response = await fetch('/api/paper-bot', { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  const data = await response.json() as CloudBotResponse;
  if (!response.ok) throw new BotCloudError(data.error ?? 'Background wallet unavailable. Refresh before retrying.', response.status);
  return data;
}
