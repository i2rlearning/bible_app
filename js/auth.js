/*
 * Project file: js/auth.js
 * Purpose: Handles front-end authentication and session UI, including login,
 * signup, logout, Clerk session checks, and access to authenticated tools.
 */

// This file handles front-end login/session helper

// =========================================================================
//  CORE DOM LOGIC & API SETUP (Runs Instantly)
// =========================================================================
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded. Core scripts and API.bible can execute now.");

  const loginButton = document.getElementById("login");
  const signupButton = document.getElementById("signup");
  const logoutButton = document.getElementById("logout");
  const myNotesModal = document.getElementById("myNotesModal");

  // ==========================================
  // UI & MODAL FUNCTIONS
  // ==========================================
  function toggleModal(modal, show) {
    if (!modal) return;

    if (show) {
      modal.style.display = "flex";
      modal.classList.add("is-open");
    } else {
      modal.style.display = "none";
      modal.classList.remove("is-open");
    }
  }

  // =========================================================================
  // CENTRAL AUTHENTICATION STATE RESOLVER AND RENDERER
  //
  // This is the only section that decides Login/Logout visibility, enabled
  // state, private navigation access, and editor lock/unlock behavior.
  //
  // If authentication UI behaves unexpectedly, start troubleshooting here.
  // =========================================================================
  const AUTH_STATE = Object.freeze({
    CHECKING: "checking",
    SIGNED_IN_ONLINE: "signed-in-online",
    SIGNED_IN_OFFLINE: "signed-in-offline",
    SIGNED_OUT_ONLINE: "signed-out-online",
    SIGNED_OUT_OFFLINE: "signed-out-offline",
    LOGOUT_PENDING: "logout-pending"
  });

  let currentAuthState = AUTH_STATE.CHECKING;
  let lastKnownClerkUser = null;
  let serverAuthProbePromise = null;

  function authConnectionIsOnline() {
    const state = window.AppShell?.getState?.() || {};

    return (
      navigator.onLine !== false &&
      state.browserOnline !== false &&
      state.appReachable !== false &&
      state.connectionIssue !== true
    );
  }

  function resolveAuthState(clerkUser) {
    const online = authConnectionIsOnline();

    if (clerkUser) {
      return online
        ? AUTH_STATE.SIGNED_IN_ONLINE
        : AUTH_STATE.SIGNED_IN_OFFLINE;
    }

    return online
      ? AUTH_STATE.SIGNED_OUT_ONLINE
      : AUTH_STATE.SIGNED_OUT_OFFLINE;
  }

  function setPrivateNavigationEnabled(enabled) {
    const myNotesLink =
      document.getElementById("openMyNotes");

    if (myNotesLink) {
      myNotesLink.classList.toggle(
        "disabled",
        !enabled
      );
      myNotesLink.setAttribute(
        "aria-disabled",
        enabled ? "false" : "true"
      );
    }

    const studyDeskBtn =
      document.getElementById(
        "landing-study-desk-action"
      );

    if (studyDeskBtn) {
      studyDeskBtn.disabled = !enabled;

      if (enabled) {
        studyDeskBtn.removeAttribute("title");
      } else {
        studyDeskBtn.setAttribute(
          "title",
          "Log in to access your Study Desk"
        );
      }
    }

    const studyDeskLink =
      document.getElementById("openStudyDesk");

    if (studyDeskLink) {
      studyDeskLink.classList.toggle(
        "disabled",
        !enabled
      );
      studyDeskLink.setAttribute(
        "aria-disabled",
        enabled ? "false" : "true"
      );
    }
  }

  function setLoginControl({
    visible,
    enabled,
    title = ""
  }) {
    if (!loginButton) return;

    loginButton.style.display =
      visible ? "" : "none";
    loginButton.disabled = !enabled;
    loginButton.title = title;
  }

  function setLogoutControl({
    visible,
    enabled,
    title = ""
  }) {
    if (!logoutButton) return;

    logoutButton.style.display =
      visible ? "" : "none";
    logoutButton.disabled = !enabled;
    logoutButton.title = title;
  }

  function renderAuthState(
    state,
    clerkUser = null,
    { dispatch = true } = {}
  ) {
    currentAuthState = state;

    document.documentElement.dataset.authState =
      state;

    if (signupButton) {
      signupButton.style.display = "none";
    }

    let signedIn = false;
    let offline = false;
    let logoutPending = false;

    switch (state) {
      case AUTH_STATE.CHECKING:
        setLoginControl({
          visible: false,
          enabled: false
        });
        setLogoutControl({
          visible: false,
          enabled: false
        });
        setPrivateNavigationEnabled(false);

        if (
          typeof lockEditorTools === "function"
        ) {
          lockEditorTools();
        }
        break;

      case AUTH_STATE.SIGNED_IN_ONLINE:
        signedIn = true;

        setLoginControl({
          visible: false,
          enabled: false
        });
        setLogoutControl({
          visible: true,
          enabled: true
        });
        setPrivateNavigationEnabled(true);

        if (
          typeof unlockEditorTools ===
          "function"
        ) {
          unlockEditorTools();
        }
        break;

      case AUTH_STATE.SIGNED_IN_OFFLINE:
        signedIn = true;
        offline = true;

        setLoginControl({
          visible: false,
          enabled: false
        });
        setLogoutControl({
          visible: true,
          enabled: true,
          title:
            "Logout will be completed when the connection returns"
        });
        setPrivateNavigationEnabled(true);

        if (
          typeof unlockEditorTools ===
          "function"
        ) {
          unlockEditorTools();
        }
        break;

      case AUTH_STATE.SIGNED_OUT_ONLINE:
        setLoginControl({
          visible: true,
          enabled: true
        });
        setLogoutControl({
          visible: false,
          enabled: false
        });
        setPrivateNavigationEnabled(false);

        if (
          typeof lockEditorTools === "function"
        ) {
          lockEditorTools();
        }
        break;

      case AUTH_STATE.SIGNED_OUT_OFFLINE:
        offline = true;

        setLoginControl({
          visible: true,
          enabled: false,
          title:
            "An internet connection is required to log in"
        });
        setLogoutControl({
          visible: false,
          enabled: false
        });
        setPrivateNavigationEnabled(false);

        if (
          typeof lockEditorTools === "function"
        ) {
          lockEditorTools();
        }
        break;

      case AUTH_STATE.LOGOUT_PENDING:
        offline = !authConnectionIsOnline();
        logoutPending = true;

        setLoginControl({
          visible: true,
          enabled: false,
          title: offline
            ? "Logout will finish when the connection returns"
            : "Finishing logout..."
        });
        setLogoutControl({
          visible: false,
          enabled: false
        });
        setPrivateNavigationEnabled(false);
        clearPrivateAuthenticatedUI();
        break;

      default:
        console.warn(
          "Unknown authentication UI state:",
          state
        );

        renderAuthState(
          AUTH_STATE.CHECKING,
          null,
          { dispatch }
        );
        return;
    }

    if (!dispatch) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent(
        "auth-state-changed",
        {
          detail: {
            state,
            signedIn,
            offline,
            logoutPending,
            userId: signedIn
              ? String(clerkUser?.id || "")
              : ""
          }
        }
      )
    );
  }

  async function probeServerAuthentication() {
    if (!authConnectionIsOnline()) {
      return {
        resolved: false,
        user: null
      };
    }

    if (serverAuthProbePromise) {
      return serverAuthProbePromise;
    }

    serverAuthProbePromise = (async () => {
      try {
        const statusResponse = await fetch(
          "/api/auth-status",
          {
            method: "GET",
            credentials: "include",
            cache: "no-store"
          }
        );

        if (!statusResponse.ok) {
          return {
            resolved: false,
            user: null
          };
        }

        const status =
          await statusResponse.json();

        if (status?.signedIn !== true) {
          return {
            resolved: true,
            user: null
          };
        }

        const meResponse = await fetch(
          "/api/me",
          {
            method: "GET",
            credentials: "include",
            cache: "no-store"
          }
        );

        if (!meResponse.ok) {
          return {
            resolved: false,
            user: null
          };
        }

        const me = await meResponse.json();
        const userId =
          String(me?.user?.id || "");

        if (!userId) {
          return {
            resolved: false,
            user: null
          };
        }

        return {
          resolved: true,
          user: { id: userId }
        };
      } catch (error) {
        console.warn(
          "Could not confirm authentication with the server:",
          error
        );

        return {
          resolved: false,
          user: null
        };
      }
    })();

    try {
      return await serverAuthProbePromise;
    } finally {
      serverAuthProbePromise = null;
    }
  }

  async function refreshAuthState(
    clerkUser = lastKnownClerkUser
  ) {
    if (clerkUser) {
      lastKnownClerkUser = clerkUser;
    }

    const pendingLogoutUserId =
      await window.UserData
        ?.getPendingRemoteLogoutUserId?.();

    if (pendingLogoutUserId) {
      renderAuthState(
        AUTH_STATE.LOGOUT_PENDING,
        null
      );

      if (authConnectionIsOnline()) {
        await completePendingRemoteLogout();
      }

      return;
    }

    if (clerkUser) {
      renderAuthState(
        resolveAuthState(clerkUser),
        clerkUser
      );
      return;
    }

    if (authConnectionIsOnline()) {
      /*
       * Clerk can briefly report no user while restoring an existing browser
       * session. Confirm the server session before publishing a real signed-out
       * state so pages do not flash logged-out content for an authenticated user.
       */
      renderAuthState(
        AUTH_STATE.CHECKING,
        null
      );

      const serverAuth =
        await probeServerAuthentication();

      if (!serverAuth.resolved) {
        return;
      }

      if (serverAuth.user) {
        lastKnownClerkUser =
          serverAuth.user;

        try {
          await window.UserData
            ?.rememberVerifiedAuthenticatedUser?.(
              serverAuth.user.id
            );
        } catch (error) {
          console.warn(
            "Could not record server-verified user identity locally:",
            error
          );
        }

        renderAuthState(
          AUTH_STATE.SIGNED_IN_ONLINE,
          serverAuth.user
        );
        return;
      }

      lastKnownClerkUser = null;

      renderAuthState(
        AUTH_STATE.SIGNED_OUT_ONLINE,
        null
      );
      return;
    }

    const trustedOfflineProfile =
      await getTrustedOfflineProfile();

    if (trustedOfflineProfile) {
      renderAuthState(
        AUTH_STATE.SIGNED_IN_OFFLINE,
        {
          id: trustedOfflineProfile.userId
        }
      );
      return;
    }

    renderAuthState(
      AUTH_STATE.SIGNED_OUT_OFFLINE,
      null
    );
  }

  window.updateAuthUI = function (clerkUser) {
    refreshAuthState(
      clerkUser || null
    ).catch((error) => {
      console.warn(
        "Could not refresh authentication UI:",
        error
      );
    });
  };

  window.getCurrentAuthUIState =
    function () {
      return currentAuthState;
    };

  renderAuthState(
    AUTH_STATE.CHECKING,
    null,
    { dispatch: false }
  );

  // ==========================================
  // CLERK ACTION HELPERS
  // ==========================================
  function getClerkObject() {
    return window.Clerk || window.clerk || null;
  }

  async function userHasPendingLogout(userId) {
    if (
      !userId ||
      !window.UserData?.hasPendingRemoteLogout
    ) {
      return false;
    }

    try {
      return await window.UserData.hasPendingRemoteLogout(
        String(userId)
      );
    } catch (error) {
      console.warn(
        "Could not check pending logout state:",
        error
      );
      return false;
    }
  }

  async function getTrustedOfflineProfile() {
    if (authConnectionIsOnline()) {
      return null;
    }

    if (!window.UserData) {
      return null;
    }

    try {
      const pendingLogoutUserId =
        await window.UserData
          .getPendingRemoteLogoutUserId?.();

      if (pendingLogoutUserId) {
        return null;
      }

      const userId =
        await window.UserData
          .getLastVerifiedUserId?.();

      if (!userId) {
        return null;
      }

      const profile =
        await window.UserData
          .getStoredProfile?.(userId);

      if (
        !profile?.lastVerifiedAt ||
        profile.pendingRemoteLogout === true
      ) {
        return null;
      }

      return profile;
    } catch (error) {
      console.warn(
        "Could not resolve trusted offline user:",
        error
      );
      return null;
    }
  }

  function clearPrivateAuthenticatedUI() {
    if (
      typeof window.clearPrivateEditorStateForLogout ===
      "function"
    ) {
      window.clearPrivateEditorStateForLogout();
      return;
    }

    if (typeof lockEditorTools === "function") {
      lockEditorTools();
    }
  }

  async function completePendingRemoteLogout() {
    const pendingUserId =
      await window.UserData
        ?.getPendingRemoteLogoutUserId?.();

    if (!pendingUserId) {
      return false;
    }

    renderAuthState(
      AUTH_STATE.LOGOUT_PENDING,
      null
    );

    if (!authConnectionIsOnline()) {
      return true;
    }

    const clerkObj = getClerkObject();

    try {
      if (!clerkObj) {
        return true;
      }

      if (clerkObj.user) {
        if (typeof clerkObj.signOut !== "function") {
          return true;
        }

        await clerkObj.signOut();
      }

      await window.UserData
        ?.clearPendingRemoteLogout?.(
          pendingUserId
        );

      lastKnownClerkUser = null;

      renderAuthState(
        resolveAuthState(null),
        null
      );

      return true;
    } catch (error) {
      console.warn(
        "Remote logout is still pending:",
        error
      );

      renderAuthState(
        AUTH_STATE.LOGOUT_PENDING,
        null
      );

      return true;
    }
  }

  window.applyClerkAuthState =
    async function (clerkUser) {
      lastKnownClerkUser =
        clerkUser || null;

      await refreshAuthState(
        clerkUser || null
      );
    };

  function refreshAuthStateForConnectivity() {
    refreshAuthState(
      getClerkObject()?.user ||
      lastKnownClerkUser ||
      null
    ).catch((error) => {
      console.warn(
        "Could not refresh authentication state after connectivity changed:",
        error
      );
    });
  }

  window.addEventListener(
    "online",
    refreshAuthStateForConnectivity
  );

  window.addEventListener(
    "offline",
    refreshAuthStateForConnectivity
  );

  window.addEventListener(
    "app-connectivity-changed",
    refreshAuthStateForConnectivity
  );

  async function openLogin() {
  console.log("Login button clicked");

  const clerkObj = getClerkObject();

  if (!clerkObj) {
    alert("Clerk is still loading. Please try again in a moment.");
    return;
  }

  if (typeof clerkObj.openSignIn === "function") {
    clerkObj.openSignIn({
      forceRedirectUrl: window.location.href,
      signUpForceRedirectUrl: window.location.href,
      oauthFlow: "popup"
    });
    return;
  }

  window.location.href = "sign-in.html?redirect=" + encodeURIComponent(window.location.href);
}

