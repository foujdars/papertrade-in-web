/** Equal-jitter exponential delay. Attempt 1 is the base; later attempts double until the cap. */
export function exponentialBackoffMs(attempt: number, options: { baseMs?: number; capMs?: number; retryAfterMs?: number; random?: () => number } = {}) {
  const step = Math.max(0, Math.floor(attempt) - 1);
  const base = options.baseMs ?? 2_000;
  const cap = options.capMs ?? 60_000;
  const ceiling = Math.min(cap, base * 2 ** Math.min(step, 6));
  const roll = Math.min(1, Math.max(0, options.random?.() ?? Math.random()));
  const grown = Math.round(ceiling * (0.5 + roll * 0.5));
  const server = Number(options.retryAfterMs);
  const floor = Number.isFinite(server) && server > 0 ? server : 0;
  return Math.min(Math.max(cap, 120_000), Math.max(grown, floor));
}
