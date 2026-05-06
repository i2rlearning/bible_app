document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.querySelector("#loginModal form");
  const signupForm = document.querySelector("#signupModal form");

  const loginButton = document.getElementById("login");
  const signupButton = document.getElementById("signup");
  const logoutButton = document.getElementById("logout");

  const loginModal = document.getElementById("loginModal");
  const signupModal = document.getElementById("signupModal");

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
      loginButton.textContent = "Logged in";
      loginButton.disabled = true;
      loginButton.title = user?.email || "Logged in";
    }

    if (signupButton) {
      signupButton.style.display = "none";
    }

    if (logoutButton) {
      logoutButton.style.display = "";
    }
  }

  function setLoggedOutUI() {
    if (loginButton) {
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
  }

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

  async function checkLoginStatus() {
    try {
      const result = await getJson("/api/me");

      if (result.ok && result.user) {
        setLoggedInUI(result.user);

        if (typeof unlockEditorTools === "function") {
          unlockEditorTools();
        }
      } else {
        setLoggedOutUI();

        if (typeof lockEditorTools === "function") {
          lockEditorTools();
        }
      }
    } catch (error) {
      setLoggedOutUI();

      if (typeof lockEditorTools === "function") {
        lockEditorTools();
      }
    }
  }

  document.addEventListener("click", (event) => {
    const target = event.target;

    if (!target) return;

    if (target.id === "login") {
      toggleModal(loginModal, true);
    }

    if (target.id === "signup") {
      toggleModal(signupModal, true);
    }

    if (target.id === "openSignupFromLogin") {
      event.preventDefault();
      toggleModal(loginModal, false);
      toggleModal(signupModal, true);
    }

    if (target.classList && target.classList.contains("toggle-password")) {
      const targetId = target.getAttribute("data-target");
      const passwordInput = document.getElementById(targetId);

      if (passwordInput) {
        const isPassword = passwordInput.getAttribute("type") === "password";

        passwordInput.setAttribute("type", isPassword ? "text" : "password");
        target.classList.toggle("fa-eye");
        target.classList.toggle("fa-eye-slash");
      }
    }

    const isCloser = [
      "cancelLogin",
      "closelogin",
      "cancelSignupBtn",
      "closeSignup"
    ].includes(target.id);

    const isBackgroundClick =
      target === loginModal || target === signupModal;

    if (isCloser || isBackgroundClick) {
      toggleModal(loginModal, false);
      toggleModal(signupModal, false);
    }
  });

  if (signupForm) {
    signupForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const email = signupForm.querySelector('input[name="email"]').value;
      const password = signupForm.querySelector('input[name="psw"]').value;
      const passwordRepeat = signupForm.querySelector('input[name="psw-repeat"]').value;

      try {
        const result = await postJson("/api/signup", {
          email,
          password,
          passwordRepeat
        });

        alert(result.message || "Account created. You can now log in.");

        signupForm.reset();

        toggleModal(signupModal, false);
        toggleModal(loginModal, true);
      } catch (error) {
        alert(error.message);
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const username = loginForm.querySelector('input[name="uname"]').value;
      const password = loginForm.querySelector('input[name="psw"]').value;

      try {
        const result = await postJson("/api/login", {
          username,
          password,
          remember: false
        });

        loginForm.reset();

        toggleModal(loginModal, false);
        setLoggedInUI(result.user);

        if (typeof unlockEditorTools === "function") {
          unlockEditorTools();
        }

        window.location.reload();
      } catch (error) {
        alert(error.message);
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      try {
        await postJson("/api/logout");

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

  checkLoginStatus();
});
