const CACHE_NAME = "apolo-static-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/pwa-icon/"))
  ) {
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/api/pwa-icon/") ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|webp|svg|ico)$/.test(url.pathname);

  if (!isStaticAsset) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const fresh = fetch(request)
        .then((response) => {
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);

      return cached ?? fresh;
    }),
  );
});
