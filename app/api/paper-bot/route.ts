import { backgroundActive } from '@/lib/paper-bot-background';
import { readGlobalAccount } from '@/lib/global-order-engine';
import { botError, botHealth, botStorageConfigured, botUser, BotRequestError, cloudBotAccount, saveCloudBotAccount } from '@/lib/paper-bot-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  try {
    if (!botStorageConfigured()) return Response.json({ configured: false, ready: false, record: null, message: 'Background bot storage needs server setup.' }, { headers });
    const { db, userId } = await botUser(request);
    const [record, health] = await Promise.all([cloudBotAccount(db, userId), botHealth(db)]);
    return Response.json({ configured: true, record, ...health }, { headers });
  } catch (error) {
    if (error instanceof BotRequestError && error.status === 424) return Response.json({ configured: false, ready: false, record: null, message: error.message }, { headers });
    return botError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { db, userId } = await botUser(request);
    const text = await request.text();
    if (text.length > 2_000_000) throw new BotRequestError('Wallet is too large to transfer.', 413);
    let body;
    try { body = JSON.parse(text); } catch { throw new BotRequestError('Invalid wallet request.', 400); }
    if (!body || !body.account || typeof body.account !== 'object' || Array.isArray(body.account)) throw new BotRequestError('A valid existing wallet is required.', 400);
    let account;
    try { account = readGlobalAccount(JSON.stringify(body.account)); } catch { throw new BotRequestError('Wallet data is invalid; it has not been replaced.', 400); }
    const current = await cloudBotAccount(db, userId);
    if (body.action === 'enable') {
      if (current) return Response.json({ record: current, ...await botHealth(db) }, { headers }); // Idempotent migration, never overwrite an existing remote wallet.
      if (!(await botHealth(db)).ready) throw new BotRequestError('Wait for the background scheduler to be online before enabling.');
      const { error } = await db.from('paper_bot_accounts').insert({ user_id: userId, account, active: backgroundActive(account) });
      if (error && error.code !== '23505') throw new BotRequestError('Could not enable background mode. Local data has been preserved.');
      return Response.json({ record: await cloudBotAccount(db, userId), ...await botHealth(db) }, { headers });
    }
    if (body.action !== 'save' || !current || !Number.isSafeInteger(body.version)) throw new BotRequestError('Refresh the shared wallet before saving.', 409);
    if (body.version !== current.version) return Response.json({ error: 'Wallet changed; retry with current state.', record: current }, { status: 409, headers });
    const starts = account.bots?.some(bot => bot.enabled && (!current.account.bots?.find(previous => previous.symbol === bot.symbol)?.enabled || current.account.bots?.find(previous => previous.symbol === bot.symbol)?.startedAt !== bot.startedAt));
    if (starts && !(await botHealth(db)).ready) throw new BotRequestError('The background scheduler is offline. Pause and exit remain available.');
    const saved = await saveCloudBotAccount(db, current, account);
    if (!saved) return Response.json({ error: 'Wallet changed; refresh before retrying.' }, { status: 409, headers });
    return Response.json({ record: saved }, { headers });
  } catch (error) { return botError(error); }
}
