const CACHE_NAME = "chwazi-shell-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./chwazu.JS",
  "./manifest.webmanifest",
  "./icon.svg",
  "./evil-laugh-devil.gif"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      caches.match("./index.html").then((cachedShell) => {
        const networkUpdate = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
            return response;
          })
          .catch(() => cachedShell);

        return cachedShell || networkUpdate;
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkUpdate = fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });

      if (cached) {
        event.waitUntil(networkUpdate.catch(() => {}));
        return cached;
      }

      return networkUpdate;
    })
  );
});
