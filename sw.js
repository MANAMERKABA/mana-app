// MANA service worker — minimalny, BEZ cache (zawsze świeża wersja z sieci).
// Dzięki temu apka instaluje się na telefonie, a aktualizacje pojawiają się od razu.
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  // network-first, fallback do sieci (brak cache offline w v1)
  e.respondWith(fetch(e.request).catch(() => new Response("Brak połączenia", { status: 503 })));
});
