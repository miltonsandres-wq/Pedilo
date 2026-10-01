/* Service worker de la PWA del repartidor (alcance: /repartidor).
 * Objetivo: que la app ABRA sin señal. Los datos y los cambios de estado viven en
 * IndexedDB (ver src/lib/repartidor); aquí solo se guarda la "cáscara": la página
 * y sus archivos estáticos. Nunca se cachea nada de la API ni de Supabase. */
const VERSION = "repartidor-v1";
const CASCARA = "/repartidor";

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(VERSION).then((cache) => cache.add(CASCARA)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  if (peticion.method !== "GET") return;
  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return; // Supabase, mapas, etc.: directo a la red

  // La página: red primero (siempre la versión nueva), y sin señal la guardada
  if (peticion.mode === "navigate" && url.pathname.startsWith("/repartidor")) {
    evento.respondWith(
      fetch(peticion)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(VERSION).then((cache) => cache.put(CASCARA, copia));
          return respuesta;
        })
        .catch(() => caches.match(CASCARA))
    );
    return;
  }

  // Archivos estáticos de la app: caché primero (llevan hash en el nombre)
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    evento.respondWith(
      caches.match(peticion).then(
        (guardado) =>
          guardado ||
          fetch(peticion).then((respuesta) => {
            const copia = respuesta.clone();
            caches.open(VERSION).then((cache) => cache.put(peticion, copia));
            return respuesta;
          })
      )
    );
  }
});
