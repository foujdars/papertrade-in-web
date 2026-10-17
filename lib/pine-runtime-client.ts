import type { Candle } from './market';
import type { AdvancedPineRun, PineRuntimeContext } from './pine-runtime-types';
import { executePineSandbox, type PineDataRequest } from './pine-sandbox';

/** Only this client is imported by UI code. PineTS and generated JavaScript
 * execute inside the opaque-origin worker, never inside the authenticated app.
 */
export async function runPineInSandbox(
  source: string,
  candles: Candle[],
  inputs: Record<string, number | boolean | string> = {},
  context: PineRuntimeContext = {},
  signal?: AbortSignal,
  requestData?: (request: PineDataRequest) => Promise<Candle[]>,
): Promise<AdvancedPineRun> {
  if (source.length > 50_000) throw new Error('Script exceeds 50,000 characters.');
  if (candles.length > 20_000) throw new Error('Use at most 20,000 candles per run.');
  const { default: code } = await import('./generated/pine-worker-source');
  const result=await executePineSandbox<AdvancedPineRun>(code, { source, candles, inputs, context }, signal, 12_000, requestData);
  if (!result || typeof result !== 'object' || typeof result.title !== 'string' || typeof result.overlay !== 'boolean'
    || result.error!==null && typeof result.error!=='string'
    || !Array.isArray(result.plots) || result.plots.length>256 || result.plots.some(p=>!p||typeof p.name!=='string'||!Array.isArray(p.values)||p.values.length>20_000)
    || !Array.isArray(result.alerts) || result.alerts.some(a=>!a||!Array.isArray(a.values)||typeof a.title!=='string')
    || !Array.isArray(result.visuals) || result.visuals.some(v=>!v||typeof v.key!=='string'||!v.options||!Array.isArray(v.data))
    || !Array.isArray(result.levels) || !Array.isArray(result.levelStyles) || !Array.isArray(result.inputs)
    || !Array.isArray(result.logs) || !Array.isArray(result.warnings)
    || result.strategy!==null && (!result.strategy || !Array.isArray(result.strategy.trades)||!Array.isArray(result.strategy.equity))) {
    throw new Error('The Pine runtime returned an invalid result. Check the script diagnostics and try again.');
  }
  return result;
}
