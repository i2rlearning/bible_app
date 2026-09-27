"use strict";

const CACHE_PREFIX = "bible-app-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;

const READER_SHELL = [
  "/verse.html",
  "/css/menu.css",
  "/css/menu-scroll.css",
  "/css/menu-popover.css",
  "/css/bible-main.css",
  "/css/bible-selector.css",
  "/css/scripture.css",
  "/css/scripture-reference-popup.css",
  "/css/editor.css",
  "/css/app-conflict-dialog.css",
  "/css/study-actions.css",
  "/css/scripture-keywords.css",
  "/css/anchored-annotations.css",
  "/css/copyright.css",
  "/js/app-shell.js",
  "/js/my_key.js",
  "/js/bible-offline-db.js",
  "/js/bible-data.js",
  "/js/bible-version-visibility.js",
  "/js/menu.js",
  "/js/app-conflict-dialog.js",
  "/js/auth.js",
  "/js/bible-language.js",
  "/js/bible-selector.js",
  "/js/user-preferences.js",
  "/js/passage-picker.js",
  "/js/copyright-footer.js",
  "/js/verses.js",
  "/js/scripture-reference-popup.js",
  "/js/anchored-annotations.js",
  "/js/editor.js",
  "/js/study-actions.js",
  "/js/scripture-keywords.js",
  "/img/left_stamp_on.png",
  "/img/right_stamp_on.png",
  "/img/orig_left_stamp.png",
  "/img/orig_right_stamp.png",
  "/img/favicon.ico"
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
          READER_SHELL.map(
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
      })()
    );
  }
);

function isVerseNavigation(request, url) {
  return (
    request.mode === "navigate" &&
    url.origin === self.location.origin &&
    (
      url.pathname === "/verse.html" ||
      url.pathname.endsWith("/verse.html")
    )
  );
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

async function networkFirstVerse(request) {
  const cache =
    await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);

    if (response.ok) {
      await cache.put(
        "/verse.html",
        response.clone()
      );
    }

    return response;
  } catch (_error) {
    const cached =
      await cache.match(
        "/verse.html",
        {
          ignoreSearch: true
        }
      );

    if (cached) {
      return cached;
    }

    throw _error;
  }
}

async function networkFirstShellAsset(request) {
  const cache =
    await caches.open(CACHE_NAME);

  try {
    const response =
      await fetch(request);

    if (response.ok) {
      await cache.put(
        new URL(
          request.url
        ).pathname,
        response.clone()
      );
    }

    return response;
  } catch (_error) {
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

    throw _error;
  }
}

self.addEventListener(
  "fetch",
  (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (isVerseNavigation(request, url)) {
      event.respondWith(
        networkFirstVerse(request)
      );
      return;
    }

    if (
      request.method === "GET" &&
      isShellAsset(url)
    ) {
      event.respondWith(
        networkFirstShellAsset(request)
      );
    }
  }
);
