/**
 * OFFLINE MANAGER - USER INTERFACE & DOWNLOAD LOGIC
 *
 * Provides the offline setup interface, Bible version filtering, download
 * progress, and IndexedDB storage integration.
 */

"use strict";

class OfflineManager {
  constructor() {
    this.availableVersions = [];
    this.downloading = new Set();
    this.selectedVersionIds = new Set();
    this.ui = {};
    this.button = null;
    this.initialized = false;
    this.initializationPromise = this.init();
  }

  async init() {
    if (this.initialized) {
      return this.initializationPromise;
    }

    this.initialized = true;

    this.createModal();
    this.addButtonToPage();
    this.setupEventListeners();

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
        .filter(
          (version) =>
            !hiddenVersions.has(String(version.id || "").trim())
        )
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

            <div class="offline-filters">
              <label class="offline-search-label" for="offline-search">
                Search Bible versions
              </label>
              <input
                id="offline-search"
                type="search"
                class="offline-search"
                placeholder="Search by Bible name or abbreviation..."
                autocomplete="off"
              >

              <label class="offline-language-label" for="offline-language-filter">
                Language
              </label>
              <select id="offline-language-filter" class="offline-language-filter">
                <option value="all">All Languages</option>
                <option value="english">English</option>
                <option value="greek">Greek</option>
                <option value="hebrew">Hebrew</option>
              </select>
            </div>

            <div id="offline-filter-summary" class="offline-filter-summary"></div>

            <div id="offline-versions-list"></div>

            <div id="offline-progress" style="display: none; margin: 15px 0;">
              <div id="offline-progress-label" class="offline-progress-label"></div>
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

    this.ui.modal = modal;
    this.ui.versionList = document.getElementById("offline-versions-list");
    this.ui.progressBar = document.getElementById("offline-progress");
    this.ui.progressBarInner = document.getElementById("offline-progress-bar");
    this.ui.progressLabel = document.getElementById("offline-progress-label");
    this.ui.statusText = document.getElementById("offline-status");
    this.ui.closeButton = document.getElementById("close-offline-modal");
    this.ui.closeFooterButton = document.getElementById("close-offline-btn");
    this.ui.downloadButton = document.getElementById("download-selected");
    this.ui.search = document.getElementById("offline-search");
    this.ui.languageFilter = document.getElementById("offline-language-filter");
    this.ui.filterSummary = document.getElementById("offline-filter-summary");
  }

