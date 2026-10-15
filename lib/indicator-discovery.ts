import { STUDIES, studyDefaults, type StudyConfig, type StudyDefinition } from './indicator-catalog.ts';

const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');
export function indicatorSearchRank(study: StudyDefinition, query: string) {
  const term = normalize(query), name = normalize(study.name), id = normalize(study.id);
  if (!term) return 0;
  if (name === term) return 0;
  if (id === term) return 1;
  if (name.startsWith(term)) return 2;
  return `${name} ${id} ${normalize(study.group)}`.includes(term) ? 3 : Infinity;
}

/** Prior bars required before the visible window, not fabricated left extensions. */
export function movingAverageWarmup(enabled: Record<string, boolean>, settings: Record<string, StudyConfig>, timeframe: string) {
  let bars = 0;
  for (const study of STUDIES) {
    if (!enabled[study.id] || !/moving average|\b(?:ema|sma)\b/i.test(study.name)) continue;
    const config = settings[study.id] ?? studyDefaults(study.id);
    if (config.hidden || config.timeframes.length && !config.timeframes.includes(timeframe)) continue;
    for (const field of study.fields) {
      if (!['length', 'fast', 'slow', 'fourth', 'smooth'].includes(field.key)) continue;
      const length = config.inputs[field.key] ?? field.value;
      if (Number.isFinite(length)) bars = Math.max(bars, Math.ceil(length) - 1);
    }
  }
  return Math.min(1500, Math.max(0, bars));
}
