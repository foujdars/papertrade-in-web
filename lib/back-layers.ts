/** One owner for transient Back handling; browser entries are cleaned in order. */
export const TRANSIENT_BACK_EVENT = 'papertrade:dismiss-layer';
type Layer = { token: string; dismiss: () => void; native: boolean; dismissed: boolean; disposed: boolean };
const layers: Layer[] = [];
const retired = new Set<string>();
const waiting: Array<() => void> = [];
let installed = false, draining = false, position = 0, restoreAfterDrain = false;
const top = () => layers.findLast(layer => !layer.dismissed && !layer.disposed);
export const hasTransientBackLayer = () => Boolean(top()) || draining;
export function afterBackSettles(action: () => void) { if (draining) waiting.push(action); else action(); }
function flush() { for (const action of waiting.splice(0)) action(); }
function dismiss(event: Event) {
  const layer = top();
  if (!layer && !draining) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (layer) { layer.dismissed = true; layer.dismiss(); }
}
function drain() {
  if (draining || !retired.has(window.history.state?.papertradeLayer)) return;
  draining = true;
  window.history.back();
}
export function ensureBackHandling() {
  if (installed) return;
  installed = true; position = window.history.state?.papertradeHistoryPosition ?? 0;
  window.addEventListener(TRANSIENT_BACK_EVENT, dismiss, true);
  window.addEventListener('keydown', event => { if (event.key === 'Escape' && !event.defaultPrevented) dismiss(event); }, true);
  window.addEventListener('popstate', event => {
    const next = event.state?.papertradeHistoryPosition ?? 0, backwards = next <= position;
    position = next;
    if (draining) {
      draining = false;
      if (retired.has(event.state?.papertradeLayer)) { event.stopImmediatePropagation(); drain(); }
      else {
        if (!restoreAfterDrain) event.stopImmediatePropagation();
        restoreAfterDrain = false;
        flush();
      }
      return;
    }
    if (top()) { dismiss(event); return; }
    if (retired.has(event.state?.papertradeLayer)) {
      if (backwards) { event.stopImmediatePropagation(); restoreAfterDrain = true; drain(); }
      else {
        // Forward never resurrects a closed popup or strands navigation on it.
        const state = { ...window.history.state }; delete state.papertradeLayer;
        window.history.replaceState(state, '');
      }
    }
  }, true);
}
/** Navigation entries must not inherit the popup they are leaving. */
export function pushNavigationState(state: Record<string, unknown>, url?: string | URL) {
  ensureBackHandling();
  const clean = { ...state }; delete clean.papertradeLayer;
  position = (window.history.state?.papertradeHistoryPosition ?? 0) + 1;
  window.history.pushState({ ...clean, papertradeHistoryPosition: position }, '', url);
}
export function registerBackLayer(onDismiss: () => void, native: boolean) {
  ensureBackHandling();
  const layer: Layer = { token: crypto.randomUUID(), dismiss: onDismiss, native, dismissed: false, disposed: false };
  layers.push(layer);
  queueMicrotask(() => afterBackSettles(() => {
    if (native || layer.disposed || layer.dismissed) return;
    position = (window.history.state?.papertradeHistoryPosition ?? 0) + 1;
    window.history.pushState({ ...window.history.state, papertradeLayer: layer.token, papertradeHistoryPosition: position }, '');
  }));
  return () => {
    layer.disposed = true;
    const index = layers.indexOf(layer); if (index >= 0) layers.splice(index, 1);
    retired.add(layer.token);
    if (!native) queueMicrotask(drain);
  };
}