  addButtonToPage() {
    const existingButtons = document.querySelectorAll("#toggle-offline-mode");

    if (existingButtons.length > 0) {
      this.button = existingButtons[0];

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

    if (path.includes("study-desk.html")) {
      const studyHeaderActions = document.querySelector(".study-header-actions");

      if (studyHeaderActions) {
        const authButtons = studyHeaderActions.querySelectorAll("#login, #logout");

        if (authButtons.length > 0) {
          studyHeaderActions.insertBefore(this.button, authButtons[0]);
        } else {
          studyHeaderActions.appendChild(this.button);
        }

        return;
      }
    }

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

    const searchTopbar = document.querySelector(".search-topbar");
    if (searchTopbar) {
      searchTopbar.appendChild(this.button);
      return;
    }

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

    if (this.ui.search) {
      this.ui.search.addEventListener("input", () => {
        this.renderVersionList();
      });
    }

    if (this.ui.languageFilter) {
      this.ui.languageFilter.addEventListener("change", () => {
        this.renderVersionList();
      });
    }

    if (this.ui.versionList) {
      this.ui.versionList.addEventListener("change", (event) => {
        const checkbox = event.target.closest('input[name="bible-version"]');

        if (!checkbox || checkbox.disabled) {
          return;
        }

        if (checkbox.checked) {
          this.selectedVersionIds.add(checkbox.value);
        } else {
          this.selectedVersionIds.delete(checkbox.value);
        }

        this.updateFilterSummary();
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

  getFilteredVersions() {
    const searchTerm = (this.ui.search?.value || "").trim().toLowerCase();
    const selectedLanguage = this.ui.languageFilter?.value || "all";

    return this.availableVersions.filter((version) => {
      const searchableText = [
        version.name,
        version.abbreviation,
        version.language
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const searchMatch = !searchTerm || searchableText.includes(searchTerm);

      const languageMatch =
        selectedLanguage === "all" ||
        version.language.toLowerCase().includes(selectedLanguage);

      return searchMatch && languageMatch;
    });
  }

  async renderVersionList() {
    if (!this.ui.versionList) {
      return;
    }

    this.ui.versionList.innerHTML =
      '<p class="offline-loading">Loading Bible versions...</p>';

    try {
      const downloaded = window.OfflineBible
        ? await window.OfflineBible.listDownloadedVersions()
        : [];

      const downloadedIds = new Set(
        downloaded.map((version) => String(version.bibleId))
      );

      if (this.availableVersions.length === 0) {
        this.ui.versionList.innerHTML = `
          <p class="offline-message offline-message-error">
            No Bible versions are currently available. Please check your internet connection.
          </p>
        `;
        this.updateFilterSummary(0);
        return;
      }

      const versions = this.getFilteredVersions();

      if (versions.length === 0) {
        this.ui.versionList.innerHTML = `
          <p class="offline-message">
            No Bible versions match your search or language filter.
          </p>
        `;
        this.updateFilterSummary(0);
        return;
      }

      const listHTML = versions
        .map((version) => {
          const isDownloaded = downloadedIds.has(String(version.id));
          const isDownloading = this.downloading.has(version.id);
          const isSelected = this.selectedVersionIds.has(version.id);

          return `
            <label class="version-item${
              isDownloaded ? " version-item-downloaded" : ""
            }${isDownloading ? " version-item-downloading" : ""}">
              <input
                type="checkbox"
                name="bible-version"
                value="${this.escapeHtml(version.id)}"
                ${isDownloaded ? "checked disabled" : ""}
                ${isDownloading ? "disabled" : ""}
                ${isSelected && !isDownloaded ? "checked" : ""}
              >
              <span class="version-name">${this.escapeHtml(version.name)}</span>
              <span class="version-abbr">(${this.escapeHtml(version.abbreviation)})</span>
              <span class="version-language">${this.escapeHtml(version.language)}</span>
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
      this.updateFilterSummary(versions.length, downloadedIds);
    } catch (error) {
      console.error("[Offline] Failed to render Bible versions:", error);
      this.ui.versionList.innerHTML = `
        <p class="offline-message offline-message-error">
          Unable to read offline storage. Please reload the application and try again.
        </p>
      `;
    }
  }

  updateFilterSummary(visibleCount = null, downloadedIds = null) {
    if (!this.ui.filterSummary) {
      return;
    }

    const selectedCount = this.selectedVersionIds.size;
    const countText =
      visibleCount === null ? "" : `${visibleCount} version${visibleCount === 1 ? "" : "s"} shown`;
    const selectedText = `${selectedCount} selected`;

    this.ui.filterSummary.textContent =
      countText ? `${countText} · ${selectedText}` : selectedText;

    if (downloadedIds) {
      const downloadedCount = this.availableVersions.filter((version) =>
        downloadedIds.has(String(version.id))
      ).length;

      if (downloadedCount > 0) {
        this.ui.filterSummary.textContent +=
          ` · ${downloadedCount} already downloaded`;
      }
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
    if (this.downloading.size > 0) {
      return;
    }

    const selectedIds = Array.from(this.selectedVersionIds);

    if (selectedIds.length === 0) {
      this.setStatus("Please select at least one Bible version.", "#d32f2f");
      return;
    }

    if (selectedIds.length > 3) {
      this.setStatus("Maximum of 3 versions allowed.", "#d32f2f");
      return;
    }

    const availableById = new Map(
      this.availableVersions.map((version) => [String(version.id), version])
    );
    const versionsToDownload = selectedIds.filter((id) => availableById.has(String(id)));

    if (versionsToDownload.length === 0) {
      this.setStatus("Please select at least one available Bible version.", "#d32f2f");
      return;
    }

    if (this.ui.downloadButton) {
      this.ui.downloadButton.disabled = true;
    }

    if (this.ui.progressBar) {
      this.ui.progressBar.style.display = "block";
    }

    if (this.ui.progressBarInner) {
      this.ui.progressBarInner.style.width = "0%";
    }

    let downloadedCount = 0;
    let failedCount = 0;

    for (let index = 0; index < versionsToDownload.length; index += 1) {
      const versionId = versionsToDownload[index];
      const version = availableById.get(String(versionId));
      const versionName = version?.name || versionId;

      this.downloading.add(versionId);

      const startPercent = Math.round((index / versionsToDownload.length) * 100);
      if (this.ui.progressBarInner) {
        this.ui.progressBarInner.style.width = `${startPercent}%`;
      }

      if (this.ui.progressLabel) {
        this.ui.progressLabel.textContent =
          `Downloading ${index + 1} of ${versionsToDownload.length}: ${versionName}`;
      }

      this.setStatus(
        `Preparing ${versionName} for offline use...`,
        "#333"
      );

      try {
        await this.downloadVersion(versionId);
        downloadedCount += 1;
        this.selectedVersionIds.delete(versionId);

        const completePercent = Math.round(
          (downloadedCount / versionsToDownload.length) * 100
        );

        if (this.ui.progressBarInner) {
          this.ui.progressBarInner.style.width = `${completePercent}%`;
        }

        this.setStatus(
          `Downloaded ${downloadedCount} of ${versionsToDownload.length}: ${versionName}`,
          "#333"
        );
      } catch (error) {
        failedCount += 1;
        console.error(`[Offline] Failed to download ${versionId}:`, error);
        this.setStatus(
          `Could not download ${versionName}. Continuing with the remaining selections...`,
          "#d32f2f"
        );
      } finally {
        this.downloading.delete(versionId);
      }
    }

    await this.renderVersionList();

    if (downloadedCount > 0 && failedCount === 0) {
      this.setStatus(
        `✓ ${downloadedCount} Bible version${downloadedCount === 1 ? " is" : "s are"} ready for offline use.`,
        "#4CAF50"
      );
    } else if (downloadedCount > 0 && failedCount > 0) {
      this.setStatus(
        `✓ ${downloadedCount} version${downloadedCount === 1 ? " is" : "s are"} ready. ${failedCount} could not be downloaded.`,
        "#d32f2f"
      );
    } else {
      this.setStatus(
        "No versions were downloaded. Please try again while connected to the internet.",
        "#d32f2f"
      );
    }

    if (this.ui.progressLabel) {
      this.ui.progressLabel.textContent =
        failedCount === 0
          ? "Download complete"
          : "Download finished with errors";
    }

    window.setTimeout(() => {
      if (this.ui.progressBar) {
        this.ui.progressBar.style.display = "none";
      }
    }, 2500);

    if (this.ui.downloadButton) {
      this.ui.downloadButton.disabled = false;
    }
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
        `https://api.scripture.api.bible/v1/bibles/${encodeURIComponent(
          bibleId
        )}?include-full-details=true`,
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
