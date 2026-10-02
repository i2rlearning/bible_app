"use strict";

/*
 * Authentication Controller
 *
 * Owns Clerk session behavior, explicit login/logout actions, trusted offline
 * access, pending remote logout completion, and authentication events.
 *
 * This file does NOT decide which Login/Logout button is visible, enabled, or
 * styled. All authentication-control presentation belongs to js/auth-ui.js.
 */

document.addEventListener("DOMContentLoaded", () => {
  const signupButton = document.getElementById("signup");
  const logoutButton = document.getElementById("logout");
  const myNotesModal = document.getElementById("myNotesModal");

  const EXPLICIT_LOGGED_OUT_KEY = "BibleAppExplicitLoggedOut";
  const PENDING_REMOTE_LOGOUT_KEY = "BibleAppPendingRemoteLogoutUserId";

  const CLERK_PUBLISHABLE_KEY =
    "pk_test_c3RpcnJlZC1wb255LTE0LmNsZXJrLmFjY291bnRzLmRldiQ";

  let clerkRuntimePromise = null;
  let clerkListenerAttached = false;
  let pendingRemoteLogoutPromise = null;

  function readLocalMarker(key) {
    try {
      return window.localStorage.getItem(key) || "";
    } catch (_error) {
      return "";
    }
  }

  function writeLocalMarker(key, value) {
    try {
      if (value) {
        window.localStorage.setItem(key, String(value));
      } else {
        window.localStorage.removeItem(key);
      }
    } catch (_error) {
      // UserOfflineDB remains the durable private-data authority.
    }
  }

  function getPendingRemoteLogoutUserId() {
    return readLocalMarker(PENDING_REMOTE_LOGOUT_KEY);
  }

  function hasExplicitLoggedOutState() {
    return (
      readLocalMarker(EXPLICIT_LOGGED_OUT_KEY) === "1" ||
      Boolean(getPendingRemoteLogoutUserId())
    );
  }

  function getConnectionState() {
    const state = window.AppShell?.getState?.() || {};

    return {
      ...state,
      connectionIssue:
        navigator.onLine === false ||
        state.connectionIssue === true ||
        state.appReachable === false
    };
  }

  function connectionCanReachAuth() {
    const state = getConnectionState();

    return (
      navigator.onLine !== false &&
      state.connectionIssue !== true &&
      state.appReachable !== false
    );
  }

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

  function applyProtectedFeatureAccess(authState) {
    const fullyAuthenticated = authState === "signed-in";
    const offlineTrusted = authState === "offline-trusted";

    const myNotesLink = document.getElementById("openMyNotes");
    if (myNotesLink) {
      myNotesLink.classList.toggle("disabled", !fullyAuthenticated);
      myNotesLink.setAttribute(
        "aria-disabled",
        fullyAuthenticated ? "false" : "true"
      );

      if (fullyAuthenticated) {
        myNotesLink.removeAttribute("title");
      } else if (offlineTrusted) {
        myNotesLink.setAttribute(
          "title",
          "The My Notes list will be available offline in a later update."
        );
      } else {
        myNotesLink.removeAttribute("title");
      }
    }

    const studyDeskButton = document.getElementById(
      "landing-study-desk-action"
    );

    if (studyDeskButton) {
      studyDeskButton.disabled = !fullyAuthenticated;

      if (fullyAuthenticated) {
        studyDeskButton.removeAttribute("title");
      } else if (offlineTrusted) {
        studyDeskButton.setAttribute(
          "title",
          "Study Desk offline editing is not enabled yet."
        );
      } else if (authState === "signed-out") {
        studyDeskButton.setAttribute(
          "title",
          "Log in to access your Study Desk"
        );
      } else {
        studyDeskButton.removeAttribute("title");
      }
    }

    const studyDeskLink = document.getElementById("openStudyDesk");
    if (studyDeskLink) {
      studyDeskLink.classList.toggle("disabled", !fullyAuthenticated);
      studyDeskLink.setAttribute(
        "aria-disabled",
        fullyAuthenticated ? "false" : "true"
      );
    }
  }

  function publishAuthState(authState, options = {}) {
    const userId = options.userId || "";
    const offlineTrusted = authState === "offline-trusted";
    const signedIn =
      authState === "signed-in" ||
      authState === "offline-trusted";

    document.documentElement.dataset.authState = authState;
    window.AuthUI?.setAuthState?.(authState);
    applyProtectedFeatureAccess(authState);

    if (authState === "checking") {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("auth-state-changed", {
        detail: {
          authState,
          signedIn,
          offlineTrusted,
          userId: signedIn ? userId : ""
        }
      })
    );
  }

  function setAuthCheckingState() {
    publishAuthState("checking");
  }

  function setLoggedOutState() {
    publishAuthState("signed-out");
  }

  function setLoggedInState(user) {
    publishAuthState("signed-in", {
      userId: user?.id || ""
    });
  }

  function setOfflineTrustedState(profile) {
    publishAuthState("offline-trusted", {
      userId: profile?.userId || ""
    });
  }

  window.setOfflineTrustedAuthUI = setOfflineTrustedState;
  window.setLoggedOutAuthUI = setLoggedOutState;

  if (hasExplicitLoggedOutState()) {
    setLoggedOutState();
  } else {
    setAuthCheckingState();
  }

  function getClerkObject() {
    return window.Clerk || window.clerk || null;
  }

  function getClerkFrontendDomainFromKey(publishableKey) {
    return atob(publishableKey.split("_")[2]).slice(0, -1);
  }

  function loadScriptOnce(id, src, attributes = {}, readyCheck = null) {
    return new Promise((resolve, reject) => {
      if (typeof readyCheck === "function" && readyCheck()) {
        resolve();
        return;
      }

      const existing = document.getElementById(id);
      if (existing) {
        existing.remove();
      }

      const script = document.createElement("script");
      script.id = id;
      script.src = src;
      script.async = true;

      Object.entries(attributes).forEach(([key, value]) => {
        script.setAttribute(key, value);
      });

      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        reject(new Error(`Failed to load script: ${src}`));
      };

      document.head.appendChild(script);
    });
  }

  async function loadClerkRuntime() {
    const existing = getClerkObject();
    if (existing?.loaded) {
      attachClerkListener(existing);
      return existing;
    }

    if (clerkRuntimePromise) {
      return clerkRuntimePromise;
    }

    clerkRuntimePromise = (async () => {
      const clerkDomain = getClerkFrontendDomainFromKey(
        CLERK_PUBLISHABLE_KEY
      );

      await loadScriptOnce(
        "clerk-ui-script",
        `https://${clerkDomain}/npm/@clerk/ui@1/dist/ui.browser.js`,
        { crossorigin: "anonymous" },
        () => Boolean(window.__internal_ClerkUICtor)
      );

      await loadScriptOnce(
        "clerk-browser-script",
        "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js",
        {
          "data-clerk-publishable-key": CLERK_PUBLISHABLE_KEY
        },
        () => Boolean(getClerkObject())
      );

      const clerkObj = getClerkObject();

      if (!clerkObj) {
        throw new Error("Clerk object was not found on the window.");
      }

      if (!clerkObj.loaded) {
        await clerkObj.load({
          ui: {
            ClerkUI: window.__internal_ClerkUICtor
          }
        });
      }

      attachClerkListener(clerkObj);
      return clerkObj;
    })();

    try {
      return await clerkRuntimePromise;
    } catch (error) {
      clerkRuntimePromise = null;
      throw error;
    }
  }

  function attachClerkListener(clerkObj) {
    if (clerkListenerAttached || !clerkObj?.addListener) return;

    clerkListenerAttached = true;

    clerkObj.addListener(({ user }) => {
      if (getPendingRemoteLogoutUserId()) {
        setLoggedOutState();

        if (connectionCanReachAuth()) {
          completePendingRemoteLogout(clerkObj).catch((error) => {
            console.warn("Remote logout is still pending:", error);
          });
        }

        return;
      }

      Promise.resolve(
        window.updateAuthUI?.(user || null)
      ).catch((error) => {
        console.warn(
          "Could not apply the updated authentication state:",
          error
        );
      });
    });
  }

  async function completePendingRemoteLogout(clerkObject = null) {
    const pendingUserId = getPendingRemoteLogoutUserId();

    if (!pendingUserId) {
      return true;
    }

    setLoggedOutState();

    if (pendingRemoteLogoutPromise) {
      return pendingRemoteLogoutPromise;
    }

    pendingRemoteLogoutPromise = (async () => {
      try {
        const clerkObj = clerkObject || (await loadClerkRuntime());

        if (clerkObj.user || clerkObj.session) {
          if (typeof clerkObj.signOut !== "function") {
            return false;
          }

          await clerkObj.signOut();
        }

        const startedAt = Date.now();
        while (
          (clerkObj.user || clerkObj.session) &&
          Date.now() - startedAt < 3000
        ) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, 50);
          });
        }

        if (clerkObj.user || clerkObj.session) {
          return false;
        }

        await window.UserData?.clearPendingRemoteLogout?.(
          pendingUserId
        );

        writeLocalMarker(PENDING_REMOTE_LOGOUT_KEY, "");
        return true;
      } catch (error) {
        console.warn("Remote logout is still pending:", error);
        return false;
      } finally {
        pendingRemoteLogoutPromise = null;
      }
    })();

    return pendingRemoteLogoutPromise;
  }

  window.updateAuthUI = async function (clerkUser) {
    if (getPendingRemoteLogoutUserId()) {
      setLoggedOutState();
      return;
    }

    if (!clerkUser) {
      setLoggedOutState();
      return;
    }

    writeLocalMarker(EXPLICIT_LOGGED_OUT_KEY, "");

    try {
      const localProfile =
        await window.UserData?.rememberAuthenticatedUser?.(
          clerkUser.id
        );

      /*
       * A pending explicit logout always wins over a browser session that
       * has not yet been remotely terminated.
       */
      if (
        localProfile?.pendingRemoteLogout === true ||
        localProfile?.offlineAccessAllowed === false
      ) {
        setLoggedOutState();
        return;
      }
    } catch (error) {
      console.warn(
        "Could not prepare local user data for the authenticated session:",
        error
      );
    }

    /*
     * Publish signed-in only after UserData has had the opportunity to set
     * the active local user. Editor modules listen to this event and may
     * immediately load private notes and annotations.
     */
    setLoggedInState(clerkUser);
  };

  async function synchronizeAuthFromClerk() {
    const clerkObj = await loadClerkRuntime();

    let pendingUserId = getPendingRemoteLogoutUserId();

    if (
      !pendingUserId &&
      clerkObj.user?.id &&
      await window.UserData?.hasPendingRemoteLogout?.(
        clerkObj.user.id
      )
    ) {
      pendingUserId = clerkObj.user.id;
      writeLocalMarker(EXPLICIT_LOGGED_OUT_KEY, "1");
      writeLocalMarker(PENDING_REMOTE_LOGOUT_KEY, pendingUserId);
    }

    if (pendingUserId) {
      setLoggedOutState();

      const completed = await completePendingRemoteLogout(
        clerkObj
      );

      if (!completed) {
        window.AppShell?.markDegraded?.("auth");
        return;
      }

      window.AppShell?.clearDegraded?.("auth");
      return;
    }

    window.AppShell?.clearDegraded?.("auth");
    await window.updateAuthUI(clerkObj.user || null);
  }

  async function handleUnavailableAuth(error) {
    window.AppShell?.markDegraded?.("auth");
    console.warn("Authentication service is unavailable:", error);

    if (hasExplicitLoggedOutState()) {
      setLoggedOutState();
      return;
    }

    const connectivity = getConnectionState();

    if (connectivity.connectionIssue === true) {
      const trustedUser =
        await window.UserData?.getTrustedOfflineUser?.();

      if (trustedUser) {
        setOfflineTrustedState(trustedUser);
        return;
      }
    }

    setLoggedOutState();
  }

  async function openLogin() {
    if (window.AuthUI?.getState?.().connectionState === "offline") {
      return;
    }

    try {
      const clerkObj = await loadClerkRuntime();

      if (typeof clerkObj.openSignIn === "function") {
        clerkObj.openSignIn({
          forceRedirectUrl: window.location.href,
          signUpForceRedirectUrl: window.location.href,
          oauthFlow: "popup"
        });
        return;
      }
    } catch (error) {
      console.warn("Could not open Clerk login:", error);
    }

    window.location.href =
      "sign-in.html?redirect=" +
      encodeURIComponent(window.location.href);
  }

  async function openSignup() {
    if (window.AuthUI?.getState?.().connectionState === "offline") {
      return;
    }

    try {
      const clerkObj = await loadClerkRuntime();

      if (typeof clerkObj.openSignUp === "function") {
        clerkObj.openSignUp({
          forceRedirectUrl: window.location.href,
          signInForceRedirectUrl: window.location.href,
          oauthFlow: "popup"
        });
        return;
      }
    } catch (error) {
      console.warn("Could not open Clerk signup:", error);
    }

    window.location.href =
      "sign-up.html?redirect=" +
      encodeURIComponent(window.location.href);
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

      try {
        await window.EditorPersistence?.flushAll?.();
      } catch (error) {
        console.warn(
          "Could not flush pending editor changes before logout:",
          error
        );
      }

      let userId = "";
      try {
        userId =
          (await window.UserData?.getActiveUserId?.()) ||
          clerkObj?.user?.id ||
          "";
      } catch (_error) {
        userId = clerkObj?.user?.id || "";
      }

      writeLocalMarker(EXPLICIT_LOGGED_OUT_KEY, "1");

      if (userId) {
        writeLocalMarker(PENDING_REMOTE_LOGOUT_KEY, userId);
      }

      try {
        await window.UserData?.disableOfflineAccess?.({
          userId,
          pendingRemoteLogout: Boolean(userId)
        });
      } catch (error) {
        writeLocalMarker(EXPLICIT_LOGGED_OUT_KEY, "");
        writeLocalMarker(PENDING_REMOTE_LOGOUT_KEY, "");

        console.error("Could not lock local user data:", error);
        alert(
          "Logout could not safely lock your local data. Please try again."
        );
        return;
      }

      setLoggedOutState();

      if (userId && connectionCanReachAuth()) {
        await completePendingRemoteLogout(clerkObj);
      }

      /*
       * Rebuild the current page once so private editor content is removed
       * from the rendered document. The explicit logged-out marker is already
       * durable, so the rebuilt page remains logged out.
       */
      window.location.reload();
    });
  }

  window.addEventListener(
    "app-connectivity-changed",
    (event) => {
      const state = event.detail || {};

      if (
        getPendingRemoteLogoutUserId() &&
        state.browserOnline !== false &&
        state.appReachable === true &&
        state.connectionIssue !== true
      ) {
        synchronizeAuthFromClerk().catch((error) => {
          console.warn(
            "Could not complete pending remote logout:",
            error
          );
        });
      }
    }
  );

  window.addEventListener("load", () => {
    synchronizeAuthFromClerk().catch(handleUnavailableAuth);
  });
});