async function openSignup() {
  console.log("Signup button clicked");

  const clerkObj = getClerkObject();

  if (!clerkObj) {
    alert("Clerk is still loading. Please try again in a moment.");
    return;
  }

  if (typeof clerkObj.openSignUp === "function") {
    clerkObj.openSignUp({
      forceRedirectUrl: window.location.href,
      signInForceRedirectUrl: window.location.href,
      oauthFlow: "popup"
    });
    return;
  }

  window.location.href = "sign-up.html?redirect=" + encodeURIComponent(window.location.href);
}

  // ==========================================
  // BACKEND FETCH UTILITIES
  // ==========================================
  async function getJson(url) {
    const requestUrl = new URL(url, window.location.origin);
    requestUrl.searchParams.set("_", Date.now().toString());
  
    const response = await fetch(requestUrl.toString(), {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });
  
    const result = await response.json();
  
    if (!response.ok) {
      throw new Error(result.message || "Request failed");
    }
  
    return result;
  }

  async function postJson(url, data = {}) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Request failed");
    }

    return result;
  }

  window.authPostJson = postJson;
  window.authGetJson = getJson;

  // ==========================================
  // INACTIVITY LOGIC - DISABLED
  // ==========================================
  // The previous 30-minute inactivity timer has been disabled.
  // Users now stay logged in until they manually log out or Clerk ends the session.
  //
  // Disabled timer features from the old version:
  // - lastActivityTime
  // - inactivityInterval
  // - inactivityPromptOpen
  // - INACTIVITY_LIMIT
  // - startInactivityWatcher()
  // - stopInactivityWatcher()
  // - checkInactivityNow()
  // - markActivityAndResetTimer()
  // - showInactivityPrompt()
  // - logoutFromInactivity()
  // - visibility/focus/pageshow/activity listeners for inactivity tracking

  // ==========================================
  // NOTES MANAGEMENT & RENDERING LOGIC
  // ==========================================
  let allMyNotes = [];
  let reloadPageAfterMyNotesClose = false;

  function getCurrentBiblePageKeyForMyNotes() {
    const urlParams = new URLSearchParams(window.location.search);

    const bibleVersionID =
      urlParams.get("version") ||
      urlParams.get("bible") ||
      urlParams.get("bibleId") ||
      "";

    const bibleChapterID =
      urlParams.get("chapter") ||
      urlParams.get("chapterId") ||
      "";

    if (!bibleVersionID || !bibleChapterID) {
      return "";
    }

    return `${bibleVersionID}::${bibleChapterID}`;
  }

  function closeMyNotesModalAndRefreshIfNeeded() {
    toggleModal(myNotesModal, false);

    if (reloadPageAfterMyNotesClose) {
      reloadPageAfterMyNotesClose = false;
      window.location.reload();
    }
  }

  function formatSavedContent(note) {
    const parts = [];

    if (note.hasQuillNotes) {
      parts.push("Notes");
    }

    if (note.hasHighlights) {
      parts.push("Highlights");
    }

    if (note.hasDrawings) {
      parts.push("Drawings");
    }

    if (note.hasTextFormats) {
      parts.push("Text formatting");
    }

    return parts.length ? parts.join(" + ") : "Saved page";
  }

  function formatDate(value) {
    if (!value) return "";

    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function filterMyNotes(searchText) {
    const searchValue = (searchText || "").toLowerCase().trim();

    if (!searchValue) {
      renderMyNotes(allMyNotes);
      return;
    }

    const filteredNotes = allMyNotes.filter((note) => {
      const searchableText = [
        note.bibleName,
        note.bibleVersionID,
        note.bookChapterLabel,
        note.bibleChapterID,
        note.preview,
        formatSavedContent(note)
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(searchValue);
    });

    renderMyNotes(filteredNotes);
    }
  
    function getNoteBibleLabel(note) {
      if (note.bibleName) {
        return note.bibleName;
      }
    
      if (note.pageUrl) {
        try {
          const savedUrl = new URL(
            note.pageUrl,
            window.location.origin
          );
    
          const savedParams =
            savedUrl.searchParams;
    
          const abbreviation =
            savedParams.get("bibleAbbr") ||
            savedParams.get("abbr") ||
            "";
    
          if (abbreviation) {
            return abbreviation;
          }
        } catch (error) {
          console.warn(
            "Could not read saved note URL:",
            note.pageUrl,
            error
          );
        }
      }
    
      return note.bibleVersionID || "";
    }
  
  function renderMyNotes(notes) {
    const tableBody = document.getElementById("myNotesTableBody");
    const status = document.getElementById("myNotesStatus");

    if (!tableBody || !status) return;

    tableBody.innerHTML = "";

    if (!notes.length) {
      status.textContent = allMyNotes.length ? "No matching notes found." : "No saved notes yet.";
      return;
    }

    status.textContent = `${notes.length} saved page${notes.length === 1 ? "" : "s"}`;

    notes.forEach((note) => {
      const row = document.createElement("tr");
      const preview = note.preview ? note.preview.slice(0, 120) : "";

      row.innerHTML = `
        <td>${getNoteBibleLabel(note)}</td>
        <td>${note.bookChapterLabel || note.bibleChapterID || ""}</td>
        <td>${formatSavedContent(note)}</td>
        <td>${preview}</td>
        <td>${formatDate(note.updatedAt)}</td>
        <td>${note.pageUrl ? `<a href="${note.pageUrl}" class="open-note">🚪</a>` : ""}</td>
        <td><a href="#" class="delete-note" data-id="${note.pageKey}" title="Delete Note">🗑</a></td>
      `;

      tableBody.appendChild(row);
    });
  }

  async function deleteNote(id) {
    if (!id) return;

    if (!confirm("Are you sure you want to delete this? This action cannot be undone.")) {
      return;
    }

    try {
      const note = allMyNotes.find((item) => String(item.pageKey) === String(id));
      const params = new URLSearchParams();

      if (Number.isInteger(Number(note?.quillVersion)) && Number(note.quillVersion) >= 1) {
        params.set("quillVersion", String(Number(note.quillVersion)));
      }

      if (Number.isInteger(Number(note?.miniEditorVersion)) && Number(note.miniEditorVersion) >= 1) {
        params.set("miniEditorVersion", String(Number(note.miniEditorVersion)));
      }

      const query = params.toString();
      const response = await fetch(
        `/api/my-notes/${encodeURIComponent(id)}${query ? `?${query}` : ""}`,
        {
          method: "DELETE",
          credentials: "include"
        }
      );

      const result = await response.json();

      if (response.ok) {
        const currentPageKey = getCurrentBiblePageKeyForMyNotes();

        if (currentPageKey && currentPageKey === id) {
          reloadPageAfterMyNotesClose = true;
        }

        await loadMyNotes();
      } else if (response.status === 409) {
        if (window.AppConflictDialog?.show) {
          window.AppConflictDialog.show({
            key: `my-notes-delete:${id}:${result?.latestQuillNote?.version || result?.latestMiniEditorPage?.version || "newer"}`,
            title: "Newer My Notes version available",
            message: "This note changed on another device before it could be deleted.",
            detail: "The delete was blocked so the newer saved version was not lost.",
            secondaryLabel: null,
            primaryLabel: "Reload notes",
            onPrimary: () => loadMyNotes()
          });
        } else {
          alert(
            "This note changed on another device before it could be deleted. " +
            "The latest saved version will now be reloaded."
          );
          await loadMyNotes();
        }
      } else {
        alert("Error: " + (result.message || "Could not delete note."));
      }
    } catch (error) {
      alert("Delete failed: " + error.message);
    }
  }

  async function loadMyNotes() {
    const status = document.getElementById("myNotesStatus");
    const tableBody = document.getElementById("myNotesTableBody");

    if (status) {
      status.textContent = "Loading...";
    }

    if (tableBody) {
      tableBody.innerHTML = "";
    }

    try {
      const result = await getJson("/api/my-notes");

      if (!result.ok) {
        throw new Error(result.message || "Failed to load my notes");
      }

      allMyNotes = result.notes || [];
      renderMyNotes(allMyNotes);

      const searchInput = document.getElementById("myNotesSearch");

      if (searchInput) {
        searchInput.value = "";
        searchInput.oninput = function () {
          filterMyNotes(this.value);
        };
      }
    } catch (error) {
      if (status) {
        status.textContent = error.message || "Failed to load my notes.";
      }
    }
  }

  // ==========================================
  // GLOBAL CLICK CAPTURE
  // ==========================================
  document.addEventListener("click", (event) => {
    const loginTarget = event.target.closest("#login, [data-open-login]");
    const signupTarget = event.target.closest("#signup");
    const myNotesTarget = event.target.closest("#openMyNotes");
    const deleteNoteTarget = event.target.closest(".delete-note");
    const closeMyNotesTarget = event.target.closest("#closeMyNotes");

    if (loginTarget) {
      event.preventDefault();
      event.stopPropagation();
      openLogin();
      return;
    }

    if (signupTarget) {
      event.preventDefault();
      event.stopPropagation();
      openSignup();
      return;
    }

    if (deleteNoteTarget) {
      event.preventDefault();
      event.stopPropagation();

      const noteId = deleteNoteTarget.getAttribute("data-id");
      deleteNote(noteId);

      return;
    }

    const studyDeskTarget = event.target.closest("#openStudyDesk");

    if (studyDeskTarget) {
      if (studyDeskTarget.classList.contains("disabled")) {
        event.preventDefault();
        event.stopPropagation();

        if (typeof closeNav === "function") {
          closeNav();
        }

        openLogin();
        return;
      }
    }

    if (myNotesTarget) {
      event.preventDefault();
      event.stopPropagation();

      if (myNotesTarget.classList.contains("disabled")) {
        if (typeof closeNav === "function") {
          closeNav();
        }

        openLogin();
        return;
      }

      if (typeof closeNav === "function") {
        closeNav();
      }

      reloadPageAfterMyNotesClose = false;
      toggleModal(myNotesModal, true);
      loadMyNotes();

      return;
    }

    if (closeMyNotesTarget) {
      event.preventDefault();
      event.stopPropagation();

      closeMyNotesModalAndRefreshIfNeeded();

      return;
    }

    if (myNotesModal && event.target === myNotesModal) {
      event.preventDefault();
      event.stopPropagation();

      closeMyNotesModalAndRefreshIfNeeded();
    }
  });

  // Fallback direct listener for the signup button only
  if (signupButton) {
    signupButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      openSignup();
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const clerkObj = getClerkObject();
      const userId = String(
        clerkObj?.user?.id || ""
      );

      try {
        if (
          userId &&
          window.UserData?.markLogoutPending
        ) {
          await window.UserData.markLogoutPending(
            userId
          );
        }

        lastKnownClerkUser = null;

        renderAuthState(
          AUTH_STATE.LOGOUT_PENDING,
          null
        );

        if (!authConnectionIsOnline()) {
          return;
        }

        if (
          clerkObj &&
          typeof clerkObj.signOut === "function"
        ) {
          await clerkObj.signOut();
        }

        await window.UserData
          ?.clearPendingRemoteLogout?.(
            userId
          );

        renderAuthState(
          resolveAuthState(null),
          null
        );

        window.location.reload();
      } catch (error) {
        console.warn(
          "Logout could not be completed remotely:",
          error
        );

        renderAuthState(
          AUTH_STATE.LOGOUT_PENDING,
          null
        );
      }
    });
  }
});

