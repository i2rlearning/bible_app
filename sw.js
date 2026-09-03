/**
 * SERVICE WORKER FOR BIBLE APP
 *
 * Purpose: Caches all app assets (HTML, CSS, JS, images) so the entire app
 *          works offline. Uses a cache-first strategy for static assets.
 *
 * Features:
 * - Caches app shell on install
 * - Serves cached assets when offline
 * - Auto-updates when new versions are deployed
 * - Skips API calls (handled separately by IndexedDB)
 *
 * Scope: Controls all pages under the root domain
 */

const CACHE_NAME = 'bible-app-v1';
const OFFLINE_URL = '/index.html';

// All files to cache for offline use
const ASSETS_TO_CACHE = [
  // Root
  '/',
  '/index.html',
  '/verse.html',
  '/search.html',
  '/study-desk.html',
  '/copyright.html',
  '/sign-in.html',
  '/sign-up.html',

  // CSS
  '/css/menu.css',
  '/css/bible-main.css',
  '/css/bible-selector.css',
  '/css/index.css',
  '/css/verse-of-day.css',
  '/css/scripture.css',
  '/css/scripture-reference-popup.css',
  '/css/editor.css',
  '/css/study-actions.css',
  '/css/scripture-keywords.css',
  '/css/anchored-annotations.css',
  '/css/copyright.css',
  '/css/menu-scroll.css',
  '/css/menu-popover.css',

  // JS
  '/js/my_key.js',
  '/js/bible-version-visibility.js',
  '/js/ui-fit-controller.js',
  '/js/menu.js',
  '/js/auth.js',
  '/js/bible-language.js',
  '/js/bible-selector.js',
  '/js/user-preferences.js',
  '/js/passage-picker.js',
  '/js/verse-of-day.js',
  '/js/study-desk.js',
  '/js/editor.js',
  '/js/verses.js',
  '/js/search.js',

  // Images
  '/img/favicon.ico',
  '/img/logo.png',
  '/img/left_stamp_on.png',
  '/img/right_stamp_on.png',
  '/img/orig_left_stamp.png',
  '/img/orig_right_stamp.png',

  // Font Awesome (self-hosted alternative would be better)
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css',
  'https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.snow.css',
  'https://cdn.jsdelivr.net/npm/@enzedonline/quill-blot-formatter2@3.2.0/dist/css/quill-blot-formatter2.css',
  'https://cdn.scripture.api.bible/fums/fumsv2.min.js',
  'https://cdn.jsdelivr.net/npm/quill@2.0.2/dist/quill.min.js',
];

// Install: Cache all assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app shell and assets...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => {
        console.log('[SW] All assets cached for offline use');
      })
      .catch((error) => {
        console.error('[SW] Failed to cache assets:', error);
      })
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log(`[SW] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch: Serve cached assets when offline
self.addEventListener('fetch', (event) => {
  // Skip API calls and external resources - let the app handle those
  if (event.request.url.includes('/api/') ||
      event.request.url.includes('api.bible') ||
      event.request.url.includes('clerk')) {
    return fetch(event.request);
  }

  // For everything else, try cache first, fall back to network
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          console.log(`[SW] Serving from cache: ${event.request.url}`);
          return response;
        }

        console.log(`[SW] Fetching from network: ${event.request.url}`);
        return fetch(event.request)
          .then((response) => {
            // Clone and cache the response for future offline use
            const responseClone = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseClone);
              });
            return response;
          });
      })
      .catch(() => {
        // If both cache and network fail, serve the offline page
        console.log(`[SW] Offline fallback for: ${event.request.url}`);
        return caches.match(OFFLINE_URL);
      })
  );
});

// Listen for messages from the app (for manual cache updates)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CACHE_BIBLE_TEXT') {
    const { url, text } = event.data;
    caches.open(CACHE_NAME)
      .then((cache) => {
        cache.put(url, new Response(text));
      });
  }
});
