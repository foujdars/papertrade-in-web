// Notifications only: no fetch handler, page caching, PAN input or background polling.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const registrar = event.notification.data?.registrar;
  const allowed = ["mufg", "kfin", "bigshare", "bse"];
  const path = allowed.includes(registrar) ? `/ipo-allotment/${registrar}` : "/";
  event.waitUntil(self.clients.openWindow(new URL(path, self.location.origin).href));
});
