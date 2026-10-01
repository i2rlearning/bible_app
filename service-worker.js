"use strict";

/*
 * Application Service Worker
 *
 * Keeps the application shell available when the network is unavailable.
 * Handles same-origin navigation fallbacks and local app assets without using
 * the service-worker cache as the storage source for Bible or personal user data.
 */

const CACHE_PREFIX = "bible-app-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v8`;
const NETWORK_TIMEOUT_MS = 4500;

const APP_PAGES = [
  "/index.html",
  "/verse.html",
  "/search.html",
  "/study-desk.html",
  "/copyright.html"
];

const SHELL_ASSETS = [
  ...APP_PAGES,
  "/css/anchored-annotations.css",
  "/css/app-conflict-dialog.css",
  "/css/auth-ui.css",
  "/css/bible-main.css",
  "/css/bible-selector.css",
  "/css/connectivity-status.css",
  "/css/copyright.css",
  "/css/editor.css",
  "/css/index.css",
  "/css/menu-popover.css",
  "/css/menu-scroll.css",
  "/css/menu.css",
  "/css/offline-bible-manager.css",
  "/css/scripture-keywords.css",
  "/css/scripture-reference-popup.css",
  "/css/scripture-styles.css",
  "/css/scripture.css",
  "/css/search.css",
  "/css/study-actions.css",
  "/css/study-desk.css",
  "/css/verse-of-day.css",
  "/js/anchored-annotations.js",
  "/js/app-conflict-dialog.js",
  "/js/app-shell.js",
  "/js/auth-ui.js",
  "/js/auth.js",
  "/js/bible-data.js",
  "/js/bible-download-manager.js",
  "/js/bible-language.js",
  "/js/bible-offline-db.js",
  "/js/bible-search.js",
  "/js/bible-selector.js",
  "/js/bible-version-visibility.js",
  "/js/connectivity-status.js",
  "/js/copyright-footer.js",
  "/js/copyright-info.js",
  "/js/editor.js",
  "/js/menu.js",
  "/js/misc.js",
  "/js/my_key.js",
  "/js/offline-bible-manager.js",
  "/js/passage-picker.js",
  "/js/scripture-keywords.js",
  "/js/scripture-reference-popup.js",
  "/js/search-keywords.js",
  "/js/search.js",
  "/js/study-actions.js",
  "/js/study-desk.js",
  "/js/ui-fit-controller.js",
  "/js/user-offline-db.js",
  "/js/user-data.js",
  "/js/user-preferences.js",
  "/js/verse-of-day.js",
  "/js/verses.js",
  "/img/favicon.ico",
  "/img/left_stamp_on.png",
  "/img/logo.png",
  "/img/orig_left_stamp.png",
  "/img/orig_right_stamp.png",
  "/img/right_stamp_on.png",
  "/img/scrollbar.png",
  "/img/scrollbarleft.png",
  "/img/scrollpaper.png",
  "/img/wedding-paper.jpg"
];

async function cacheShellAsset(cache, assetUrl) {
  try {
    const response = await fetch(assetUrl, {
      cache: "reload"
    });

    if (response.ok) {
      await cache.put(assetUrl, response);
    }
  } catch (error) {
    console.warn(
      "Could not cache application shell asset:",
      assetUrl,
      error
    );
  }
}

self.addEventListener(
  "install",
  (event) => {
    event.waitUntil(
      (async () => {
        const cache =
          await caches.open(CACHE_NAME);

        await Promise.all(
          SHELL_ASSETS.map(
            (assetUrl) =>
              cacheShellAsset(
                cache,
                assetUrl
              )
          )
        );

        await self.skipWaiting();
      })()
    );
  }
);

self.addEventListener(
  "activate",
  (event) => {
    event.waitUntil(
      (async () => {
        const cacheNames =
          await caches.keys();

        await Promise.all(
          cacheNames
            .filter(
              (cacheName) =>
                cacheName.startsWith(
                  CACHE_PREFIX
                ) &&
                cacheName !== CACHE_NAME
            )
            .map(
              (cacheName) =>
                caches.delete(cacheName)
            )
        );

        await self.clients.claim();

        const windowClients =
          await self.clients.matchAll({
            type: "window",
            includeUncontrolled: true
          });

        windowClients.forEach((client) => {
          client.postMessage({
            type: "app-shell-active",
            cacheName: CACHE_NAME
          });
        });
      })()
    );
  }
);

function isSameOriginNavigation(request, url) {
  return (
    request.mode === "navigate" &&
    url.origin === self.location.origin
  );
}

function getNavigationFallback(pathname) {
  if (pathname === "/" || pathname === "") {
    return "/index.html";
  }

  const normalizedPath =
    pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  const matchedPage =
    APP_PAGES.find(
      (pagePath) =>
        normalizedPath === pagePath ||
        normalizedPath.endsWith(pagePath)
    );

  return matchedPage || null;
}

function isShellAsset(url) {
  if (url.origin !== self.location.origin) {
    return false;
  }

  return (
    url.pathname.startsWith("/css/") ||
    url.pathname.startsWith("/js/") ||
    url.pathname.startsWith("/img/")
  );
}

async function fetchWithTimeout(request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    NETWORK_TIMEOUT_MS
  );

  try {
    return await fetch(request, {
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function networkFirstNavigation(
  request,
  fallbackPath
) {
  const cache =
    await caches.open(CACHE_NAME);

  try {
    const response =
      await fetchWithTimeout(request);

    if (!response.ok) {
      throw new Error(
        `Navigation request failed with status ${response.status}.`
      );
    }

    if (fallbackPath) {
      await cache.put(
        fallbackPath,
        response.clone()
      );
    }

    return response;
  } catch (error) {
    if (fallbackPath) {
      const cached =
        await cache.match(
          fallbackPath,
          {
            ignoreSearch: true
          }
        );

      if (cached) {
        return cached;
      }
    }

    const home =
      await cache.match(
        "/index.html",
        {
          ignoreSearch: true
        }
      );

    if (home) {
      return home;
    }

    throw error;
  }
}

async function networkFirstShellAsset(request) {
  const cache =
    await caches.open(CACHE_NAME);

  try {
    const response =
      await fetchWithTimeout(request);

    if (!response.ok) {
      throw new Error(
        `Shell asset request failed with status ${response.status}.`
      );
    }

    await cache.put(
      new URL(request.url).pathname,
      response.clone()
    );

    return response;
  } catch (error) {
    const cached =
      await cache.match(
        request,
        {
          ignoreSearch: true
        }
      );

    if (cached) {
      return cached;
    }

    throw error;
  }
}

self.addEventListener(
  "fetch",
  (event) => {
    const request = event.request;

    if (request.method !== "GET") {
      return;
    }

    const url = new URL(request.url);

    if (isSameOriginNavigation(request, url)) {
      const fallbackPath =
        getNavigationFallback(
          url.pathname
        );

      if (fallbackPath) {
        event.respondWith(
          networkFirstNavigation(
            request,
            fallbackPath
          )
        );
      }

      return;
    }

    if (isShellAsset(url)) {
      event.respondWith(
        networkFirstShellAsset(request)
      );
    }
  }
);
