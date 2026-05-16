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
  window.updateAuthUI = function(clerkUser) {
    if (clerkUser) {
      setLoggedInUI(clerkUser);
      if (typeof unlockEditorTools === "function") unlockEditorTools();
    } else {
      setLoggedOutUI();
      if (typeof lockEditorTools === "function") lockEditorTools();
    }
  };

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
        if (window.Clerk) await Clerk.signOut();
        
        const overlay = document.createElement('div');
        overlay.id = 'timeout-modal-overlay';
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
        if (typeof lockEditorTools === "function") lockEditorTools();
    } catch (error) {
        console.error("Inactivity logout failed:", error);
        window.location.reload();
    }
  }

  window.addEventListener('mousemove', resetIdleTimer);
  window.addEventListener('keypress', resetIdleTimer);
  window.addEventListener('mousedown', resetIdleTimer);
  window.addEventListener('touchstart', resetIdleTimer);
  window.addEventListener('click', resetIdleTimer);
  resetIdleTimer();

  // ==========================================
  // GLOBAL CLICK CAPTURE
  // ==========================================
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!target) return;

    if (target.id === "login") {
      if (window.Clerk) {
        Clerk.openSignIn({ afterSignInUrl: window.location.href });
      } else {
        alert("Sign-in is still loading in the background. Please try again in a moment.");
      }
      return;
    }

    if (target.id === "signup") {
      if (window.Clerk) {
        Clerk.openSignUp({ afterSignUpUrl: window.location.href });
      }
      return;
    }

    if (target.id === "openMyNotes") {
      event.preventDefault();
      if (target.classList.contains("disabled")) {
        if (typeof closeNav === "function") closeNav();
        if (window.Clerk) Clerk.openSignIn({ afterSignInUrl: window.location.href });
        return;
      }
      if (typeof closeNav === "function") closeNav();
      toggleModal(myNotesModal, true);
      // loadMyNotes() logic omitted here for brevity, keeping your existing logic intact
    }

    if (["closeMyNotes", "myNotesModal"].includes(target.id) || target === myNotesModal) {
      toggleModal(myNotesModal, false);
    }
  });

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      try {
        if (window.Clerk) await Clerk.signOut();
        setLoggedOutUI();
        if (typeof lockEditorTools === "function") lockEditorTools();
        window.location.reload();
      } catch (error) {
        alert(error.message);
      }
    });
  }
});

// =========================================================================
//  2. DYNAMIC, LAZY CLERK LOADER (Runs completely outside DOMContentLoaded)
// =========================================================================
const CLERK_PUBLISHABLE_KEY = "pk_test_c3RpcnJlZC1wb255LTE0LmNsZXJrLmFjY291bnRzLmRldiQ";

window.addEventListener("load", () => {
  console.log("Window fully loaded. Fetching Clerk script now...");
  
  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.setAttribute('data-clerk-publishable-key', CLERK_PUBLISHABLE_KEY);
  script.src = `https://stirred-pony-14.clerk.accounts.dev/npm/@clerk/clerk-js@latest/dist/clerk.browser.js`;
  
  script.onload = async () => {
    try {
      await Clerk.load();
      console.log('Clerk lazy-loaded successfully!');
      // Call the UI updater we exposed inside DOMContentLoaded
      if (typeof window.updateAuthUI === "function") {
        window.updateAuthUI(Clerk.user);
      }
    } catch (e) {
      console.error("Clerk failed to load in background:", e);
    }
  };

  document.head.appendChild(script);
});
