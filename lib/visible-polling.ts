/** One bounded request at a time, with an immediate refresh after returning to the app. */
export function startVisiblePolling(
  task: (signal: AbortSignal) => Promise<void>,
  intervalMs: number,
  onError: () => void = () => {},
) {
  const lifetime = new AbortController();
  let busy = false;
  const refresh = async () => {
    if (busy || lifetime.signal.aborted || document.visibilityState === "hidden") return;
    busy = true;
    try {
      await task(AbortSignal.any([lifetime.signal, AbortSignal.timeout(12_000)]));
    } catch {
      if (!lifetime.signal.aborted) onError();
    } finally {
      busy = false;
    }
  };
  void refresh();
  const timer = window.setInterval(() => void refresh(), intervalMs);
  const resume = () => void refresh();
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("focus", resume);
  window.addEventListener("online", resume);
  return () => {
    lifetime.abort();
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("focus", resume);
    window.removeEventListener("online", resume);
  };
}
