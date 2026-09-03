// Register the service worker for offline capability
// Include this file in all your HTML pages (index.html, verse.html, etc.)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[SW] Service Worker registered with scope:', registration.scope);

        // Optional: Show a toast or update UI to indicate offline mode is ready
        if (navigator.onLine) {
          console.log('[SW] App is ready for offline use');
        } else {
          console.log('[SW] App is running offline');
        }
      })
      .catch((error) => {
        console.error('[SW] Service Worker registration failed:', error);
      });
  });
}
