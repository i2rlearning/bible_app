"use strict";

/*
 * Authentication Control UI
 *
 * Owns the visible Login/Logout control state only.
 * It combines two independent facts:
 *   1. authentication state
 *   2. connection state
 *
 * This file does not call Clerk, authenticate users, save user data, or decide
 * whether a logout is pending. js/auth.js owns those responsibilities.
 */

window.AuthUI = (() => {
  const VALID_AUTH_STATES = new Set([
    "checking",
    "signed-in",
    "signed-out",
    "offline-trusted"
  ]);

  const state = {
    authState: "checking",
    connectionState: getInitialConnectionState()
  };

  function connectionIsUnavailable(appState = {}) {
    return (
      navigator.onLine === false ||
      appState.connectionIssue === true ||
      appState.appReachable === false
    );
  }

  function getInitialConnectionState() {
    const appState = window.AppShell?.getState?.() || {};
    return connectionIsUnavailable(appState) ? "offline" : "online";
  }

  function getControls() {
    return {
      login: document.getElementById("login"),
      logout: document.getElementById("logout")
    };
  }

  function setVisible(button, visible) {
    if (!button) return;
    button.hidden = !visible;
    button.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function resetButton(button) {
    if (!button) return;
    button.disabled = false;
    button.title = "";
    button.classList.remove("auth-control-offline");
    button.dataset.connectionState = "online";
  }

  function render() {
    const { login, logout } = getControls();
    const key = `${state.authState}:${state.connectionState}`;

    resetButton(login);
    resetButton(logout);

    switch (key) {
      case "signed-in:online":
      case "offline-trusted:online":
        setVisible(login, false);
        setVisible(logout, true);
        break;

      case "signed-in:offline":
      case "offline-trusted:offline":
        setVisible(login, false);
        setVisible(logout, true);
        logout?.classList.add("auth-control-offline");
        if (logout) {
          logout.dataset.connectionState = "offline";
          logout.title =
            "Log out - you will remain logged out when you reconnect.";
        }
        break;

      case "signed-out:online":
        setVisible(logout, false);
        setVisible(login, true);
        break;

      case "signed-out:offline":
        setVisible(logout, false);
        setVisible(login, true);
        if (login) {
          login.disabled = true;
          login.classList.add("auth-control-offline");
          login.dataset.connectionState = "offline";
          login.title = "Login requires an internet connection.";
        }
        break;

      case "checking:online":
      case "checking:offline":
      default:
        setVisible(login, false);
        setVisible(logout, false);
        break;
    }

    document.documentElement.dataset.authControlState = key;
  }

  function setAuthState(authState) {
    if (!VALID_AUTH_STATES.has(authState)) {
      throw new Error(`Unknown authentication UI state: ${authState}`);
    }
    state.authState = authState;
    render();
  }

  function setConnectionState(connectionState) {
    if (!new Set(["online", "offline"]).has(connectionState)) {
      throw new Error(`Unknown connection UI state: ${connectionState}`);
    }
    state.connectionState = connectionState;
    render();
  }

  function applyConnectivityState(appState = {}) {
    setConnectionState(
      connectionIsUnavailable(appState) ? "offline" : "online"
    );
  }

  function getState() {
    return Object.freeze({ ...state });
  }

  window.addEventListener("app-connectivity-changed", (event) => {
    applyConnectivityState(event.detail || {});
  });

  window.addEventListener("offline", () => {
    setConnectionState("offline");
  });

  window.addEventListener("online", () => {
    const appState = window.AppShell?.getState?.() || {};
    applyConnectivityState(appState);
  });

  render();

  return Object.freeze({
    setAuthState,
    setConnectionState,
    applyConnectivityState,
    getState
  });
})();
