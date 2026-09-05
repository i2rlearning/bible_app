/**
 * GLOBAL INITIALIZATION FOR BIBLE APP
 *
 * Responsibilities:
 * - Register the service worker once the page has loaded.
 * - Initialize OfflineManager once after the DOM is ready.
 * - Prevent duplicate OfflineManager instances.
 */

"use strict";

function initializeServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    console.warn("[SW] Service workers are not supported by this browser.");
    return;
  }

  navigator.serviceWorker
    .register("/sw.js", { updateViaCache: "none" })
    .then((registration) => {
      console.log("[SW] Registered:", registration.scope);

      // Ask the browser to check for a new worker rather than relying on an
      // old cached service-worker script.
      return registration.update();
    })
    .catch((error) => {
      console.error("[SW] Registration failed:", error);
    });
}

function initializeOfflineManager() {
  if (!window.OfflineManager) {
    console.error("[Offline] OfflineManager class is not available.");
    return;
  }

  if (window.offlineManagerInstance) {
    console.log("[Offline] Manager already initialized.");
    return;
  }

  try {
    window.offlineManagerInstance = new window.OfflineManager();
    console.log("[Offline] Manager initialized.");
  } catch (error) {
    console.error("[Offline] Manager initialization failed:", error);
  }
}

function initializeApplication() {
  initializeOfflineManager();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApplication, {
    once: true
  });
} else {
  initializeApplication();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", initializeServiceWorker, { once: true });
}
