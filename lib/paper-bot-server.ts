import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { backgroundActive, type CloudBotAccount } from './paper-bot-background';
import { readGlobalAccount } from './global-order-engine';
import type { PerpAccount } from './global-markets';

export class BotRequestError extends Error { constructor(message: string, public status = 503) { super(message); } }
export const botStorageConfigured = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
export function botDatabase() {
  if (!botStorageConfigured()) throw new BotRequestError('Background bot storage needs server setup.');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function botUser(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  if (!request.headers.get('authorization')?.startsWith('Bearer ') || !token || token.length > 8192) throw new BotRequestError('Sign in to use the background bot.', 401);
  const db = botDatabase();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new BotRequestError('Your session expired. Sign in again.', 401);
  return { db, userId: data.user.id };
}
export function requireBotScheduler(request: Request) {
  const secret = process.env.PAPER_BOT_CRON_SECRET ?? '', given = request.headers.get('authorization') ?? '', expected = `Bearer ${secret}`;
  if (secret.length < 32) throw new BotRequestError('Background bot scheduler needs server setup.');
  if (Buffer.byteLength(given) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) throw new BotRequestError('Unauthorized scheduler.', 401);
}
export async function botHealth(db = botDatabase()) {
  const { data, error } = await db.from('paper_bot_runtime').select('last_run,previous_run,ok').eq('id', true).maybeSingle();
  if (error) throw new BotRequestError('Background bot database setup is required.', ['42P01', 'PGRST205'].includes(error.code) ? 424 : 503);
  // Two separate recent ticks are required; a one-off manual dispatch is not proof of a scheduler.
  const ready = (process.env.PAPER_BOT_CRON_SECRET?.length ?? 0) >= 32 && data?.ok === true && Date.now() - data.last_run < 45_000 && data.previous_run > 0 && data.last_run - data.previous_run >= 5_000 && data.last_run - data.previous_run < 45_000;
  return { ready: !!ready, lastRun: data?.last_run ?? 0, message: ready ? 'Background server online' : 'Background scheduler setup or recovery required' };
}
export async function cloudBotAccount(db: ReturnType<typeof botDatabase>, userId: string): Promise<CloudBotAccount | null> {
  const { data, error } = await db.from('paper_bot_accounts').select('user_id,account,version,last_checked_at,last_error').eq('user_id', userId).maybeSingle();
  if (error && ['42P01', 'PGRST205'].includes(error.code)) throw new BotRequestError('Background bot database setup is required.', 424);
  if (error) throw new BotRequestError('Background wallet is unavailable. Local trading is locked to prevent duplicate trades.');
  return data ? { ...data, account: readGlobalAccount(JSON.stringify(data.account)) } : null;
}
export async function saveCloudBotAccount(db: ReturnType<typeof botDatabase>, current: CloudBotAccount, account: PerpAccount, checked: number | null = null, error: string | null = null): Promise<CloudBotAccount | null> {
  const { data, error: failure } = await db.rpc('paper_bot_compare_and_set', { p_user_id: current.user_id, p_version: current.version, p_account: account, p_active: backgroundActive(account), p_checked: checked, p_error: error });
  if (failure) throw new BotRequestError('The shared wallet could not be saved. Refresh before retrying.');
  return data?.[0] ?? null;
}
export function botError(error: unknown) {
  return Response.json({ error: error instanceof BotRequestError ? error.message : 'Background bot service unavailable. Refresh before retrying.' }, { status: error instanceof BotRequestError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
}
