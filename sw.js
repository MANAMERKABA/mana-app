// MANA service worker — minimalny, BEZ cache (zawsze świeża wersja z sieci).
// Dzięki temu apka instaluje się na telefonie, a aktualizacje pojawiają się od razu.
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  // network-first, fallback do sieci (brak cache offline w v1)
  e.respondWith(fetch(e.request).catch(() => new Response("Brak połączenia", { status: 503 })));
});

// ── WEB PUSH: powiadomienie o wiadomości przy zamkniętej / schowanej aplikacji ──
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil((async () => {
    // MANA na wierzchu? — apka sama pokazuje dymek i gra, nie dublujemy
    const okna = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (okna.some((c) => c.visibilityState === "visible" && c.focused)) return;
    await self.registration.showNotification(d.tytul || "MANA", {
      body: d.tekst || "Nowa wiadomość",
      icon: "icon-192.png",
      badge: "icon-192.png",
      tag: "mana-czat-" + (d.plemie_id || ""),
      renotify: true,
      vibrate: [200, 80, 200],
      data: { plemie_id: d.plemie_id || null },
    });
  })());
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const pid = e.notification.data && e.notification.data.plemie_id;
  const url = pid ? "./?czat=" + pid : "./";
  e.waitUntil((async () => {
    const okna = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (okna.length) { try { await okna[0].focus(); if (okna[0].navigate) await okna[0].navigate(url); } catch (err) {} return; }
    await self.clients.openWindow(url);
  })());
});
