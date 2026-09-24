// ─── RutaFlow Service Worker ──────────────────────────────────────────────────
const VERSION = "rutaflow-v6";

// Archivos que guardamos en caché para que la app cargue sin internet
const CACHE_STATIC = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// ─── INSTALACIÓN ─────────────────────────────────────────────────────────────
// Se ejecuta la primera vez que el usuario instala la PWA
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch("/asset-manifest.json", { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo preparar RutaFlow para uso sin conexión");
      const manifest = await response.json();
      const entries = Array.isArray(manifest.entrypoints) ? manifest.entrypoints : [];
      const assets = [...new Set([...CACHE_STATIC, ...entries.map(path => path.startsWith("/") ? path : `/${path}`)])];
      const cache = await caches.open(VERSION);
      await cache.addAll(assets);
      await self.skipWaiting();
    })()
  );
});

// ─── ACTIVACIÓN ──────────────────────────────────────────────────────────────
// Limpia cachés viejas cuando hay una nueva versión
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith("rutaflow-") && key !== VERSION).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

// ─── ESTRATEGIA DE RED ────────────────────────────────────────────────────────
// "Network first, caché como respaldo"
// Intenta siempre obtener la versión más nueva de internet.
// Si no hay internet (conductor en zona sin señal), usa la versión guardada.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API responses may contain user data or payment state. Never cache them.
  if (url.origin !== self.location.origin || request.method !== "GET" || url.pathname.startsWith("/api/")) return;

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
