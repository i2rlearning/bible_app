// =========================================================================
//  CORE DOM LOGIC & API SETUP (Runs Instantly)
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

      // Inactivity timer is disabled. Clerk handles the active session.
    } else {
      setLoggedOutUI();

      if (typeof lockEditorTools === "function") {
        lockEditorTools();
      }

      // Inactivity timer is disabled. Clerk handles the active session.
    }
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
        // Inactivity timer is disabled. Manual logout continues normally.

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
      return;
    }

    await clerkObj.load({
      ui: {
        ClerkUI: window.__internal_ClerkUICtor
      }
    });

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
    console.error("Failed to initialize Clerk:", error);
  }
});
