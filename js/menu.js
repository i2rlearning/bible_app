// ----------------------------------------------------
// Global parchment menu behavior
// ----------------------------------------------------
(function () {
  function getMenuElements() {
    return {
      menuNav: document.getElementById("menuNav"),
      menuToggle: document.getElementById("menuToggle"),
      bookUrl: document.getElementById("bookurl"),
      chapterUrl: document.getElementById("chapterurl")
    };
  }

  function setMenuToggleState(isOpen) {
    const { menuToggle } = getMenuElements();

    if (!menuToggle) return;

    if (isOpen) {
      menuToggle.classList.add("active-menu");
      menuToggle.setAttribute("aria-expanded", "true");
    } else {
      menuToggle.classList.remove("active-menu");
      menuToggle.setAttribute("aria-expanded", "false");
    }
  }

  function updateMenuLinks() {
    const { bookUrl, chapterUrl } = getMenuElements();

    const bookLink = sessionStorage.getItem("bookabbr");
    const chapterLink = sessionStorage.getItem("chapter");

    if (bookUrl) {
      if (bookLink) {
        bookUrl.setAttribute("href", bookLink);
        bookUrl.classList.remove("disabled");
        bookUrl.setAttribute("aria-disabled", "false");
      } else {
        bookUrl.setAttribute("href", "#");
        bookUrl.classList.add("disabled");
        bookUrl.setAttribute("aria-disabled", "true");
      }
    }

    if (chapterUrl) {
      if (chapterLink) {
        chapterUrl.setAttribute("href", chapterLink);
        chapterUrl.classList.remove("disabled");
        chapterUrl.setAttribute("aria-disabled", "false");
      } else {
        chapterUrl.setAttribute("href", "#");
        chapterUrl.classList.add("disabled");
        chapterUrl.setAttribute("aria-disabled", "true");
      }
    }
  }

  window.openNav = function () {
    const { menuNav } = getMenuElements();

    if (!menuNav) return;

    const isOpen = menuNav.style.width && menuNav.style.width !== "0px";

    if (isOpen) {
      window.closeNav();
      return;
    }

    updateMenuLinks();

    menuNav.style.width = "225px";
    setMenuToggleState(true);
  };

  window.closeNav = function () {
    const { menuNav } = getMenuElements();

    if (menuNav) {
      menuNav.style.width = "0px";
    }

    setMenuToggleState(false);
  };

  window.toggleNav = function () {
    window.openNav();
  };

  document.addEventListener("DOMContentLoaded", () => {
    const { menuToggle } = getMenuElements();

    updateMenuLinks();
    setMenuToggleState(false);

    if (menuToggle) {
      menuToggle.addEventListener("click", (event) => {
        event.preventDefault();
        window.toggleNav();
      });
    }

    document.addEventListener("click", (event) => {
      const target = event.target;

      if (!target || typeof target.closest !== "function") return;

      const disabledMenuLink = target.closest(".overlay-content a.disabled");

      if (
        disabledMenuLink &&
        disabledMenuLink.id !== "openMyNotes"
      ) {
        event.preventDefault();
      }
    });
  });
})();
