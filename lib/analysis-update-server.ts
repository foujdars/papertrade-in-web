import 'server-only';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { FUNDAMENTAL_MANIFEST_PATH, storageClient, type FundamentalManifest } from './fundamental-data-server';
import { analysisUpdateNotice } from './analysis-update-notice';
import { notificationPreferences, quietTime, type PushNotice } from './notification-policy';
import { pushConfigured, pushServices, sendPush } from './push-admin';

export async function recordAnalysisUpdate(db: Firestore, manifest: FundamentalManifest, now: number) {
  const notice = analysisUpdateNotice(manifest, now);
  if (!notice) return false;
  const ref = db.doc('notificationSystem/analysisUpdate');
  return db.runTransaction(async tx => {
    const saved = (await tx.get(ref)).data();
    if (saved?.version === manifest.version || saved?.updatedAt > Date.parse(manifest.generatedAt)) return false;
    tx.set(ref, { version: manifest.version, updatedAt: Date.parse(manifest.generatedAt), notice });
    return true;
  });
}

// Called only after both the CSV and its manifest have been saved successfully.
export async function queueAnalysisUpdate(manifest: FundamentalManifest) {
  if (!pushConfigured()) return false;
  return recordAnalysisUpdate((await pushServices()).db, manifest, Date.now());
}

export async function deliverAnalysisUpdates(db: Firestore, devices: QueryDocumentSnapshot[], now: number) {
  // Reconcile storage as well: uploads made outside the API and interrupted queue writes are discovered here.
  try {
    const { data, error } = await storageClient().download(FUNDAMENTAL_MANIFEST_PATH);
    if (!error && data) await recordAnalysisUpdate(db, JSON.parse(await data.text()), now);
  } catch { /* A saved update can still be delivered during a storage outage. */ }
  const notice = (await db.doc('notificationSystem/analysisUpdate').get()).data()?.notice as PushNotice | undefined;
  if (!notice || notice.expiresAt <= now) return 0;
  let sent = 0;
  for (const device of devices) {
    const data = device.data(), prefs = notificationPreferences(data.preferences);
    if (!prefs.analysis || prefs.pausedUntil > now || !Number.isFinite(data.lastActive) || now - data.lastActive > 90 * 86400000 || typeof data.token !== 'string') continue;
    // Claim per device so overlapping dispatches and identical CSV reuploads do not duplicate the alert.
    const claimed = await db.runTransaction(async tx => {
      const saved = await tx.get(device.ref);
      if (!saved.exists || saved.data()?.lastAnalysisNotice === notice.id) return false;
      const current = saved.data()!, currentPrefs = notificationPreferences(current.preferences);
      if (!currentPrefs.analysis || currentPrefs.pausedUntil > now || current.token !== data.token) return false;
      tx.update(device.ref, { lastAnalysisNotice: notice.id, analysisDelivery: 'sending', analysisAttemptedAt: now });
      return true;
    });
    if (!claimed) continue;
    try {
      await sendPush({ ...notice, silent: quietTime(now) }, { token: data.token });
      await device.ref.update({ analysisDelivery: 'accepted' }); sent++;
    } catch (error) {
      if ((error as { code?: string }).code === 'messaging/registration-token-not-registered') await device.ref.delete();
      else await device.ref.update({ analysisDelivery: 'needs-review' });
    }
  }
  return sent;
}
