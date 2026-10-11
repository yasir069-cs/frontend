/* =============================================================
   service-worker.js  (v3)
   Cache-first for static assets, network-first with cache
   fallback for /api/. Version-bumped cache names; old caches are
   purged on activate. Only GET requests are handled.
   ============================================================= */

"use strict";

const VERSION = "ich-v3.1.3";
const STATIC_CACHE = "ich-static-" + VERSION;
const API_CACHE = "ich-api-" + VERSION;

const PRECACHE = [
  "./",
  "./index.html",
  "./styles.css?v=8",
  "./app.bundle.js?v=8",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== API_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // API: network-first, cache fallback (offline mode).
  if (sameOrigin && url.pathname.indexOf("/api/") === 0) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(API_CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() =>
          caches.open(API_CACHE).then((c) => c.match(req)).then((hit) => hit || Response.error())
        )
    );
    return;
  }

  // Navigations: network-first so a new deploy is never served
  // from a stale HTML shell; cached copy is the offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }

  // Static + fonts: cache-first, network fill.
  event.respondWith(
    caches.match(req, { ignoreSearch: !sameOrigin }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) {
            const clone = res.clone();
            caches
              .open(STATIC_CACHE)
              .then((c) => c.put(req, clone))
              .catch(() => { /* opaque or quota — ignore */ });
          }
          return res;
        })
        .catch(() => Response.error());
    })
  );
});
