import { STUDIES, normalizeStudy, type StudyConfig } from './indicator-catalog';

export const INDICATOR_TEMPLATE_KEY = 'papertrade-indicator-templates-v1';
export const INDICATOR_TEMPLATE_LIMIT = 12;
export type IndicatorTemplate = { id: string; name: string; updatedAt: number; enabled: string[]; settings: Record<string, StudyConfig> };
export type TemplateResult = { ok: true } | { ok: false; error: string };
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const available = STUDIES.filter(study => !study.unavailable);
const store = (): Store | null => { try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; } };
const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function visibleLowerPaneCount(enabled: Record<string, boolean>, settings: Record<string, StudyConfig>): number {
  return available.filter(study => !study.overlay && enabled[study.id] && !settings[study.id]?.hidden).length;
}
export function normalizeIndicatorTemplate(value: unknown): IndicatorTemplate | null {
  const v = record(value);
  if (typeof v.id !== 'string' || !v.id || v.id.length > 100 || typeof v.name !== 'string' || !v.name.trim() || v.name.trim().length > 60 || !Array.isArray(v.enabled) || typeof v.updatedAt !== 'number' || !Number.isFinite(v.updatedAt) || v.updatedAt < 0) return null;
  const selected = new Set(v.enabled.filter((id): id is string => typeof id === 'string'));
  const enabled = available.filter(s => selected.has(s.id)).map(s => s.id);
  const source = record(v.settings), settings = Object.fromEntries(enabled.map(id => [id, normalizeStudy(id, source[id])]));
  if (visibleLowerPaneCount(Object.fromEntries(enabled.map(id => [id, true])), settings) > 6) return null;
  return { id: v.id, name: v.name.trim(), updatedAt: v.updatedAt, enabled, settings };
}
export function captureIndicatorTemplate(name: string, enabled: Record<string, boolean>, settings: Record<string, StudyConfig>, id = crypto.randomUUID()): IndicatorTemplate | null {
  return normalizeIndicatorTemplate({ id, name, enabled: available.filter(s => enabled[s.id]).map(s => s.id), settings, updatedAt: Date.now() });
}
export function loadIndicatorTemplates(target: Store | null = store()): IndicatorTemplate[] {
  try {
    const raw = target?.getItem(INDICATOR_TEMPLATE_KEY); if (!raw || raw.length > 1_000_000) return [];
    const value: unknown = JSON.parse(raw); if (!Array.isArray(value)) return [];
    const ids = new Set<string>(), names = new Set<string>(), rows: IndicatorTemplate[] = [];
    for (const item of value.slice(0, 100)) { const template = normalizeIndicatorTemplate(item); if (template && !ids.has(template.id) && !names.has(template.name.toLowerCase())) { rows.push(template); ids.add(template.id); names.add(template.name.toLowerCase()); } if (rows.length === INDICATOR_TEMPLATE_LIMIT) break; }
    return rows;
  } catch { return []; }
}
function persist(rows: IndicatorTemplate[], target: Store | null): TemplateResult {
  if (!target) return { ok: false, error: 'Device storage is unavailable. No template was changed.' };
  try { const raw = JSON.stringify(rows); if (raw.length > 1_000_000) return { ok: false, error: 'Templates exceed the device storage budget.' }; target.setItem(INDICATOR_TEMPLATE_KEY, raw); return { ok: true }; } catch { return { ok: false, error: 'Could not save templates on this device. No template was changed.' }; }
}
export function saveIndicatorTemplate(value: IndicatorTemplate, target: Store | null = store()): TemplateResult {
  const template = normalizeIndicatorTemplate(value); if (!template) return { ok: false, error: 'Use a name of 1–60 characters and at most six visible lower panes.' };
  const rows = loadIndicatorTemplates(target);
  if (rows.some(t => t.id === template.id || t.name.toLowerCase() === template.name.toLowerCase())) return { ok: false, error: 'That template already exists. Choose a new name or delete it first.' };
  if (rows.length >= INDICATOR_TEMPLATE_LIMIT) return { ok: false, error: 'Twelve templates are saved. Delete one before saving another.' };
  return persist([...rows, template], target);
}
export function deleteIndicatorTemplate(id: string, target: Store | null = store()): TemplateResult {
  const rows = loadIndicatorTemplates(target); if (!rows.some(t => t.id === id)) return { ok: false, error: 'This template is no longer available.' };
  return persist(rows.filter(t => t.id !== id), target);
}
export function planIndicatorTemplate(value: IndicatorTemplate, current: Record<string, boolean>, settings: Record<string, StudyConfig>, excluded: readonly string[] = []) {
  const template = normalizeIndicatorTemplate(value); if (!template) return { ok: false as const, error: 'This template is invalid or exceeds six visible lower panes.' };
  const selected = new Set(template.enabled), preserved = new Set(excluded), next = { ...current }, configs: Record<string, StudyConfig> = {};
  for (const study of available) { if (preserved.has(study.id)) continue; next[study.id] = selected.has(study.id); if (selected.has(study.id)) configs[study.id] = normalizeStudy(study.id, template.settings[study.id]); }
  if (visibleLowerPaneCount(next, { ...settings, ...configs }) > 6) return { ok: false as const, error: 'This template plus preserved indicators would exceed six visible lower panes. Hide or remove one first.' };
  return { ok: true as const, settings: configs, toggles: available.filter(s => !preserved.has(s.id) && !!current[s.id] !== !!next[s.id]).map(s => s.id), enabled: next };
}
/** One settings transaction precedes functional indicator toggles; failures never change selection. */
export function applyIndicatorTemplate(value: IndicatorTemplate, current: Record<string, boolean>, settings: Record<string, StudyConfig>, commit: (settings: Record<string, StudyConfig>) => boolean, toggle: (id: string) => void, excluded: readonly string[] = []): TemplateResult {
  const plan = planIndicatorTemplate(value, current, settings, excluded); if (!plan.ok) return plan;
  if (!commit(plan.settings)) return { ok: false, error: 'Could not save indicator settings. The chart selection was preserved.' };
  plan.toggles.forEach(toggle); return { ok: true };
}
