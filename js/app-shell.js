"use strict";

window.AppShell = (() => {
  const HEALTH_URL = "/api/health";
  const RECONNECT_RELOAD_KEY = "appShellReconnectReloadAttempted";

  let registrationPromise = null;
  let probePromise = null;

  const degradedReasons = new Set();
  const serviceFailures = new Set();

  const state = {
    browserOnline:
      typeof navigator === "undefined"
        ? true
        : navigator.onLine !== false,
    appReachable: null,
    lastVerifiedAt: 0,
    lastReason: "startup"
  };

  if (state.browserOnline === false) {
    degradedReasons.add("offline-start");
  }

  function canRegister() {
    return (
      "serviceWorker" in navigator &&
      (
        window.location.protocol === "https:" ||
        window.location.hostname === "localhost"
      )
    );
  }

  function getState() {
    return Object.freeze({
      browserOnline: state.browserOnline,
      appReachable: state.appReachable,
      connectionIssue:
        state.browserOnline === false ||
        state.appReachable === false ||
        serviceFailures.size > 0,
      degradedReasons: [...degradedReasons],
      serviceFailures: [...serviceFailures],
      lastVerifiedAt: state.lastVerifiedAt,
      lastReason: state.lastReason
    });
  }

  function dispatchState(reason) {
    state.lastReason = reason || state.lastReason;

    window.dispatchEvent(
      new CustomEvent(
        "app-connectivity-changed",
        {
          detail: getState()
        }
      )
    );
  }

  function updateState(partial, reason) {
    Object.assign(state, partial);
    dispatchState(reason);
  }

  function register() {
    if (!canRegister()) {
      return Promise.resolve(null);
    }

    if (!registrationPromise) {
      registrationPromise =
        navigator.serviceWorker
          .register(
            "/service-worker.js",
            {
              scope: "/"
            }
          )
          .catch((error) => {
            console.warn(
              "Application shell registration failed:",
              error
            );
            return null;
          });
    }

    return registrationPromise;
  }

  function ready() {
    if (!canRegister()) {
      return Promise.resolve(null);
    }

    register();

    return navigator.serviceWorker.ready
      .catch(() => null);
  }

  function shouldReloadAfterReconnect() {
    return (
      state.browserOnline !== false &&
      state.appReachable === true &&
      degradedReasons.size > 0
    );
  }

  function reloadAfterReconnectIfNeeded() {
    if (!shouldReloadAfterReconnect()) {
      return;
    }

    try {
      if (
        sessionStorage.getItem(
          RECONNECT_RELOAD_KEY
        ) === "1"
      ) {
        return;
      }

      sessionStorage.setItem(
        RECONNECT_RELOAD_KEY,
        "1"
      );
    } catch (_error) {
      // If session storage is unavailable, still allow one recovery reload.
    }

    window.setTimeout(() => {
      window.location.reload();
    }, 75);
  }

  async function probe(options = {}) {
    if (probePromise) {
      return probePromise;
    }

    if (
      typeof navigator !== "undefined" &&
      navigator.onLine === false
    ) {
      updateState(
        {
          browserOnline: false,
          appReachable: false,
          lastVerifiedAt: Date.now()
        },
        options.reason || "browser-offline"
      );

      return getState();
    }

    const timeoutMs =
      Number(options.timeoutMs) > 0
        ? Number(options.timeoutMs)
        : 4500;

    probePromise = (async () => {
      const controller =
        new AbortController();

      const timeoutId =
        window.setTimeout(
          () => controller.abort(),
          timeoutMs
        );

      try {
        const url = new URL(
          HEALTH_URL,
          window.location.origin
        );

        url.searchParams.set(
          "connectivity",
          Date.now().toString()
        );

        const response = await fetch(
          url.toString(),
          {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal
          }
        );

        updateState(
          {
            browserOnline: true,
            appReachable: response.ok,
            lastVerifiedAt: Date.now()
          },
          options.reason || "probe"
        );

        if (response.ok) {
          reloadAfterReconnectIfNeeded();
        }
      } catch (_error) {
        updateState(
          {
            browserOnline:
              navigator.onLine !== false,
            appReachable: false,
            lastVerifiedAt: Date.now()
          },
          options.reason || "probe-failed"
        );
      } finally {
        window.clearTimeout(timeoutId);
        probePromise = null;
      }

      return getState();
    })();

    return probePromise;
  }

  function markDegraded(reason) {
    const normalized =
      String(reason || "unknown").trim();

    if (!normalized) {
      return;
    }

    degradedReasons.add(normalized);
    dispatchState("degraded");

    if (state.appReachable === true) {
      reloadAfterReconnectIfNeeded();
    }
  }

  function clearDegraded(reason) {
    const normalized =
      String(reason || "").trim();

    if (normalized) {
      degradedReasons.delete(normalized);
    }

    if (degradedReasons.size === 0) {
      try {
        sessionStorage.removeItem(
          RECONNECT_RELOAD_KEY
        );
      } catch (_error) {
        // Recovery bookkeeping is optional.
      }
    }

    dispatchState("degraded-cleared");
  }

  function reportNetworkFailure(serviceName) {
    const normalized =
      String(serviceName || "network").trim();

    serviceFailures.add(normalized);
    dispatchState("service-failure");
  }

  function reportNetworkSuccess(serviceName) {
    const normalized =
      String(serviceName || "network").trim();

    serviceFailures.delete(normalized);
    dispatchState("service-recovered");

    if (
      degradedReasons.size > 0 &&
      state.browserOnline !== false &&
      state.appReachable !== true
    ) {
      probe({
        reason: `${normalized}-recovered`
      });
    }
  }

  function hasServiceFailure(serviceName) {
    return serviceFailures.has(
      String(serviceName || "network").trim()
    );
  }

  window.addEventListener(
    "offline",
    () => {
      updateState(
        {
          browserOnline: false,
          appReachable: false,
          lastVerifiedAt: Date.now()
        },
        "browser-offline"
      );
    }
  );

  window.addEventListener(
    "online",
    () => {
      updateState(
        {
          browserOnline: true
        },
        "browser-online"
      );

      probe({
        reason: "browser-online"
      });
    }
  );

  window.addEventListener(
    "focus",
    () => {
      if (
        navigator.onLine !== false &&
        (
          state.appReachable === false ||
          degradedReasons.size > 0
        )
      ) {
        probe({ reason: "focus" });
      }
    }
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        document.visibilityState === "visible" &&
        navigator.onLine !== false &&
        (
          state.appReachable === false ||
          degradedReasons.size > 0
        )
      ) {
        probe({
          reason: "visibility"
        });
      }
    }
  );

  window.addEventListener(
    "pageshow",
    () => {
      if (
        navigator.onLine !== false &&
        state.appReachable !== true
      ) {
        probe({ reason: "pageshow" });
      }
    }
  );

  register();

  window.setTimeout(
    () => {
      probe({ reason: "startup" });
    },
    0
  );

  return Object.freeze({
    register,
    ready,
    probe,
    getState,
    markDegraded,
    clearDegraded,
    reportNetworkFailure,
    reportNetworkSuccess,
    hasServiceFailure
  });
})();
