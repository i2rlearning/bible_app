/**
 * SERVICE WORKER FOR BIBLE APP 
 *
 * - Cache the local application shell.
 * - Serve cached local assets when offline.
 * - Never cache API.Bible, Clerk, or other live API requests here.
 * - Activate new service-worker versions promptly so stale JavaScript does
 *   not continue to control the application.
 *
 * Bible data itself belongs in IndexedDB, not the Cache API.
 */

"use strict";

const CACHE_NAME = "bible-app-v2";
const OFFLINE_URL = "/index.html";

const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/verse.html",
  "/search.html",
  "/study-desk.html",
  "/copyright.html",
  "/sign-in.html",
  "/sign-up.html",

  "/css/menu.css",
  "/css/bible-main.css",
  "/css/bible-selector.css",
  "/css/index.css",
  "/css/verse-of-day.css",
  "/css/scripture.css",
  "/css/scripture-reference-popup.css",
  "/css/editor.css",
  "/css/study-actions.css",
  "/css/scripture-keywords.css",
  "/css/anchored-annotations.css",
  "/css/copyright.css",
  "/css/menu-scroll.css",
  "/css/menu-popover.css",
  "/css/study-desk.css",
  "/css/search.css",

  "/js/my_key.js",
  "/js/bible-version-visibility.js",
  "/js/ui-fit-controller.js",
  "/js/menu.js",
  "/js/auth.js",
  "/js/bible-language.js",
  "/js/bible-selector.js",
  "/js/user-preferences.js",
  "/js/passage-picker.js",
  "/js/copyright-footer.js",
  "/js/copyright-info.js",
  "/js/verse-of-day.js",
  "/js/study-desk.js",
  "/js/editor.js",
  "/js/verses.js",
  "/js/search.js",
  "/js/search-keywords.js",
  "/js/scripture-keywords.js",
  "/js/scripture-reference-popup.js",
  "/js/anchored-annotations.js",
  "/js/study-actions.js",
  "/js/offline-bible.js",
  "/js/offline-manager.js",
  "/js/init.js",

  "/img/favicon.ico",
  "/img/logo.png",
  "/img/left_stamp_on.png",
  "/img/right_stamp_on.png",
  "/img/orig_left_stamp.png",
  "/img/orig_right_stamp.png"
];

self.addEventListener("install", (event) => {
  console.log("[SW] Installing", CACHE_NAME);

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.error("[SW] Failed to cache app shell:", error);
        throw error;
      })
  );
});

self.addEventListener("activate", (event) => {
  console.log("[SW] Activating", CACHE_NAME);

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => {
              console.log("[SW] Deleting old cache:", cacheName);
              return caches.delete(cacheName);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

function isLiveApiRequest(request) {
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();

  return (
    hostname === "api.scripture.api.bible" ||
    hostname === "rest.api.bible" ||
    hostname === "api.bible" ||
    hostname.includes("clerk") ||
    url.pathname.startsWith("/api/")
  );
}

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Live APIs must always go directly to the network. IndexedDB will become
  // the offline data layer in later phases.
  if (isLiveApiRequest(request)) {
    return;
  }

  if (request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches
      .match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request).then((networkResponse) => {
          // Only cache successful same-origin responses. Do not cache opaque
          // cross-origin responses in the app-shell cache.
          if (
            networkResponse &&
            networkResponse.ok &&
            new URL(request.url).origin === self.location.origin
          ) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone).catch((error) => {
                console.warn("[SW] Cache put failed:", request.url, error);
              });
            });
          }

          return networkResponse;
        });
      })
      .catch(() => {
        if (isNavigationRequest(request)) {
          return caches.match(OFFLINE_URL);
        }

        return Response.error();
      })
  );
});
