// NIJI STRING 서비스워커 - 항상 최신 파일을 먼저 받아오고, 인터넷이 안 될 때만 저장본을 사용
const CACHE = "niji-offline-v2";

self.addEventListener("install", function (e) {
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", function (e) {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/sw.js")) return;
  e.respondWith((async function () {
    try {
      const res = await fetch(req.url, { cache: "no-store", credentials: "same-origin" });
      if (res && res.ok && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req.url, copy); }).catch(function () {});
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req.url);
      if (hit) return hit;
      const hit2 = await caches.match(url.pathname);
      if (hit2) return hit2;
      throw err;
    }
  })());
});
