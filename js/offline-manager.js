/**
 * OFFLINE MANAGER - PHASE 1
 *
 * Phase 1 responsibilities:
 * - Provide one Offline button per page.
 * - Open/close the offline setup modal.
 * - Load available Bible versions from API.Bible.
 * - Respect HiddenBibleVersions.
 * - Show which versions are already stored in IndexedDB.
 * - Download/store the current Bible-version metadata through OfflineBible.
 *
 * Later phases will add:
 * - Search/filtering in the offline setup list.
 * - Complete Bible text/chapter downloads.
 * - Local Bible search.
 * - Offline Study Desk storage/sync.
 */

"use strict";

class OfflineManager {
  constructor() {
    this.availableVersions = [];
    this.downloading = new Set();
    this.ui = {};
    this.button = null;
    this.initialized = false;
    this.initializationPromise = null;

    this.initializationPromise = this.init();
  }

  async init() {
    if (this.initialized) {
      return this.initializationPromise;
    }

    this.initialized = true;

    // Build and wire the UI first. The button must be usable even if the
    // network/API request is slow or unavailable.
    this.createModal();
    this.addButtonToPage();
    this.setupEventListeners();

    // Load data after the UI is ready.
    await this.loadAvailableVersions();

    return true;
  }

  getApiKey() {
    if (typeof API_KEY !== "undefined" && API_KEY) {
      return API_KEY;
    }

    if (window.API_BIBLE_KEY) {
      return window.API_BIBLE_KEY;
    }

    if (window.apiBibleKey) {
      return window.apiBibleKey;
    }

    return null;
  }

