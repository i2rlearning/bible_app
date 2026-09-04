/**
 * GLOBAL INITIALIZATION FOR BIBLE APP
 */

// 1. Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => console.log('[SW] Registered:', registration.scope))
      .catch(error => console.error('[SW] Registration failed:', error));
  });
}

// 2. Initialize OfflineManager when DOM is fully ready
function initializeOfflineManager() {
  if (window.OfflineManager && !window.offlineManagerInstance) {
    window.offlineManagerInstance = new OfflineManager();
    console.log('[Offline] Manager initialized');
  }
}

// Run initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeOfflineManager);
} else {
  initializeOfflineManager();
}