// =========================================================================
//  CLERK LOADER WITH UI COMPONENTS
// =========================================================================
const CLERK_PUBLISHABLE_KEY = "pk_test_c3RpcnJlZC1wb255LTE0LmNsZXJrLmFjY291bnRzLmRldiQ";

function getClerkFrontendDomainFromKey(publishableKey) {
  return atob(publishableKey.split("_")[2]).slice(0, -1);
}

function loadScriptOnce(id, src, attributes = {}) {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id);

    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;

    Object.entries(attributes).forEach(([key, value]) => {
      script.setAttribute(key, value);
    });

    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));

    document.head.appendChild(script);
  });
}

window.addEventListener("load", async () => {
  console.log("Window fully loaded. Loading Clerk with UI...");

  try {
    const clerkDomain = getClerkFrontendDomainFromKey(CLERK_PUBLISHABLE_KEY);

    await loadScriptOnce(
      "clerk-ui-script",
      `https://${clerkDomain}/npm/@clerk/ui@1/dist/ui.browser.js`,
      {
        crossorigin: "anonymous"
      }
    );

    await loadScriptOnce(
      "clerk-browser-script",
      "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js",
      {
        "data-clerk-publishable-key": CLERK_PUBLISHABLE_KEY
      }
    );

    const clerkObj = window.Clerk || window.clerk;

    if (!clerkObj) {
      console.error("Clerk object was not found on the window.");
      window.AppShell?.markDegraded?.("auth");
      return;
    }

    await clerkObj.load({
      ui: {
        ClerkUI: window.__internal_ClerkUICtor
      }
    });

    window.AppShell?.clearDegraded?.("auth");

    console.log("Clerk loaded with UI components.");
    console.log("Clerk user:", clerkObj.user);
    console.log("Clerk session:", clerkObj.session);

    clerkObj.addListener(({ user }) => {
      console.log("Clerk auth state changed. User:", user);

      if (
        typeof window.applyClerkAuthState ===
        "function"
      ) {
        window.applyClerkAuthState(
          user || null
        );
      } else if (
        typeof window.updateAuthUI ===
        "function"
      ) {
        window.updateAuthUI(
          user || null
        );
      }
    });

    if (
      typeof window.applyClerkAuthState ===
      "function"
    ) {
      await window.applyClerkAuthState(
        clerkObj.user || null
      );
    } else if (
      typeof window.updateAuthUI ===
      "function"
    ) {
      window.updateAuthUI(
        clerkObj.user || null
      );
    }
  } catch (error) {
    window.AppShell?.markDegraded?.("auth");
    console.error("Failed to initialize Clerk:", error);

    if (
      typeof window.updateAuthUI ===
      "function"
    ) {
      window.updateAuthUI(null);
    }
  }
});
