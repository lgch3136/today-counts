const CACHE_NAME = "today-counts-v25";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=25",
  "./app.js?v=25",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/share-card-bg.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request).then((response) => {
      if (!response || response.status !== 200) {
        return response;
      }

      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => {
      return caches.match(event.request).then((cached) => {
        if (cached) {
          return cached;
        }

        if (event.request.mode === "navigate") {
          return caches.match("./index.html").then((fallback) => fallback || Response.error());
        }

        return Response.error();
      });
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CACHE_REFRESH") {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => Promise.all(
        ASSETS.map((asset) => fetch(asset).then((response) => {
          if (response.ok) {
            return cache.put(asset, response);
          }

          return undefined;
        }).catch(() => undefined))
      ))
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow("./index.html");
    })
  );
});
