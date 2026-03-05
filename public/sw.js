// ─── RutaFlow Service Worker ──────────────────────────────────────────────────
// Versión: actualiza este número cada vez que hagas un deploy importante
const VERSION = "rutaflow-v1";

// Archivos que guardamos en caché para que la app cargue sin internet
const CACHE_STATIC = [
  "/",
  "/index.html",
  "/manifest.json",
];

// ─── INSTALACIÓN ─────────────────────────────────────────────────────────────
// Se ejecuta la primera vez que el usuario instala la PWA
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => {
      return cache.addAll(CACHE_STATIC);
    })
  );
  // Actívarse inmediatamente sin esperar a que se cierre la pestaña
  self.skipWaiting();
});

// ─── ACTIVACIÓN ──────────────────────────────────────────────────────────────
// Limpia cachés viejas cuando hay una nueva versión
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Tomar control de todas las pestañas abiertas inmediatamente
  self.clients.claim();
});

// ─── ESTRATEGIA DE RED ────────────────────────────────────────────────────────
// "Network first, caché como respaldo"
// Intenta siempre obtener la versión más nueva de internet.
// Si no hay internet (conductor en zona sin señal), usa la versión guardada.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo manejamos peticiones del mismo dominio (no APIs externas como Supabase)
  if (url.origin !== self.location.origin) return;

  // Para navegación (abrir la app): siempre servir index.html
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/index.html")
      )
    );
    return;
  }

  // Para assets (JS, CSS, íconos): caché primero, red como respaldo
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Guardar en caché si es una respuesta válida
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

// ─── SINCRONIZACIÓN EN BACKGROUND ────────────────────────────────────────────
// Cuando el conductor vuelve a tener internet, sincroniza datos pendientes
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-trips") {
    // Aquí en el futuro podríamos sincronizar viajes guardados offline
    console.log("[RutaFlow SW] Sincronizando viajes pendientes...");
  }
});

// ─── NOTIFICACIONES PUSH (preparado para futuro) ──────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || "RutaFlow", {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: data,
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