  async loadAvailableVersions() {
    try {
      const apiKey = this.getApiKey();

      if (!apiKey) {
        throw new Error("API.Bible key not found.");
      }

      const response = await fetch(
        "https://api.scripture.api.bible/v1/bibles?include-full-details=false",
        {
          headers: {
            "api-key": apiKey
          }
        }
      );

      if (!response.ok) {
        throw new Error(`API.Bible returned ${response.status}.`);
      }

      const data = await response.json();
      const hiddenVersions = new Set(
        (window.HiddenBibleVersions || []).map((id) => String(id).trim())
      );

      const apiVersions = Array.isArray(data.data) ? data.data : [];

      this.availableVersions = apiVersions
        .filter((version) => !hiddenVersions.has(String(version.id || "").trim()))
        .map((version) => ({
          id: version.id,
          name: version.name || version.nameLocal || version.id,
          abbreviation:
            version.abbreviation ||
            version.abbreviationLocal ||
            version.id,
          language: version.language?.name || "Unknown"
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      console.log(
        "[Offline] Loaded",
        this.availableVersions.length,
        "Bible versions"
      );

      // If the modal is already open, refresh the list now that data arrived.
      if (this.ui.modal && this.ui.modal.style.display !== "none") {
        await this.renderVersionList();
      }
    } catch (error) {
      console.error("[Offline] Failed to load Bible versions:", error);
      this.availableVersions = [];
    }
  }

  createModal() {
    let modal = document.getElementById("offline-modal");

    if (!modal) {
      const modalHTML = `
        <div id="offline-modal" class="modal" style="display: none;">
          <div
            class="modal-content offline-modal-content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="offline-modal-title"
          >
            <button
              type="button"
              id="close-offline-modal"
              class="modal-close"
              aria-label="Close offline Bible setup"
              title="Close"
            >&times;</button>

            <h2 id="offline-modal-title">Offline Bible Setup</h2>
            <p>
              Select Bible versions to download for offline use. You can download
              up to 3 versions.
            </p>

            <div id="offline-versions-list"></div>

            <div id="offline-progress" style="display: none; margin: 15px 0;">
              <div class="progress-bar-container">
                <div
                  id="offline-progress-bar"
                  class="progress-bar"
                  style="width: 0%;"
                ></div>
              </div>
            </div>

            <div
              id="offline-status"
              style="margin: 15px 0; min-height: 20px;"
              aria-live="polite"
            ></div>

            <div class="modal-actions">
              <button
                type="button"
                id="download-selected"
                class="btn btn-primary"
              >Download Selected</button>

              <button
                type="button"
                id="close-offline-btn"
                class="btn btn-secondary"
              >Close</button>
            </div>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML("beforeend", modalHTML);
      modal = document.getElementById("offline-modal");
    }

    // Always resolve the element references, including when a modal already
    // exists. This prevents a second initialization from creating an object
    // with empty UI references.
    this.ui.modal = modal;
    this.ui.versionList = document.getElementById("offline-versions-list");
    this.ui.progressBar = document.getElementById("offline-progress");
    this.ui.progressBarInner = document.getElementById("offline-progress-bar");
    this.ui.statusText = document.getElementById("offline-status");
    this.ui.closeButton = document.getElementById("close-offline-modal");
    this.ui.closeFooterButton = document.getElementById("close-offline-btn");
    this.ui.downloadButton = document.getElementById("download-selected");
  }

  addButtonToPage() {
    const existingButtons = document.querySelectorAll("#toggle-offline-mode");

    if (existingButtons.length > 0) {
      // Reuse the first button rather than creating another one.
      this.button = existingButtons[0];

      // Remove accidental duplicates left by an earlier script version.
      for (let index = 1; index < existingButtons.length; index += 1) {
        existingButtons[index].remove();
      }

      return;
    }

    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.id = "toggle-offline-mode";
    this.button.className = "offline-toggle-btn auth-button";
    this.button.innerHTML =
      '<i class="fa fa-download" aria-hidden="true"></i><span>Offline</span>';
    this.button.title = "Manage offline Bible versions";
    this.button.setAttribute("aria-haspopup", "dialog");
    this.button.setAttribute("aria-controls", "offline-modal");

    const path = window.location.pathname;

    // Home page: place beside Preferences/Login/Logout.
    if (document.querySelector(".landing-header-actions")) {
      const headerActions = document.querySelector(".landing-header-actions");
      const authContainer = headerActions.querySelector(".auth-button-container");

      if (authContainer) {
        headerActions.insertBefore(this.button, authContainer);
      } else {
        headerActions.appendChild(this.button);
      }

      return;
    }

    // Study Desk: use the actual current Study Desk header actions.
    if (path.includes("study-desk.html")) {
      const studyHeaderActions = document.querySelector(".study-header-actions");

      if (studyHeaderActions) {
        const authButtons = studyHeaderActions.querySelectorAll(
          "#login, #logout"
        );

        if (authButtons.length > 0) {
          studyHeaderActions.insertBefore(this.button, authButtons[0]);
        } else {
          studyHeaderActions.appendChild(this.button);
        }

        return;
      }
    }

    // Verse page: place beside the Login/Logout controls.
    const verseAuthButtons = document.querySelector(".verse-auth-buttons");
    if (verseAuthButtons) {
      const loginButton = verseAuthButtons.querySelector("#login, #logout");

      if (loginButton) {
        verseAuthButtons.insertBefore(this.button, loginButton);
      } else {
        verseAuthButtons.appendChild(this.button);
      }

      return;
    }

    // Search page: use the dedicated three-zone search top bar. CSS places
    // the Offline button in the right-hand zone.
    const searchTopbar = document.querySelector(".search-topbar");
    if (searchTopbar) {
      searchTopbar.appendChild(this.button);
      return;
    }

    // Generic header fallback for any future page using this manager.
    const header = document.querySelector("header");
    if (header) {
      header.appendChild(this.button);
      return;
    }

    console.warn("[Offline] Could not find a suitable header - using fallback.");
    document.body.insertBefore(this.button, document.body.firstChild);
  }

  setupEventListeners() {
    if (this.ui.eventsBound) {
      return;
    }

    this.ui.eventsBound = true;

    if (this.button) {
      this.button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.showModal();
      });
    }

    if (this.ui.closeButton) {
      this.ui.closeButton.addEventListener("click", (event) => {
        event.preventDefault();
        this.hideModal();
      });
    }

    if (this.ui.closeFooterButton) {
      this.ui.closeFooterButton.addEventListener("click", (event) => {
        event.preventDefault();
        this.hideModal();
      });
    }

    if (this.ui.downloadButton) {
      this.ui.downloadButton.addEventListener("click", () => {
        void this.downloadSelectedVersions();
      });
    }

    if (this.ui.modal) {
      this.ui.modal.addEventListener("click", (event) => {
        if (event.target === this.ui.modal) {
          this.hideModal();
        }
      });
    }

    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        this.ui.modal &&
        this.ui.modal.style.display !== "none"
      ) {
        this.hideModal();
      }
    });
  }

  async showModal() {
    if (!this.ui.modal) {
      this.createModal();
    }

    this.ui.modal.style.display = "flex";
    this.ui.modal.style.zIndex = "10000";

    await this.renderVersionList();
  }

  hideModal() {
    if (this.ui.modal) {
      this.ui.modal.style.display = "none";
    }
  }

  async renderVersionList() {
    if (!this.ui.versionList) {
      return;
    }

    this.ui.versionList.innerHTML =
      '<p style="text-align: center; color: #666;">Loading Bible versions...</p>';

    try {
      const downloaded = window.OfflineBible
        ? await window.OfflineBible.listDownloadedVersions()
        : [];

      const downloadedIds = new Set(
        downloaded.map((version) => version.bibleId)
      );

      if (this.availableVersions.length === 0) {
        this.ui.versionList.innerHTML = `
          <p style="text-align: center; color: #d32f2f;">
            No Bible versions are currently available. Please check your internet connection.
          </p>
        `;
        return;
      }

      const listHTML = this.availableVersions
        .map((version) => {
          const isDownloaded = downloadedIds.has(version.id);
          const isDownloading = this.downloading.has(version.id);

          return `
            <label class="version-item">
              <input
                type="checkbox"
                name="bible-version"
                value="${this.escapeHtml(version.id)}"
                ${isDownloaded ? "checked disabled" : ""}
                ${isDownloading ? "disabled" : ""}
              >
              <span class="version-name">${this.escapeHtml(version.name)}</span>
              <span class="version-abbr">(${this.escapeHtml(version.abbreviation)})</span>
              ${
                isDownloaded
                  ? '<span class="version-downloaded">✓ Downloaded</span>'
                  : ""
              }
            </label>
          `;
        })
        .join("");

      this.ui.versionList.innerHTML = listHTML;
    } catch (error) {
      console.error("[Offline] Failed to render Bible versions:", error);
      this.ui.versionList.innerHTML = `
        <p style="text-align: center; color: #d32f2f;">
          Unable to read offline storage. Please reload the application and try again.
        </p>
      `;
    }
  }

  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async downloadSelectedVersions() {
    const checkboxes = document.querySelectorAll(
      '#offline-versions-list input[type="checkbox"]:checked:not([disabled])'
    );

    if (checkboxes.length === 0) {
      this.setStatus("Please select at least one Bible version.", "#d32f2f");
      return;
    }

    if (checkboxes.length > 3) {
      this.setStatus("Maximum of 3 versions allowed.", "#d32f2f");
      return;
    }

    const versionsToDownload = Array.from(checkboxes).map(
      (checkbox) => checkbox.value
    );

    this.ui.progressBar.style.display = "block";
    this.ui.progressBarInner.style.width = "0%";
    this.setStatus(
      `Preparing ${versionsToDownload.length} version(s) for offline storage...`,
      "#333"
    );

    let downloadedCount = 0;

    for (const versionId of versionsToDownload) {
      this.downloading.add(versionId);
      await this.renderVersionList();

      try {
        const progress = Math.round(
          ((downloadedCount + 1) / versionsToDownload.length) * 100
        );

        this.ui.progressBarInner.style.width = `${progress}%`;
        await this.downloadVersion(versionId);
        downloadedCount += 1;

        this.setStatus(
          `Downloaded ${downloadedCount} of ${versionsToDownload.length}.`,
          "#333"
        );
      } catch (error) {
        console.error(`[Offline] Failed to download ${versionId}:`, error);
        this.setStatus(
          `Error downloading ${versionId}. Check the browser console for details.`,
          "#d32f2f"
        );
      } finally {
        this.downloading.delete(versionId);
        await this.renderVersionList();
      }
    }

    if (downloadedCount > 0) {
      this.setStatus(
        `✓ ${downloadedCount} version(s) stored for offline use.`,
        "#4CAF50"
      );
    }

    window.setTimeout(() => {
      if (this.ui.progressBar) {
        this.ui.progressBar.style.display = "none";
      }
    }, 2000);
  }

  setStatus(message, color) {
    if (!this.ui.statusText) {
      return;
    }

    this.ui.statusText.textContent = message;
    this.ui.statusText.style.color = color;
  }

  async downloadVersion(bibleId) {
    try {
      const apiKey = this.getApiKey();

      if (!apiKey) {
        throw new Error("API.Bible key not found.");
      }

      const response = await fetch(
        `https://api.scripture.api.bible/v1/bibles/${encodeURIComponent(bibleId)}?include-full-details=true`,
        {
          headers: {
            "api-key": apiKey
          }
        }
      );

      if (!response.ok) {
        throw new Error(`API.Bible returned ${response.status}.`);
      }

      const data = await response.json();

      if (!window.OfflineBible) {
        throw new Error("OfflineBible is not available.");
      }

      await window.OfflineBible.storeBibleVersion(bibleId, data);
      await this.storeBooksAndChapters(bibleId, data);

      return true;
    } catch (error) {
      console.error(`[Offline] Failed to download ${bibleId}:`, error);
      throw error;
    }
  }

  async storeBooksAndChapters(bibleId, bibleData) {
    if (!bibleData || !Array.isArray(bibleData.books)) {
      // Phase 1 stores whatever Bible metadata the API returns. Complete
      // chapter/verse text acquisition is intentionally a later phase.
      return;
    }

    for (const book of bibleData.books) {
      await window.OfflineBible.storeBook({
        id: `${bibleId}::${book.id}`,
        bibleId,
        bookId: book.id,
        name: book.name,
        abbreviation: book.abbreviation,
        testament: book.testament
      });

      if (!Array.isArray(book.chapters)) {
        continue;
      }

      for (const chapter of book.chapters) {
        await window.OfflineBible.storeChapter({
          id: `${bibleId}::${book.id}::${chapter.id}`,
          bibleId,
          bookId: book.id,
          chapterId: chapter.id,
          reference: chapter.reference
        });
      }
    }
  }
}

window.OfflineManager = OfflineManager;
