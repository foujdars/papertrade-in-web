import type { PerpAccount } from './global-markets';

export function visibleBotActivity(account: PerpAccount) {
  const deleted = new Set(account.deletedBotActivityIds ?? []);
  return account.events.filter(event => event.botId && !deleted.has(event.id));
}

/** Remove an activity row without changing accounting or bot daily-limit events. */
export function deleteBotActivity(account: PerpAccount, id: string): PerpAccount {
  if (!account.events.some(event => event.id === id && event.botId)) throw new Error('This bot activity entry is no longer available.');
  const existing = new Set(account.events.filter(event => event.botId).map(event => event.id));
  const ids = new Set((account.deletedBotActivityIds ?? []).filter(value => existing.has(value)));
  if (ids.has(id)) return account;
  ids.add(id);
  return { ...account, deletedBotActivityIds: [...ids], revision: account.revision + 1 };
}
