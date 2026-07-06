"use strict";

// ----------------------------------------------------
// Global parchment menu behavior
// ----------------------------------------------------

(function () {
  function getMenuElements() {
    return {
      menuNav:
        document.getElementById("menuNav"),

      menuToggle:
        document.getElementById("menuToggle"),

      stickyHeader:
        document.getElementById("stickyHeader")
    };
  }

  function isResponsiveMenuMode() {
    return window.matchMedia(
      "(max-width: 1100px)"
    ).matches;
  }

  function updateResponsiveMenuPosition() {
    const { stickyHeader } =
      getMenuElements();

    if (!stickyHeader) {
      return;
    }

    const headerRect =
      stickyHeader.getBoundingClientRect();

    const top =
      Math.max(
        0,
        Math.round(headerRect.bottom + 6)
      );

    document.documentElement.style.setProperty(
      "--branch-menu-top",
      `${top}px`
    );
  }

  function setMenuToggleState(isOpen) {
    const { menuToggle } =
      getMenuElements();

    if (!menuToggle) {
      return;
    }

    if (isOpen) {
      menuToggle.classList.add(
        "active-menu"
      );

      menuToggle.setAttribute(
        "aria-expanded",
        "true"
      );
    } else {
      menuToggle.classList.remove(
        "active-menu"
      );

      menuToggle.setAttribute(
        "aria-expanded",
        "false"
      );
    }
  }

  /*
   * menu.js must not create or restore navigation URLs.
   *
   * Each page creates its own links using the current URL:
   *
   * index.html  - Bible only
   * book.html   - Bible only
   * chapter.html - Bible and book
   * verse.html  - Bible, book and chapter
   *
   * This prevents old sessionStorage values from replacing
   * the current page state.
   */

  window.openNav = function () {
    const { menuNav } =
      getMenuElements();

    if (!menuNav) {
      return;
    }

    const isOpen =
      menuNav.style.width &&
      menuNav.style.width !== "0px";

    if (isOpen) {
      window.closeNav();
      return;
    }

    if (isResponsiveMenuMode()) {
      updateResponsiveMenuPosition();
    }

    menuNav.style.width =
      "225px";

    setMenuToggleState(true);
  };

  window.closeNav = function () {
    const { menuNav } =
      getMenuElements();

    if (menuNav) {
      menuNav.style.width =
        "0px";
    }

    setMenuToggleState(false);
  };

  window.toggleNav = function () {
    const { menuNav } =
      getMenuElements();

    if (!menuNav) {
      return;
    }

    const isOpen =
      menuNav.style.width &&
      menuNav.style.width !== "0px";

    if (isOpen) {
      window.closeNav();
    } else {
      window.openNav();
    }
  };

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      const { menuToggle } =
        getMenuElements();

      updateResponsiveMenuPosition();
      setMenuToggleState(false);

      if (menuToggle) {
        menuToggle.addEventListener(
          "click",
          (event) => {
            event.preventDefault();
            window.toggleNav();
          }
        );
      }

      window.addEventListener(
        "resize",
        () => {
          updateResponsiveMenuPosition();
        }
      );

      window.addEventListener(
        "scroll",
        () => {
          if (isResponsiveMenuMode()) {
            updateResponsiveMenuPosition();
          }
        },
        { passive: true }
      );

      document.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Escape") {
            window.closeNav();
          }
        }
      );

      document.addEventListener(
        "click",
        (event) => {
          const target =
            event.target;

          if (
            !target ||
            typeof target.closest !==
              "function"
          ) {
            return;
          }

          const menuLink =
            target.closest(
              "#menuNav .overlay-content a"
            );

          const disabledMenuLink =
            target.closest(
              ".overlay-content a.disabled"
            );

          if (
            disabledMenuLink &&
            disabledMenuLink.id !==
              "openMyNotes"
          ) {
            event.preventDefault();
            return;
          }

          if (menuLink) {
            window.closeNav();
          }
        }
      );
    }
  );
})();
