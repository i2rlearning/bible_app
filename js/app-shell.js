"use strict";

window.AppShell = (() => {
  let registrationPromise = null;

  function canRegister() {
    return (
      "serviceWorker" in navigator &&
      (
        window.location.protocol === "https:" ||
        window.location.hostname === "localhost"
      )
    );
  }

  function register() {
    if (!canRegister()) {
      return Promise.resolve(null);
    }

    if (!registrationPromise) {
      registrationPromise =
        navigator.serviceWorker
          .register("/service-worker.js", {
            scope: "/"
          })
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

  register();

  return Object.freeze({
    register,
    ready
  });
})();
