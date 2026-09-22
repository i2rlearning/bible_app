"use strict";

(function () {
  let overlay = null;
  let titleEl = null;
  let messageEl = null;
  let detailEl = null;
  let primaryButton = null;
  let secondaryButton = null;
  let currentKey = "";
  let lastFocused = null;

  function ensureDialog() {
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.className = "app-conflict-dialog";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="app-conflict-dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="app-conflict-dialog-title" aria-describedby="app-conflict-dialog-message">
        <div class="app-conflict-dialog-icon" aria-hidden="true">!</div>
        <div class="app-conflict-dialog-content">
          <h2 id="app-conflict-dialog-title"></h2>
          <p id="app-conflict-dialog-message"></p>
          <p class="app-conflict-dialog-detail" hidden></p>
          <div class="app-conflict-dialog-actions">
            <button type="button" class="app-conflict-dialog-secondary">Keep this screen</button>
            <button type="button" class="app-conflict-dialog-primary">Review</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    titleEl = overlay.querySelector("#app-conflict-dialog-title");
    messageEl = overlay.querySelector("#app-conflict-dialog-message");
    detailEl = overlay.querySelector(".app-conflict-dialog-detail");
    primaryButton = overlay.querySelector(".app-conflict-dialog-primary");
    secondaryButton = overlay.querySelector(".app-conflict-dialog-secondary");

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });

    return overlay;
  }

  function close() {
    if (!overlay || overlay.hidden) return;

    overlay.hidden = true;
    overlay.classList.remove("is-open");
    currentKey = "";

    if (lastFocused && document.contains(lastFocused)) {
      lastFocused.focus();
    }

    lastFocused = null;
  }

  function show(options = {}) {
    ensureDialog();

    const key = String(options.key || "");
    if (key && key === currentKey && !overlay.hidden) {
      return;
    }

    currentKey = key;
    lastFocused = document.activeElement;

    titleEl.textContent = options.title || "Newer version available";
    messageEl.textContent =
      options.message ||
      "A newer version was saved on another device. Your changes were not allowed to overwrite it.";

    const detail = String(options.detail || "").trim();
    detailEl.textContent = detail;
    detailEl.hidden = !detail;

    const hasSecondary = options.secondaryLabel !== null && options.secondaryLabel !== false;
    secondaryButton.hidden = !hasSecondary;
    secondaryButton.textContent = hasSecondary
      ? (options.secondaryLabel || "Keep this screen")
      : "";
    primaryButton.textContent = options.primaryLabel || "Review";

    secondaryButton.onclick = () => {
      close();
      if (typeof options.onSecondary === "function") {
        options.onSecondary();
      }
    };

    primaryButton.onclick = () => {
      close();
      if (typeof options.onPrimary === "function") {
        options.onPrimary();
      }
    };

    overlay.hidden = false;
    overlay.classList.add("is-open");
    primaryButton.focus();
  }

  window.AppConflictDialog = {
    show,
    close,
    isOpen() {
      return Boolean(overlay && !overlay.hidden);
    }
  };
})();
