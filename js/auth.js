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

  const EXPLICIT_LOGGED_OUT_KEY = "BibleAppExplicitLoggedOut";
  const PENDING_REMOTE_LOGOUT_KEY = "BibleAppPendingRemoteLogoutUserId";
  const PENDING_LOGOUT_RELOAD_KEY = "BibleAppPendingLogoutReconnectReload";

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
      // IndexedDB remains the authoritative fallback for private data state.
    }
  }

  function readSessionMarker(key) {
    try {
      return window.sessionStorage.getItem(key) || "";
    } catch (_error) {
      return "";
    }
  }

  function writeSessionMarker(key, value) {
    try {
      if (value) {
        window.sessionStorage.setItem(key, String(value));
      } else {
        window.sessionStorage.removeItem(key);
      }
    } catch (_error) {
      // Session marker only prevents an unnecessary reconnect reload loop.
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

  function updateLogoutConnectionAppearance(connectionState = null) {
    if (!logoutButton) return;

    const state =
      connectionState ||
      window.AppShell?.getState?.() ||
      {};

    const isOffline =
      navigator.onLine === false ||
      state.connectionIssue === true ||
      state.appReachable === false;

    logoutButton.dataset.connectionState = isOffline ? "offline" : "online";

    if (isOffline) {
      logoutButton.title =
        "Log out - you will remain logged out when you reconnect.";

      logoutButton.style.setProperty(
        "background-color",
        "#f3f4f6",
        "important"
      );
      logoutButton.style.setProperty(
        "background-image",
        "none",
        "important"
      );
      logoutButton.style.setProperty(
        "border-color",
        "#aeb7c4",
        "important"
      );
      logoutButton.style.setProperty(
        "color",
        "#344054",
        "important"
      );
      logoutButton.style.setProperty(
        "box-shadow",
        "none",
        "important"
      );

      const icon = logoutButton.querySelector("i");
      icon?.style.setProperty("color", "#344054", "important");
      return;
    }

    logoutButton.title = "";
    logoutButton.style.removeProperty("background-color");
    logoutButton.style.removeProperty("background-image");
    logoutButton.style.removeProperty("border-color");
    logoutButton.style.removeProperty("color");
    logoutButton.style.removeProperty("box-shadow");

    const icon = logoutButton.querySelector("i");
    icon?.style.removeProperty("color");
  }

  function updateLoginConnectionAppearance(connectionState = null) {
    if (!loginButton || loginButton.style.display === "none") return;

    const state =
      connectionState ||
      window.AppShell?.getState?.() ||
      {};

    const isOffline =
      navigator.onLine === false ||
      state.connectionIssue === true ||
      state.appReachable === false;

    loginButton.dataset.connectionState = isOffline ? "offline" : "online";
    loginButton.disabled = isOffline;

    if (isOffline) {
      loginButton.title =
        "Login requires an internet connection.";

      loginButton.style.setProperty(
        "background-color",
        "#f3f4f6",
        "important"
      );
      loginButton.style.setProperty(
        "background-image",
        "none",
        "important"
      );
      loginButton.style.setProperty(
        "border-color",
        "#aeb7c4",
        "important"
      );
      loginButton.style.setProperty(
        "color",
        "#667085",
        "important"
      );
      loginButton.style.setProperty(
        "box-shadow",
        "none",
        "important"
      );
      loginButton.style.setProperty(
        "cursor",
        "default",
        "important"
      );
      return;
    }

    loginButton.title = "";
    loginButton.disabled = false;
    loginButton.style.removeProperty("background-color");
    loginButton.style.removeProperty("background-image");
    loginButton.style.removeProperty("border-color");
    loginButton.style.removeProperty("color");
    loginButton.style.removeProperty("box-shadow");
    loginButton.style.removeProperty("cursor");
  }

  function setAuthCheckingUI() {
    document.documentElement.dataset.authState = "checking";

    if (loginButton) {
      loginButton.style.display = "none";
      loginButton.disabled = true;
      loginButton.title = "";
    }

    if (signupButton) {
      signupButton.style.display = "none";
    }

    if (logoutButton) {
      logoutButton.style.display = "none";
    }

    const myNotesLink = document.getElementById("openMyNotes");

    if (myNotesLink) {
      myNotesLink.classList.add("disabled");
      myNotesLink.setAttribute("aria-disabled", "true");
    }

    const studyDeskBtn = document.getElementById("landing-study-desk-action");

    if (studyDeskBtn) {
      studyDeskBtn.disabled = true;
      studyDeskBtn.removeAttribute("title");
    }

    const studyDeskLink = document.getElementById("openStudyDesk");

    if (studyDeskLink) {
      studyDeskLink.classList.add("disabled");
      studyDeskLink.setAttribute("aria-disabled", "true");
    }
  }

  function setLoggedInUI(user) {
    document.documentElement.dataset.authState = "signed-in";

    if (loginButton) {
      loginButton.style.display = "none";
      loginButton.disabled = true;
      //loginButton.title = user?.primaryEmailAddress?.emailAddress || "Logged in";
    }

    if (signupButton) {
      signupButton.style.display = "none";
    }

    if (logoutButton) {
      logoutButton.style.display = "";
      updateLogoutConnectionAppearance();
    }

    const myNotesLink = document.getElementById("openMyNotes");

    if (myNotesLink) {
      myNotesLink.classList.remove("disabled");
      myNotesLink.setAttribute("aria-disabled", "false");
    }

    const studyDeskBtn = document.getElementById("landing-study-desk-action");

    if (studyDeskBtn) {
      studyDeskBtn.disabled = false;
      studyDeskBtn.removeAttribute("title");
    }

    const studyDeskLink = document.getElementById("openStudyDesk");

    if (studyDeskLink) {
      studyDeskLink.classList.remove("disabled");
      studyDeskLink.setAttribute("aria-disabled", "false");
    }
  }

  function setLoggedOutUI() {
    document.documentElement.dataset.authState = "signed-out";

    if (loginButton) {
      loginButton.style.display = "";
      updateLoginConnectionAppearance();
    }

    if (signupButton) {
      signupButton.style.display = "none";
    }

    if (logoutButton) {
      logoutButton.style.display = "none";
      updateLogoutConnectionAppearance({
        connectionIssue: false,
        appReachable: true
      });
    }

    const myNotesLink = document.getElementById("openMyNotes");

    if (myNotesLink) {
      myNotesLink.classList.add("disabled");
      myNotesLink.setAttribute("aria-disabled", "true");
    }

    const studyDeskBtn = document.getElementById("landing-study-desk-action");

    if (studyDeskBtn) {
      studyDeskBtn.disabled = true;
      studyDeskBtn.setAttribute("title", "Log in to access your Study Desk");
    }

    const studyDeskLink = document.getElementById("openStudyDesk");

    if (studyDeskLink) {
      studyDeskLink.classList.add("disabled");
      studyDeskLink.setAttribute("aria-disabled", "true");
    }
  }

  function setOfflineTrustedUI(profile) {
    document.documentElement.dataset.authState = "offline-trusted";

    if (loginButton) {
      loginButton.style.display = "none";
      loginButton.disabled = true;
      loginButton.title = "";
    }

    if (signupButton) {
      signupButton.style.display = "none";
    }

    if (logoutButton) {
      logoutButton.style.display = "";
      updateLogoutConnectionAppearance();
    }

    const myNotesLink = document.getElementById("openMyNotes");
    if (myNotesLink) {
      myNotesLink.classList.add("disabled");
      myNotesLink.setAttribute("aria-disabled", "true");
      myNotesLink.setAttribute(
        "title",
        "The My Notes list will be available offline in a later update."
      );
    }

    const studyDeskBtn = document.getElementById("landing-study-desk-action");
    if (studyDeskBtn) {
      studyDeskBtn.disabled = true;
      studyDeskBtn.setAttribute(
        "title",
        "Study Desk offline editing is not enabled yet."
      );
    }

    const studyDeskLink = document.getElementById("openStudyDesk");
    if (studyDeskLink) {
      studyDeskLink.classList.add("disabled");
      studyDeskLink.setAttribute("aria-disabled", "true");
    }

    window.dispatchEvent(
      new CustomEvent("auth-state-changed", {
        detail: {
          signedIn: true,
          offlineTrusted: true,
          userId: profile?.userId || ""
        }
      })
    );
  }

  if (hasExplicitLoggedOutState()) {
    setLoggedOutUI();
  } else {
    setAuthCheckingUI();
  }

  if (typeof lockEditorTools === "function") {
    lockEditorTools();
  }

  window.setOfflineTrustedAuthUI = setOfflineTrustedUI;
  window.setLoggedOutAuthUI = setLoggedOutUI;

  let pendingRemoteLogoutPromise = null;

  async function completePendingRemoteLogout(options = {}) {
    const pendingUserId = getPendingRemoteLogoutUserId();

    if (!pendingUserId) {
      return true;
    }

    setLoggedOutUI();

    if (typeof lockEditorTools === "function") {
      lockEditorTools();
    }

    if (pendingRemoteLogoutPromise) {
      return pendingRemoteLogoutPromise;
    }

    pendingRemoteLogoutPromise = (async () => {
      const clerkObj = getClerkObject();

      if (!clerkObj) {
        if (options.allowReload === true) {
          const alreadyReloaded =
            readSessionMarker(PENDING_LOGOUT_RELOAD_KEY) === pendingUserId;

          if (!alreadyReloaded) {
            writeSessionMarker(
              PENDING_LOGOUT_RELOAD_KEY,
              pendingUserId
            );

            window.location.replace(
              window.location.href
            );
          }
        }

        return false;
      }

      try {
        if (clerkObj.user || clerkObj.session) {
          if (typeof clerkObj.signOut !== "function") {
            return false;
          }

          const timeoutPromise = new Promise((_, reject) => {
            window.setTimeout(
              () => reject(
                new Error("Remote logout timed out.")
              ),
              5000
            );
          });

          await Promise.race([
            clerkObj.signOut(),
            timeoutPromise
          ]);
        }

        const startedAt = Date.now();

        while (
          (clerkObj.user || clerkObj.session) &&
          Date.now() - startedAt < 2500
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
        writeSessionMarker(PENDING_LOGOUT_RELOAD_KEY, "");
        window.__pendingRemoteLogoutUserId = "";

        return true;
      } catch (error) {
        console.warn(
          "Remote logout is still pending:",
          error
        );
        return false;
      } finally {
        pendingRemoteLogoutPromise = null;
      }
    })();

    return pendingRemoteLogoutPromise;
  }

  window.addEventListener("app-connectivity-changed", (event) => {
    const state = event.detail || null;
    updateLogoutConnectionAppearance(state);
    updateLoginConnectionAppearance(state);

    if (
      getPendingRemoteLogoutUserId() &&
      state?.appReachable === true &&
      state?.connectionIssue !== true
    ) {
      completePendingRemoteLogout({
        allowReload: true
      });
    }
  });

  window.addEventListener("offline", () => {
    const offlineState = {
      connectionIssue: true,
      appReachable: false
    };

    updateLogoutConnectionAppearance(offlineState);
    updateLoginConnectionAppearance(offlineState);
  });

  window.addEventListener("online", () => {
    updateLogoutConnectionAppearance();
    updateLoginConnectionAppearance();

    if (getPendingRemoteLogoutUserId()) {
      setLoggedOutUI();

      if (typeof lockEditorTools === "function") {
        lockEditorTools();
      }
    }
  });

  // Expose this globally so the lazy-loaded Clerk script can call it later
  window.updateAuthUI = function (clerkUser) {
    const pendingLogoutUserId =
      getPendingRemoteLogoutUserId();

    if (pendingLogoutUserId) {
      window.__pendingRemoteLogoutUserId =
        pendingLogoutUserId;

      setLoggedOutUI();

      if (typeof lockEditorTools === "function") {
        lockEditorTools();
      }

      window.dispatchEvent(
        new CustomEvent("auth-state-changed", {
          detail: {
            signedIn: false,
            offlineTrusted: false,
            userId: ""
          }
        })
      );

      return;
    }

    if (clerkUser) {
      writeLocalMarker(EXPLICIT_LOGGED_OUT_KEY, "");

      setLoggedInUI(clerkUser);

      window.UserData?.rememberAuthenticatedUser?.(clerkUser.id).catch((error) => {
        console.warn("Could not remember the authenticated user locally:", error);
      });

      if (typeof unlockEditorTools === "function") {
        unlockEditorTools();
      }
    } else {
      setLoggedOutUI();

      if (typeof lockEditorTools === "function") {
        lockEditorTools();
      }
    }

    window.dispatchEvent(
      new CustomEvent("auth-state-changed", {
        detail: {
          signedIn: Boolean(clerkUser),
          offlineTrusted: false,
          userId: clerkUser?.id || ""
        }
      })
    );
  };

  // ==========================================
  // CLERK ACTION HELPERS
  // ==========================================
  function getClerkObject() {
    return window.Clerk || window.clerk || null;
  }

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

      let userId = "";
      try {
        userId =
          (await window.UserData?.getActiveUserId?.()) ||
          clerkObj?.user?.id ||
          "";
      } catch (error) {
        userId = clerkObj?.user?.id || "";
      }

      writeLocalMarker(EXPLICIT_LOGGED_OUT_KEY, "1");
      writeLocalMarker(
        PENDING_REMOTE_LOGOUT_KEY,
        userId
      );

      window.__pendingRemoteLogoutUserId =
        userId;

      try {
        await window.UserData?.disableOfflineAccess?.({
          userId,
          pendingRemoteLogout: true
        });
      } catch (error) {
        writeLocalMarker(EXPLICIT_LOGGED_OUT_KEY, "");
        writeLocalMarker(PENDING_REMOTE_LOGOUT_KEY, "");
        window.__pendingRemoteLogoutUserId = "";

        console.error("Could not lock local user data:", error);
        alert(
          "Logout could not safely lock your local data. Please try again."
        );
        return;
      }

      setLoggedOutUI();

      if (typeof lockEditorTools === "function") {
        lockEditorTools();
      }

      const logoutConnectivity =
        window.AppShell?.getState?.() || {};

      if (
        navigator.onLine !== false &&
        logoutConnectivity.appReachable === true &&
        logoutConnectivity.connectionIssue !== true
      ) {
        await completePendingRemoteLogout({
          allowReload: false
        });
      }

      /*
       * Reload once so private page content is rebuilt in the public/locked
       * state. Because the explicit logged-out marker is already durable,
       * Login remains visible continuously during this reload.
       */
      window.location.reload();
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

    let pendingLogoutUserId =
      getPendingRemoteLogoutUserId();

    if (
      !pendingLogoutUserId &&
      clerkObj.user?.id &&
      await window.UserData?.hasPendingRemoteLogout?.(
        clerkObj.user.id
      )
    ) {
      pendingLogoutUserId =
        clerkObj.user.id;

      writeLocalMarker(
        PENDING_REMOTE_LOGOUT_KEY,
        pendingLogoutUserId
      );
    }

    if (pendingLogoutUserId) {
      window.__pendingRemoteLogoutUserId =
        pendingLogoutUserId;

      if (typeof window.setLoggedOutAuthUI === "function") {
        window.setLoggedOutAuthUI();
      }

      if (typeof lockEditorTools === "function") {
        lockEditorTools();
      }

      const completed =
        await completePendingRemoteLogout({
          allowReload: false
        });

      if (!completed) {
        window.AppShell?.markDegraded?.("auth");
        return;
      }
    }

    window.AppShell?.clearDegraded?.("auth");

    console.log("Clerk loaded with UI components.");
    console.log("Clerk user:", clerkObj.user);
    console.log("Clerk session:", clerkObj.session);

    clerkObj.addListener(({ user }) => {
      console.log("Clerk auth state changed. User:", user);

      if (typeof window.updateAuthUI === "function") {
        window.updateAuthUI(user || null);
      }
    });

    if (typeof window.updateAuthUI === "function") {
      window.updateAuthUI(clerkObj.user || null);
    }
  } catch (error) {
    window.AppShell?.markDegraded?.("auth");
    console.error("Failed to initialize Clerk:", error);

    const connectivity = window.AppShell?.getState?.() || {};

    if (
      navigator.onLine === false ||
      connectivity.connectionIssue === true ||
      connectivity.appReachable === false
    ) {
      const trustedUser = await window.UserData?.getTrustedOfflineUser?.();

      if (trustedUser && typeof window.setOfflineTrustedAuthUI === "function") {
        window.setOfflineTrustedAuthUI(trustedUser);
      } else if (typeof window.setLoggedOutAuthUI === "function") {
        window.setLoggedOutAuthUI();

        if (typeof lockEditorTools === "function") {
          lockEditorTools();
        }
      }
    }
  }
});
