/* ORYN cache reset service worker — universal calibration rollout */
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
/* Intentionally no fetch handler: ORYN must load the current Pi files from network. */
