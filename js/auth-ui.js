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
    connectionState: getInitialConnectionState()
  };

  function getAuthState() {
    const authState =
      document.documentElement.dataset.authState ||
      "checking";

    return VALID_AUTH_STATES.has(authState)
      ? authState
      : "checking";
  }

  function getInitialConnectionState() {
    const appState = window.AppShell?.getState?.() || {};

    return isConnectionIssue(appState)
      ? "offline"
      : "online";
  }

  function isConnectionIssue(appState = {}) {
    return (
      navigator.onLine === false ||
      appState.connectionIssue === true ||
      appState.appReachable === false
    );
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

  function setOfflineAppearance(button, offline) {
    if (!button) return;
    button.classList.toggle("auth-control-offline", offline);
    button.dataset.connectionState = offline ? "offline" : "online";
  }

  function render() {
    const { login, logout } = getControls();
    const authState = getAuthState();
    const key = `${authState}:${state.connectionState}`;

    if (login) {
      login.disabled = true;
      login.title = "";
      setOfflineAppearance(login, false);
    }

    if (logout) {
      logout.disabled = false;
      logout.title = "";
      setOfflineAppearance(logout, false);
    }

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
        setOfflineAppearance(logout, true);
        logout.title =
          "Log out - you will remain logged out when you reconnect.";
        break;

      case "signed-out:online":
        setVisible(logout, false);
        setVisible(login, true);
        login.disabled = false;
        break;

      case "signed-out:offline":
        setVisible(logout, false);
        setVisible(login, true);
        login.disabled = true;
        setOfflineAppearance(login, true);
        login.title = "Login requires an internet connection.";
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
      throw new Error(
        `Unknown authentication UI state: ${authState}`
      );
    }

    document.documentElement.dataset.authState =
      authState;

    render();
  }

  function setConnectionState(connectionState) {
    if (!["online", "offline"].includes(connectionState)) {
      throw new Error(`Unknown connection UI state: ${connectionState}`);
    }

    state.connectionState = connectionState;
    render();
  }

  function applyConnectivityState(appState = {}) {
    setConnectionState(
      isConnectionIssue(appState)
        ? "offline"
        : "online"
    );
  }

  function getState() {
    return Object.freeze({
      authState: getAuthState(),
      connectionState: state.connectionState
    });
  }

  window.addEventListener(
    "app-connectivity-changed",
    (event) => {
      applyConnectivityState(event.detail || {});
    }
  );

  window.addEventListener("offline", () => {
    setConnectionState("offline");
  });

  render();

  return Object.freeze({
    setAuthState,
    setConnectionState,
    applyConnectivityState,
    getState
  });
})();
