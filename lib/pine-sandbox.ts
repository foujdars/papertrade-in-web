/** An opaque-origin frame owns the worker that evaluates generated Pine code.
 * The frame has no application storage/cookies, and CSP blocks all networking.
 * A private MessagePort carries only the supplied candles and execution result.
 */
export const PINE_SANDBOX_DOCUMENT = `<!doctype html><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'; img-src 'none'; style-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">
<script>
addEventListener('message', function initialize(event) {
  if (event.source !== parent || !event.ports[0] || !event.data || event.data.type !== 'pine-start') return;
  removeEventListener('message', initialize);
  const port = event.ports[0];
  let worker;
  let url;
  try {
    url = URL.createObjectURL(new Blob([event.data.code], {type:'application/javascript'}));
    worker = new Worker(url);
    worker.onmessage = e => { port.postMessage(e.data); if (e.data?.type !== 'data-request') { worker.terminate(); URL.revokeObjectURL(url); } };
    worker.onerror = () => { port.postMessage({error:'Pine execution failed. Check the script and try again.'}); worker.terminate(); URL.revokeObjectURL(url); };
    worker.postMessage(event.data.request);
    port.onmessage = e => { if(e.data?.type === 'data-response') worker.postMessage(e.data); else { worker.terminate(); URL.revokeObjectURL(url); } };
    port.start();
  } catch (_) { port.postMessage({error:'This browser could not start the isolated Pine runtime.'}); }
});
</script>`;

export type PineDataRequest = { symbol: string; timeframe: string; limit?: number; sDate?: number; eDate?: number };
export function executePineSandbox<T>(code: string, request: unknown, signal?: AbortSignal, timeoutMs = 12_000,
  requestData?: (request: PineDataRequest) => Promise<unknown>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Cancelled', 'AbortError')); return; }
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.title = 'Isolated Pine execution';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    const channel = new MessageChannel();
    let settled = false;
    const finish = (error?: Error, result?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      channel.port1.postMessage({ type: 'stop' });
      channel.port1.close();
      channel.port2.close();
      frame.remove();
      if (error) reject(error); else resolve(result as T);
    };
    const abort = () => finish(new DOMException('Cancelled', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('Execution stopped after 12 seconds. Reduce the history or simplify the script.')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    let dataRequests = 0;
    channel.port1.onmessage = async event => {
      if (settled) return;
      const message = event.data;
      if (!message || typeof message !== 'object') { finish(new Error('Invalid Pine runtime response.')); return; }
      if (message.type === 'data-request') {
        if (++dataRequests > 12 || typeof message.id !== 'number' || !requestData) {
          channel.port1.postMessage({ type: 'data-response', id: message.id, error: 'Additional market data is unavailable for this run.' });
          return;
        }
        try {
          const data = await requestData(message.request);
          if (!settled) channel.port1.postMessage({ type: 'data-response', id: message.id, data });
        } catch (error) {
          if (!settled) channel.port1.postMessage({ type: 'data-response', id: message.id, error: error instanceof Error ? error.message : 'Market data is unavailable.' });
        }
      } else if (typeof message.error === 'string') finish(new Error(message.error));
      else if ('result' in message) finish(undefined, message.result as T);
    };
    channel.port1.start();
    frame.onload = () => frame.contentWindow?.postMessage({ type: 'pine-start', code, request }, '*', [channel.port2]);
    frame.srcdoc = PINE_SANDBOX_DOCUMENT;
    document.body.append(frame);
  });
}
