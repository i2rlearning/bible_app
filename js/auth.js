// =========================================================================
//  1. CORE DOM LOGIC & API SETUP (Runs Instantly)
// =========================================================================
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded. Core scripts and API.bible can execute now.");

  const loginButton = document.getElementById("login");
  const signupButton = document.getElementById("signup");
  const logoutButton = document.getElementById("logout");
  const myNotesModal = document.getElementById("myNotesModal");

  // Default to a safe visual state immediately so the page looks right
  setLoggedOutUI();

  if (typeof lockEditorTools === "function") {
    lockEditorTools();
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

  function setLoggedInUI(user) {
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
    }

    const myNotesLink = document.getElementById("openMyNotes");

    if (myNotesLink) {
      myNotesLink.classList.remove("disabled");
      myNotesLink.setAttribute("aria-disabled", "false");
    }
  }

  function setLoggedOutUI() {
    if (loginButton) {
      loginButton.style.display = "";
      loginButton.textContent = "Login";
      loginButton.disabled = false;
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
  }

  // Expose this globally so the lazy-loaded Clerk script can call it later
  window.updateAuthUI = function (clerkUser) {
    if (clerkUser) {
      setLoggedInUI(clerkUser);

      if (typeof unlockEditorTools === "function") {
        unlockEditorTools();
      }

      startInactivityWatcher();
    } else {
      setLoggedOutUI();

      if (typeof lockEditorTools === "function") {
        lockEditorTools();
      }

      stopInactivityWatcher();
      inactivityPromptOpen = false;
    }
  };

  // ==========================================
  // CLERK ACTION HELPERS
  // ==========================================
  function getClerkObject() {
    return window.Clerk || window.clerk || null;
  }

  function openLogin() {
    console.log("Login button clicked");
    const returnTo = window.location.href;
  
    // Dynamically uses the current folder context instead of forcing the absolute domain root
    window.location.href = "sign-in?redirect=" + encodeURIComponent(returnTo);
  }
  
  function openSignup() {
    console.log("Signup button clicked");
    const returnTo = window.location.href;
  
    window.location.href = "sign-up?redirect=" + encodeURIComponent(returnTo);
  }

  // ==========================================
  // BACKEND FETCH UTILITIES
  // ==========================================
  async function getJson(url) {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include"
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
  // INACTIVITY LOGIC
  // ==========================================
  let lastActivityTime = Date.now();
  let inactivityInterval = null;
  let inactivityPromptOpen = false;

  // Testing - 10 seconds:
  //const INACTIVITY_LIMIT = 10 * 1000;

  // Production - 30 minutes
   const INACTIVITY_LIMIT = 30 * 60 * 1000;

  function getInactivityLabel() {
    const totalSeconds = Math.round(INACTIVITY_LIMIT / 1000);

    if (totalSeconds < 60) {
      return `${totalSeconds} second${totalSeconds === 1 ? "" : "s"}`;
    }

    const totalMinutes = Math.round(totalSeconds / 60);
    return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
  }

  function markActivityAndResetTimer() {
    if (inactivityPromptOpen) return;

    lastActivityTime = Date.now();
  }

  function startInactivityWatcher() {
    if (inactivityInterval) {
      return;
    }
  
    lastActivityTime = Date.now();
  
    inactivityInterval = setInterval(checkInactivityNow, 10 * 1000);
  }

  function restartInactivityWatcherAfterUserAction() {
    stopInactivityWatcher();
    lastActivityTime = Date.now();
    inactivityInterval = setInterval(checkInactivityNow, 10 * 1000);
  }
  
  function stopInactivityWatcher() {
    clearInterval(inactivityInterval);
    inactivityInterval = null;
  }

  function checkInactivityNow() {
    if (inactivityPromptOpen) return;

    const inactiveFor = Date.now() - lastActivityTime;

    if (
      logoutButton &&
      logoutButton.style.display !== "none" &&
      inactiveFor >= INACTIVITY_LIMIT
    ) {
      showInactivityPrompt();
    }
  }

  function showInactivityPrompt() {
    if (inactivityPromptOpen) return;

    inactivityPromptOpen = true;
    stopInactivityWatcher();

    const existingOverlay = document.getElementById("timeout-modal-overlay");
    if (existingOverlay) {
      existingOverlay.remove();
    }

    if (typeof lockEditorTools === "function") {
      lockEditorTools();
    }

    const overlay = document.createElement("div");
    overlay.id = "timeout-modal-overlay";
    overlay.innerHTML = `
      <div class="timeout-box">
        <h2 style="color: #ff4d4d; margin-top: 0;">Still there?</h2>
        <p>You have been inactive for ${getInactivityLabel()}.</p>
        <p>For your privacy, editing has been paused.</p>
        <div style="display: flex; gap: 12px; justify-content: center; margin-top: 20px;">
          <button type="button" id="timeout-continue-button" class="timeout-button">Continue Working</button>
          <button type="button" id="timeout-logout-button" class="timeout-button">Log Out</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const continueButton = document.getElementById("timeout-continue-button");
    const logoutButtonFromModal = document.getElementById("timeout-logout-button");

    if (continueButton) {
      continueButton.addEventListener("click", () => {
        overlay.remove();
        inactivityPromptOpen = false;

        if (typeof unlockEditorTools === "function") {
          unlockEditorTools();
        }

        restartInactivityWatcherAfterUserAction();
      });
    }

    if (logoutButtonFromModal) {
      logoutButtonFromModal.addEventListener("click", async () => {
        await logoutFromInactivity();
      });
    }
  }

  async function logoutFromInactivity() {
    try {
      stopInactivityWatcher();

      const clerkObj = getClerkObject();

      if (clerkObj && typeof clerkObj.signOut === "function") {
        await clerkObj.signOut();
      }

      setLoggedOutUI();

      if (typeof lockEditorTools === "function") {
        lockEditorTools();
      }

      window.location.reload();
    } catch (error) {
      console.error("Inactivity logout failed:", error);
      window.location.reload();
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      checkInactivityNow();
    }
  });

  window.addEventListener("focus", checkInactivityNow);
  window.addEventListener("pageshow", checkInactivityNow);

  // Mousemove is intentionally disabled because it can be noisy and keep the session alive.
  // window.addEventListener("mousemove", markActivityAndResetTimer);
  window.addEventListener("keypress", markActivityAndResetTimer);
  window.addEventListener("mousedown", markActivityAndResetTimer);
  window.addEventListener("touchstart", markActivityAndResetTimer);
  window.addEventListener("click", markActivityAndResetTimer);
  window.addEventListener("scroll", markActivityAndResetTimer, true);

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
        <td>${note.bibleName || note.bibleVersionID || ""}</td>
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
      const response = await fetch(`/api/my-notes/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include"
      });

      const result = await response.json();

      if (response.ok) {
        const currentPageKey = getCurrentBiblePageKeyForMyNotes();

        if (currentPageKey && currentPageKey === id) {
          reloadPageAfterMyNotesClose = true;
        }

        await loadMyNotes();
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
    const loginTarget = event.target.closest("#login");
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

      try {
        stopInactivityWatcher();

        const clerkObj = getClerkObject();

        if (clerkObj && typeof clerkObj.signOut === "function") {
          await clerkObj.signOut();
        }

        setLoggedOutUI();

        if (typeof lockEditorTools === "function") {
          lockEditorTools();
        }

        window.location.reload();
      } catch (error) {
        alert(error.message);
      }
    });
  }
});

// =========================================================================
//  2. SIMPLE CLERK LOADER - NO EMBEDDED POPUP
// =========================================================================
const CLERK_PUBLISHABLE_KEY = "pk_test_c3RpcnJlZC1wb255LTE0LmNsZXJrLmFjY291bnRzLmRldiQ";

window.addEventListener("load", async () => {
  console.log("Window fully loaded. Loading Clerk...");

  try {
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
      return;
    }

    await clerkObj.load();

    console.log("Clerk loaded.");
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
    console.error("Failed to initialize Clerk:", error);
  }
});

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
    script.crossOrigin = "anonymous";

    Object.entries(attributes).forEach(([key, value]) => {
      script.setAttribute(key, value);
    });

    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));

    document.head.appendChild(script);
  });
}
