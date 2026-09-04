/**
 * GLOBAL INITIALIZATION FOR BIBLE APP
 *
 * Purpose: Central initialization file loaded by every HTML page.
 *          Registers the service worker and initializes all managers.
 */

// 1. Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => console.log('[SW] Registered:', registration.scope))
      .catch(error => console.error('[SW] Registration failed:', error));
  });
}

// 2. Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Initialize OfflineManager - this creates the button and modal
  if (window.OfflineManager) {
    window.offlineManager = new OfflineManager();
  }
});
