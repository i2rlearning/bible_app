/*
 * Project file: js/connectivity-status.js
 * Purpose: Reads the app's current connectivity state and updates the shared
 * status banner so users can see when the app is online, offline, or degraded.
 */

"use strict";

window.ConnectivityStatus = (() => {
  const ELEMENT_ID = "app-connectivity-status";
  const STARTUP_GRACE_MS = 1100;
  const startedAt = Date.now();
  let startupRefreshTimer = null;
  let element = null;
  let refreshPromise = null;

  function getCurrentBibleId() {
    const params =
      new URLSearchParams(
        window.location.search
      );

    return (
      params.get("bible") ||
      params.get("version") ||
      ""
    );
  }

  function ensureElement() {
    if (element && element.isConnected) {
      return element;
    }

    element =
      document.getElementById(
        ELEMENT_ID
      );

    if (element) {
      return element;
    }

    element =
      document.createElement("div");

    element.id = ELEMENT_ID;
    element.className =
      "app-connectivity-status";
    element.setAttribute(
      "aria-live",
      "polite"
    );
    element.hidden = true;

    const explicitAnchor =
      document.querySelector(
        "[data-connectivity-anchor]"
      );

    if (explicitAnchor) {
      explicitAnchor.appendChild(element);
      return element;
    }

    const header =
      document.querySelector(".subheader");

    if (header?.parentNode) {
      header.insertAdjacentElement(
        "afterend",
        element
      );
      return element;
    }

    document.body.prepend(element);
    return element;
  }

  async function getBibleAvailability() {
    if (
      !window.BibleOfflineDB ||
      typeof window.BibleOfflineDB.getReadyBibles !== "function"
    ) {
      return {
        readyBibles: [],
        currentReady: false
      };
    }

    try {
      const readyBibles =
        await window.BibleOfflineDB.getReadyBibles();

      const currentBibleId =
        getCurrentBibleId();

      return {
        readyBibles,
        currentReady:
          Boolean(currentBibleId) &&
          readyBibles.some(
            (bible) =>
              String(bible?.id || "") ===
              currentBibleId
          )
      };
    } catch (_error) {
      return {
        readyBibles: [],
        currentReady: false
      };
    }
  }

  function setMessage(message, tone) {
    const target = ensureElement();

    if (!message) {
      target.hidden = true;
      target.textContent = "";
      target.className =
        "app-connectivity-status";
      return;
    }

    target.textContent = message;
    target.className =
      `app-connectivity-status app-connectivity-status-${tone || "info"}`;
    target.hidden = false;
  }

  function isWithinStartupGrace() {
    return (Date.now() - startedAt) < STARTUP_GRACE_MS;
  }

  function scheduleStartupRefresh() {
    if (startupRefreshTimer) {
      return;
    }

    const remaining = Math.max(
      0,
      STARTUP_GRACE_MS - (Date.now() - startedAt)
    );

    startupRefreshTimer = window.setTimeout(() => {
      startupRefreshTimer = null;
      refresh();
    }, remaining + 25);
  }

  async function refresh() {
    if (isWithinStartupGrace()) {
      setMessage("");
      scheduleStartupRefresh();
      return;
    }

    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      const state =
        window.AppShell?.getState?.() || {
          browserOnline:
            navigator.onLine !== false,
          appReachable: null,
          connectionIssue:
            navigator.onLine === false,
          serviceFailures: []
        };

      const {
        readyBibles,
        currentReady
      } = await getBibleAvailability();

      const hasReadyBible =
        readyBibles.length > 0;

      const isReader =
        /(?:^|\/)verse\.html$/i.test(
          window.location.pathname
        );

      const browserOffline =
        state.browserOnline === false;

      const apiBibleUnavailable =
        Array.isArray(
          state.serviceFailures
        ) &&
        state.serviceFailures.includes(
          "api-bible"
        );

      const connectionIssue =
        state.appReachable === false ||
        apiBibleUnavailable;

      if (
        !browserOffline &&
        !connectionIssue
      ) {
        setMessage("");
        return;
      }

      if (currentReady) {
        setMessage(
          browserOffline
            ? "Offline - using downloaded copy."
            : "Connection issue - using downloaded copy.",
          "info"
        );
        return;
      }

      if (isReader && hasReadyBible) {
        setMessage(
          browserOffline
            ? "This Bible is not available offline. Choose one of your downloaded Bibles to continue reading, or reconnect to the internet."
            : "This Bible is not downloaded on this device. Choose one of your downloaded Bibles or reconnect to continue reading.",
          "warning"
        );
        return;
      }

      if (!hasReadyBible) {
        setMessage(
          browserOffline
            ? "You're offline. This device does not have a Bible available for offline reading. Download a Bible while online to keep reading whenever an internet connection is unavailable."
            : "Online services are currently unavailable. No Bible is downloaded on this device. Download a Bible while online to keep reading during connection outages.",
          "warning"
        );
        return;
      }

      setMessage(
        browserOffline
          ? "Offline - downloaded Bibles are available on this device."
          : "Connection issue - downloaded Bibles are still available on this device.",
        "info"
      );
    })().finally(() => {
      refreshPromise = null;
    });

    return refreshPromise;
  }

  document.addEventListener(
    "DOMContentLoaded",
    refresh
  );

  window.addEventListener(
    "app-connectivity-changed",
    refresh
  );

  window.addEventListener(
    "offline",
    refresh
  );

  window.addEventListener(
    "online",
    () => {
      window.setTimeout(
        refresh,
        100
      );
    }
  );

  return Object.freeze({
    refresh
  });
})();
