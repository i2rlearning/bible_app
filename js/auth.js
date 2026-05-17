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
  if (typeof lockEditorTools === "function") lockEditorTools();

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
      loginButton.title = user?.primaryEmailAddress?.emailAddress || "Logged in";
    }

    if (signupButton) signupButton.style.display = "none";
    if (logoutButton) logoutButton.style.display = "";

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

    if (signupButton) signupButton.style.display = "none";
    if (logoutButton) logoutButton.style.display = "none";

    const myNotesLink = document.getElementById("openMyNotes");
    if (myNotesLink) {
      myNotesLink.classList.add("disabled");
      myNotesLink.setAttribute("aria-disabled", "true");
    }
  }

  // Expose these UI functions globally so the lazy-loaded Clerk script can call them later
  window.updateAuthUI = function (clerkUser) {
    if (clerkUser) {
      setLoggedInUI(clerkUser);
      if (typeof unlockEditorTools === "function") unlockEditorTools();
    } else {
      setLoggedOutUI();
      if (typeof lockEditorTools === "function") lockEditorTools();
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
  
    const clerkObj = getClerkObject();
  
    if (!clerkObj) {
      window.location.href = "/sign-in?redirect=" + encodeURIComponent(window.location.href);
      return;
    }
  
    try {
      clerkObj.openSignIn({
        fallbackRedirectUrl: window.location.href,
        forceRedirectUrl: window.location.href
      });
    } catch (error) {
      console.error("Failed to open Clerk sign-in:", error);
      window.location.href = "/sign-in?redirect=" + encodeURIComponent(window.location.href);
    }
  }

  function openSignup() {
    console.log("Signup button clicked");
  
    const clerkObj = getClerkObject();
  
    if (!clerkObj) {
      alert("Sign-up is still loading. Please try again in a second.");
      return;
    }
  
    const currentUrl = window.location.href;
  
    try {
      clerkObj.openSignUp({
        routing: "hash",
        fallbackRedirectUrl: currentUrl,
        forceRedirectUrl: currentUrl,
        signInUrl: "/sign-in",
        signInFallbackRedirectUrl: currentUrl,
        signInForceRedirectUrl: currentUrl
      });
    } catch (error) {
      console.error("Failed to open Clerk sign-up:", error);
      window.location.href = "/sign-up";
    }
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

  // Keep this available in case another script uses it later
  window.authPostJson = postJson;
  window.authGetJson = getJson;

  // ==========================================
  // INACTIVITY LOGIC
  // ==========================================
  let idleTimeout;
  const THIRTY_MINUTES = 30 * 60 * 1000;

  function resetIdleTimer() {
    clearTimeout(idleTimeout);

    if (logoutButton && logoutButton.style.display !== "none") {
      idleTimeout = setTimeout(executeLogout, THIRTY_MINUTES);
    }
  }

  async function executeLogout() {
    try {
      const clerkObj = getClerkObject();

      if (clerkObj && typeof clerkObj.signOut === "function") {
        await clerkObj.signOut();
      }

      const overlay = document.createElement("div");
      overlay.id = "timeout-modal-overlay";
      overlay.innerHTML = `
        <div class="timeout-box">
          <h2 style="color: #ff4d4d; margin-top: 0;">Session Expired</h2>
          <p>You have been inactive for over 30 minutes.</p>
          <p>For your security, you have been logged out.</p>
          <button class="timeout-button" onclick="window.location.reload()">Close</button>
        </div>
      `;

      document.body.appendChild(overlay);

      setLoggedOutUI();

      if (typeof lockEditorTools === "function") {
        lockEditorTools();
      }
    } catch (error) {
      console.error("Inactivity logout failed:", error);
      window.location.reload();
    }
  }

  window.addEventListener("mousemove", resetIdleTimer);
  window.addEventListener("keypress", resetIdleTimer);
  window.addEventListener("mousedown", resetIdleTimer);
  window.addEventListener("touchstart", resetIdleTimer);
  window.addEventListener("click", resetIdleTimer);

  resetIdleTimer();

  // ==========================================
  // NOTES MANAGEMENT & RENDERING LOGIC
  // ==========================================
  let allMyNotes = [];

  function formatSavedContent(note) {
    const parts = [];

    if (note.hasQuillNotes) parts.push("Notes");
    if (note.hasHighlights) parts.push("Highlights");
    if (note.hasDrawings) parts.push("Drawings");
    if (note.hasTextFormats) parts.push("Text formatting");

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

    if (status) status.textContent = "Loading...";
    if (tableBody) tableBody.innerHTML = "";

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
    console.log("Global click detected:", event.target);

    const loginTarget = event.target.closest("#login");
    const signupTarget = event.target.closest("#signup");
    const myNotesTarget = event.target.closest("#openMyNotes");
    const deleteNoteTarget = event.target.closest(".delete-note");
    const closeMyNotesTarget = event.target.closest("#closeMyNotes");

    console.log("loginTarget:", loginTarget);

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
        if (typeof closeNav === "function") closeNav();
        openLogin();
        return;
      }

      if (typeof closeNav === "function") closeNav();

      toggleModal(myNotesModal, true);
      loadMyNotes();

      return;
    }

    if (closeMyNotesTarget) {
      event.preventDefault();
      event.stopPropagation();

      toggleModal(myNotesModal, false);

      return;
    }

    if (myNotesModal && event.target === myNotesModal) {
      event.preventDefault();
      event.stopPropagation();

      toggleModal(myNotesModal, false);
    }
  });

  // Fallback direct listener for the login button
  // This helps if another script interferes with delegated click handling
  if (loginButton) {
    loginButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      console.log("Direct login button listener fired");

      openLogin();
    });
  } else {
    console.warn("Login button with id='login' was not found on DOMContentLoaded");
  }

  // Fallback direct listener for the signup button
  if (signupButton) {
    signupButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      console.log("Direct signup button listener fired");

      openSignup();
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      try {
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
//  2. DYNAMIC CLERK LOADER WITH UI BUNDLE
// =========================================================================
const CLERK_PUBLISHABLE_KEY = "pk_test_c3RpcnJlZC1wb255LTE0LmNsZXJrLmFjY291bnRzLmRldiQ";
const CLERK_DOMAIN = "stirred-pony-14.accounts.dev";

window.addEventListener("load", async () => {
  console.log("Window fully loaded. Loading Clerk UI bundle...");

  try {
    await loadScriptOnce(
      "clerk-ui-bundle",
      `https://${CLERK_DOMAIN}/npm/@clerk/ui@1/dist/ui.browser.js`
    );

    console.log("Clerk UI bundle loaded. Loading Clerk browser script...");

    await loadScriptOnce(
      "clerk-browser-script",
      `https://${CLERK_DOMAIN}/npm/@clerk/clerk-js@latest/dist/clerk.browser.js`,
      {
        "data-clerk-publishable-key": CLERK_PUBLISHABLE_KEY
      }
    );

    const clerkObj = window.Clerk || window.clerk;

    if (!clerkObj) {
      console.error("Clerk object was not found on the window.");
      return;
    }

    aawait clerkObj.load();

    console.log("Clerk initialized successfully.");
    console.log("Clerk user:", clerkObj.user);
    console.log("Clerk session:", clerkObj.session);
    
    clerkObj.addListener(({ user }) => {
      console.log("Clerk auth state changed. User:", user);
    
      if (typeof window.updateAuthUI === "function") {
        window.updateAuthUI(user);
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
