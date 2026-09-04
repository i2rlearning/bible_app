/** * OFFLINE MANAGER - USER INTERFACE & DOWNLOAD LOGIC * Includes: * -
Offline button * - Bible version search * - Language filtering (All /
English / Greek / Hebrew) * - Hidden version filtering * - Download
selection */

class OfflineManager { constructor() { this.availableVersions = [];
this.filteredVersions = []; this.downloading = new Set(); this.ui = {};
this.button = null; this.selectedLanguage = “all”; this.searchTerm = ““;
this.initialized = false; this.init(); }

async init() { if (this.initialized) return; this.initialized = true;

    await this.loadAvailableVersions();
    this.createModal();
    this.addButtonToPage();
    this.setupEventListeners();

}

async loadAvailableVersions() { try { const apiKey = typeof API_KEY !==
“undefined” ? API_KEY : null;

      if (!apiKey) throw new Error("API key missing");

      const response = await fetch(
        "https://api.scripture.api.bible/v1/bibles",
        {
          headers: {
            "api-key": apiKey
          }
        }
      );

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();

      const hidden = window.HiddenBibleVersions || [];

      this.availableVersions = data.data
        .filter(v => !hidden.includes(v.id))
        .map(v => ({
          id: v.id,
          name: v.name,
          abbreviation: v.abbreviation || "",
          language: (v.language?.name || "").toLowerCase()
        }));

      this.filteredVersions = [...this.availableVersions];

      console.log("[Offline] Loaded", this.availableVersions.length);
    } catch (e) {
      console.error("[Offline] Loading failed", e);
      this.availableVersions = [];
      this.filteredVersions = [];
    }

}

createModal() { if (document.getElementById(“offline-modal”)) return;

    document.body.insertAdjacentHTML("beforeend", `
      <div id="offline-modal" class="modal" style="display:none;">
        <div class="modal-content offline-modal-content">

          <button id="close-offline-modal" class="modal-close">&times;</button>

          <h2>Offline Bible Setup</h2>
          <p>Select Bible versions to download for offline use. You can download up to 3 versions.</p>

          <input id="offline-search"
                 class="offline-search"
                 placeholder="Search Bible versions...">

          <select id="offline-language-filter">
            <option value="all">All Languages</option>
            <option value="english">English</option>
            <option value="greek">Greek</option>
            <option value="hebrew">Hebrew</option>
          </select>

          <div id="offline-versions-list"></div>

          <div id="offline-progress" style="display:none;">
            <div id="offline-progress-bar"></div>
          </div>

          <div id="offline-status"></div>

          <button id="download-selected" class="btn btn-primary">
            Download Selected
          </button>

          <button id="close-offline-btn" class="btn btn-secondary">
            Close
          </button>

        </div>
      </div>
    `);

    this.ui.modal = document.getElementById("offline-modal");
    this.ui.versionList = document.getElementById("offline-versions-list");
    this.ui.closeButton = document.getElementById("close-offline-modal");
    this.ui.search = document.getElementById("offline-search");
    this.ui.language = document.getElementById("offline-language-filter");
    this.ui.statusText = document.getElementById("offline-status");

}

addButtonToPage() { if (document.getElementById(“toggle-offline-mode”))
return;

    this.button = document.createElement("button");
    this.button.id = "toggle-offline-mode";
    this.button.type = "button";
    this.button.className = "offline-toggle-btn auth-button";
    this.button.textContent = "Offline";

    const header =
      document.querySelector(".landing-header-actions") ||
      document.querySelector(".header-actions") ||
      document.querySelector("header");

    if (header) {
      header.appendChild(this.button);
    } else {
      document.body.prepend(this.button);
    }

}

setupEventListeners() { this.button?.addEventListener(“click”, () =>
this.showModal());

    this.ui.closeButton?.addEventListener(
      "click",
      () => this.hideModal()
    );

    document.getElementById("close-offline-btn")
      ?.addEventListener("click", () => this.hideModal());

    this.ui.search.addEventListener("input", e => {
      this.searchTerm = e.target.value.toLowerCase();
      this.renderVersionList();
    });

    this.ui.language.addEventListener("change", e => {
      this.selectedLanguage = e.target.value;
      this.renderVersionList();
    });

    document.getElementById("download-selected")
      ?.addEventListener("click", () => this.downloadSelectedVersions());

}

showModal() { this.renderVersionList(); this.ui.modal.style.display =
“flex”; }

hideModal() { this.ui.modal.style.display = “none”; }

renderVersionList() { if (!this.ui.versionList) return;

    let versions = this.availableVersions.filter(v => {

      const text = `${v.name} ${v.abbreviation}`.toLowerCase();

      const matchesSearch =
        !this.searchTerm || text.includes(this.searchTerm);

      const lang = v.language;

      const matchesLanguage =
        this.selectedLanguage === "all" ||
        lang.includes(this.selectedLanguage);

      return matchesSearch && matchesLanguage;
    });

    this.ui.versionList.innerHTML =
      versions.map(v => `
        <label class="version-item">
          <input type="checkbox"
                 name="bible-version"
                 value="${v.id}">
          <span>${v.name}</span>
          <span>(${v.abbreviation})</span>
        </label>
      `).join("") || "<p>No versions found</p>";

}

async downloadSelectedVersions() { const selected =
[…document.querySelectorAll( “#offline-versions-list input:checked”
)].map(x => x.value);

    if (selected.length === 0) {
      this.ui.statusText.textContent =
        "Please select a version.";
      return;
    }

    if (selected.length > 3) {
      this.ui.statusText.textContent =
        "Maximum 3 versions allowed.";
      return;
    }

    this.ui.statusText.textContent =
      "Downloading...";

} }

window.OfflineManager = OfflineManager;
