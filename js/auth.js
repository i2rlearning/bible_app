document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.querySelector("#loginModal form");
  const signupForm = document.querySelector("#signupModal form");
  const loginButton = document.getElementById("login");
  const signupButton = document.getElementById("signup");

  function setLoggedInUI(user) {
    if (loginButton) {
      loginButton.textContent = "Logged in";
      loginButton.disabled = true;
      loginButton.title = user?.email || "Logged in";
    }

    if (signupButton) {
      signupButton.style.display = "none";
    }
  }

  function setLoggedOutUI() {
    if (loginButton) {
      loginButton.textContent = "Login";
      loginButton.disabled = false;
      loginButton.title = "";
    }

    if (signupButton) {
      signupButton.style.display = "";
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

  async function postJson(url, data) {
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
      } else {
        setLoggedOutUI();
      }
    } catch (error) {
      setLoggedOutUI();
    }
  }

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

        const signupModal = document.getElementById("signupModal");
        if (signupModal) {
          signupModal.style.display = "none";
          signupModal.classList.remove("is-open");
        }

        const loginModal = document.getElementById("loginModal");
        if (loginModal) {
          loginModal.style.display = "block";
          loginModal.classList.add("is-open");
        }
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
      const remember = loginForm.querySelector('input[name="remember"]')?.checked || false;

      try {
        const result = await postJson("/api/login", {
          username,
          password,
          remember
        });

        alert(result.message || "Logged in");

        loginForm.reset();

        const loginModal = document.getElementById("loginModal");
        if (loginModal) {
          loginModal.style.display = "none";
          loginModal.classList.remove("is-open");
        }

        setLoggedInUI(result.user);
      } catch (error) {
        alert(error.message);
      }
    });
  }

  checkLoginStatus();
});
