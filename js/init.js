/**
 * GLOBAL INITIALIZATION FOR BIBLE APP
 *
 * Purpose: Central initialization file loaded by every HTML page.
 *          Registers the service worker and handles other global setup.
 *
 * Features:
 * - Service worker registration
 * - Placeholder for future global initialization (Clerk, analytics, etc.)
 *
 * Usage: Include <script src="js/init.js"></script> in every HTML file
 *        before the closing </body> tag.
 */

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

// 2. Initialize offline manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  if (window.OfflineManager) {
    // Already initialized by offline-manager.js
  }
});

// 3. Future global initialization goes here
