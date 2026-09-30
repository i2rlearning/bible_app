"use strict";

/*
 * AppShell
 *
 * Shared application-shell and connectivity coordinator.
 * Registers the service worker, verifies real backend reachability, handles
 * offline/reconnect transitions, and exposes connection state to other modules.
 */

window.AppShell = (() => {
  const HEALTH_URL = "/api/health";
  const RECONNECT_RELOAD_KEY = "appShellReconnectReloadAttempted";
  const CONTROL_RECOVERY_KEY = "appShellControlRecoveryAttempted";
  const CONTROL_WAIT_MS = 1400;
  const STARTUP_PROBE_DELAY_MS = 300;

  let registrationPromise = null;
  let probePromise = null;
  let controlRecoveryPromise = null;
  let controlRecoveryTimer = null;

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

  if (
    canRegister() &&
    "serviceWorker" in navigator &&
    navigator.serviceWorker.controller
  ) {
    try {
      sessionStorage.removeItem(
        CONTROL_RECOVERY_KEY
      );
    } catch (_error) {
      // Recovery bookkeeping is optional.
    }
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

  function readSessionFlag(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (_error) {
      return null;
    }
  }

  function writeSessionFlag(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch (_error) {
      // Control recovery must still work when session storage is unavailable.
    }
  }

  function clearSessionFlag(key) {
    try {
      sessionStorage.removeItem(key);
    } catch (_error) {
      // Recovery bookkeeping is optional.
    }
  }

  function waitForController(timeoutMs = CONTROL_WAIT_MS) {
    if (navigator.serviceWorker.controller) {
      return Promise.resolve(
        navigator.serviceWorker.controller
      );
    }

    return new Promise((resolve) => {
      let settled = false;

      const finish = (controller = null) => {
        if (settled) {
          return;
        }

        settled = true;
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          handleControllerChange
        );
        window.clearTimeout(timeoutId);
        resolve(controller);
      };

      const handleControllerChange = () => {
        if (navigator.serviceWorker.controller) {
          finish(
            navigator.serviceWorker.controller
          );
        }
      };

      navigator.serviceWorker.addEventListener(
        "controllerchange",
        handleControllerChange
      );

      const timeoutId = window.setTimeout(
        () => finish(null),
        timeoutMs
      );
    });
  }

  function scheduleControlRecoveryNavigation() {
    if (navigator.serviceWorker.controller) {
      clearSessionFlag(CONTROL_RECOVERY_KEY);
      return false;
    }

    if (
      readSessionFlag(CONTROL_RECOVERY_KEY) === "1" ||
      controlRecoveryTimer
    ) {
      return false;
    }

    writeSessionFlag(
      CONTROL_RECOVERY_KEY,
      "1"
    );

    controlRecoveryTimer = window.setTimeout(
      () => {
        controlRecoveryTimer = null;

        if (navigator.serviceWorker.controller) {
          clearSessionFlag(
            CONTROL_RECOVERY_KEY
          );
          return;
        }

        window.location.replace(
          window.location.href
        );
      },
      80
    );

    return true;
  }

  async function ensureControlled() {
    if (!canRegister()) {
      return null;
    }

    if (navigator.serviceWorker.controller) {
      clearSessionFlag(CONTROL_RECOVERY_KEY);
      return navigator.serviceWorker.controller;
    }

    if (controlRecoveryPromise) {
      return controlRecoveryPromise;
    }

    controlRecoveryPromise = (async () => {
      const registration = await ready();

      if (!registration || !registration.active) {
        return null;
      }

      const controller =
        await waitForController();

      if (controller) {
        clearSessionFlag(
          CONTROL_RECOVERY_KEY
        );
        return controller;
      }

      scheduleControlRecoveryNavigation();
      return null;
    })().finally(() => {
      controlRecoveryPromise = null;
    });

    return controlRecoveryPromise;
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

  if (canRegister()) {
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        if (navigator.serviceWorker.controller) {
          if (controlRecoveryTimer) {
            window.clearTimeout(
              controlRecoveryTimer
            );
            controlRecoveryTimer = null;
          }

          clearSessionFlag(
            CONTROL_RECOVERY_KEY
          );
        }
      }
    );

    navigator.serviceWorker.addEventListener(
      "message",
      (event) => {
        if (
          event.data &&
          event.data.type ===
            "app-shell-active" &&
          !navigator.serviceWorker.controller
        ) {
          ensureControlled();
        }
      }
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
      serviceFailures.clear();

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

  register().then(() => {
    ensureControlled();
  });

  window.setTimeout(
    () => {
      probe({ reason: "startup" });
    },
    STARTUP_PROBE_DELAY_MS
  );

  return Object.freeze({
    register,
    ready,
    ensureControlled,
    probe,
    getState,
    markDegraded,
    clearDegraded,
    reportNetworkFailure,
    reportNetworkSuccess,
    hasServiceFailure
  });
})();
