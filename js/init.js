// /js/init.js - Global initialization for the Bible App

// 1. Register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[SW] Service Worker registered:', registration.scope);
      })
      .catch((error) => {
        console.error('[SW] Service Worker registration failed:', error);
      });
  });
}

// 2. Future global initialization goes here
//    (Clerk, analytics, error tracking, etc.)
