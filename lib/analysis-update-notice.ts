import type { FundamentalManifest } from './fundamental-data-server';
import { quietTime, type PushNotice } from './notification-policy.ts';

export function analysisUpdateNotice(manifest: FundamentalManifest, now: number): PushNotice | null {
  const updated = Date.parse(manifest.generatedAt);
  if (!/^[a-f0-9]{64}$/.test(manifest.version) || !Number.isFinite(updated) || updated > now || now - updated >= 86400000) return null;
  const count = Number.isSafeInteger(manifest.rowCount) && manifest.rowCount! > 0
    ? `${manifest.rowCount!.toLocaleString('en-IN')} stock records refreshed. ` : '';
  return { id: `analysis-${manifest.version}`, kind: 'analysis', title: '📊 Fresh Analysis data is ready!',
    body: `${count}Your latest stock research is ready to explore 🙂 Tap to open Analysis.`,
    url: '/?screen=fundamentals', expiresAt: updated + 86400000, silent: quietTime(now) };
}
