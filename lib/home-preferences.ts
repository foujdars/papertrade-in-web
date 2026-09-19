import type { HomeAttention } from './home-attention';

export type HomeReminder = { fingerprint: string; until: number; reviewed: boolean };
export type HomePreferences = { privateBalances: boolean; recentSearches: string[]; reminders: Record<string, HomeReminder> };
export const HOME_REMIND_LATER_MS = 60 * 60 * 1000;
export const homePreferenceKey = (owner: string) => `papertrade-home-v2:${owner}`;
export const reminderFingerprint = (item: HomeAttention) => JSON.stringify([item.title, item.detail, item.tone, item.target, item.revision]);

export function normalizeHomePreferences(value: unknown, now = Date.now()): HomePreferences {
  const input = value && typeof value === 'object' ? value as Partial<HomePreferences> : {};
  const reminders: Record<string, HomeReminder> = {};
  if (input.reminders && typeof input.reminders === 'object') {
    for (const [id, reminder] of Object.entries(input.reminders).slice(-100)) {
      if (reminder && typeof reminder.fingerprint === 'string' && Number.isFinite(reminder.until) && reminder.until > now) {
        Object.defineProperty(reminders, id, { value: { fingerprint: reminder.fingerprint, until: reminder.until, reviewed: reminder.reviewed === true }, enumerable: true, configurable: true, writable: true });
      }
    }
  }
  return { privateBalances: input.privateBalances === true, recentSearches: Array.isArray(input.recentSearches) ? [...new Set(input.recentSearches.filter((s): s is string => typeof s === 'string' && s.length > 0 && s.length < 100))].slice(0, 3) : [], reminders };
}

export function rememberHomeSearch(prefs: HomePreferences, symbol: string): HomePreferences {
  return { ...prefs, recentSearches: [symbol, ...prefs.recentSearches.filter(s => s !== symbol)].slice(0, 3) };
}

export function deferHomeReminder(prefs: HomePreferences, item: HomeAttention, reviewed: boolean, now: number): HomePreferences {
  // Only presentation preferences change. Never write to an alert or trading store.
  return normalizeHomePreferences({ ...prefs, reminders: { ...prefs.reminders, [item.id]: { fingerprint: reminderFingerprint(item), reviewed, until: reviewed ? Number.MAX_SAFE_INTEGER : now + HOME_REMIND_LATER_MS } } }, now);
}

export function isHomeReminderHidden(prefs: HomePreferences, item: HomeAttention, now: number): boolean {
  const reminder = prefs.reminders[item.id];
  return !!reminder && reminder.until > now && reminder.fingerprint === reminderFingerprint(item);
}
