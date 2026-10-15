import type { PerpAccount } from './global-markets';

export function visibleBotActivity(account: PerpAccount) {
  const deleted = new Set(account.deletedBotActivityIds ?? []);
  return account.events.filter(event => event.botId && !deleted.has(event.id));
}

/** Remove an activity row without changing accounting or bot daily-limit events. */
export function deleteBotActivity(account: PerpAccount, id: string): PerpAccount {
  return deleteBotActivities(account, [id]);
}

/** Apply the whole selection atomically; never remove accounting events. */
export function deleteBotActivities(account: PerpAccount, selectedIds: readonly string[]): PerpAccount {
  if (!selectedIds.length) return account;
  const existing = new Set(account.events.filter(event => event.botId).map(event => event.id));
  if (selectedIds.some(id => !existing.has(id))) throw new Error('This bot activity entry is no longer available.');
  const ids = new Set((account.deletedBotActivityIds ?? []).filter(value => existing.has(value)));
  if (selectedIds.every(id => ids.has(id))) return account;
  selectedIds.forEach(id => ids.add(id));
  return { ...account, deletedBotActivityIds: [...ids], revision: account.revision + 1 };
}
