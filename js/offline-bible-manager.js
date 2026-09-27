"use strict";

/*
 * Offline Bible Manager UI
 *
 * Host-independent modal UI for downloading and removing Bible data.
 * The current home page provides the launch button, but the modal is injected
 * by this module so it can later be opened from the unified Study Desk shell.
 */

window.OfflineBibleManagerUI = (() => {
  const elements = {};
  let initialized = false;
  let isLocked = false;
  let selectedBibleLabel = "";

  function createMarkup() {
    if (
      document.getElementById(
        "offline-bible-modal"
      )
    ) {
      return;
    }

    const modal =
      document.createElement("div");

    modal.id = "offline-bible-modal";
    modal.className = "offline-bible-modal";
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
      <div
        class="offline-bible-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="offline-bible-title"
      >
        <button
          type="button"
          id="offline-bible-close"
          class="offline-bible-close"
          aria-label="Close Offline Bibles"
        >&times;</button>

        <div class="offline-bible-heading">
          <div>
            <p class="offline-bible-eyebrow">Available on this device</p>
            <h2 id="offline-bible-title">Offline Bibles</h2>
          </div>
        </div>

        <p class="offline-bible-intro">
          Download a Bible to this device. Only one Bible downloads at a time,
          and completed Bibles remain until you remove them.
        </p>

        <div class="offline-bible-form">
          <label class="offline-bible-field" for="offline-bible-language">
            <span>Language</span>
            <select id="offline-bible-language"></select>
          </label>

          <label class="offline-bible-field" for="offline-bible-version">
            <span>Bible</span>
            <select id="offline-bible-version" disabled>
              <option value="">Loading Bibles...</option>
            </select>
          </label>

          <button
            type="button"
            id="offline-bible-download"
            class="offline-bible-button offline-bible-button-primary"
            disabled
          >
            <i class="fa fa-download" aria-hidden="true"></i>
            <span>Download Bible</span>
          </button>
        </div>

        <div
          id="offline-bible-progress-panel"
          class="offline-bible-progress-panel"
          hidden
        >
          <div class="offline-bible-progress-heading">
            <strong id="offline-bible-progress-title">Preparing download...</strong>
            <span id="offline-bible-progress-percent">0%</span>
          </div>

          <progress
            id="offline-bible-progress"
            max="100"
            value="0"
          ></progress>

          <p
            id="offline-bible-progress-detail"
            class="offline-bible-progress-detail"
          ></p>

          <button
            type="button"
            id="offline-bible-cancel"
            class="offline-bible-button offline-bible-button-danger"
          >
            Cancel Download
          </button>
        </div>

        <div
          id="offline-bible-status"
          class="offline-bible-status"
          aria-live="polite"
        ></div>

        <section class="offline-bible-ready-section">
          <div class="offline-bible-section-heading">
            <h3>Downloaded on this device</h3>
          </div>

          <div
            id="offline-bible-ready-list"
            class="offline-bible-ready-list"
          ></div>
        </section>
      </div>
    `;

    document.body.appendChild(modal);
  }

  function cacheElements() {
    elements.trigger =
      document.getElementById(
        "offline-bibles-action"
      );

    elements.modal =
      document.getElementById(
        "offline-bible-modal"
      );

    elements.dialog =
      elements.modal?.querySelector(
        ".offline-bible-dialog"
      );

    elements.close =
      document.getElementById(
        "offline-bible-close"
      );

    elements.language =
      document.getElementById(
        "offline-bible-language"
      );

    elements.bible =
      document.getElementById(
        "offline-bible-version"
      );

    elements.download =
      document.getElementById(
        "offline-bible-download"
      );

    elements.progressPanel =
      document.getElementById(
        "offline-bible-progress-panel"
      );

    elements.progress =
      document.getElementById(
        "offline-bible-progress"
      );

    elements.progressTitle =
      document.getElementById(
        "offline-bible-progress-title"
      );

    elements.progressPercent =
      document.getElementById(
        "offline-bible-progress-percent"
      );

    elements.progressDetail =
      document.getElementById(
        "offline-bible-progress-detail"
      );

    elements.cancel =
      document.getElementById(
        "offline-bible-cancel"
      );

    elements.status =
      document.getElementById(
        "offline-bible-status"
      );

    elements.readyList =
      document.getElementById(
        "offline-bible-ready-list"
      );
  }

  function setStatus(message = "", type = "") {
    if (!elements.status) return;

    elements.status.textContent = message;
    elements.status.className =
      "offline-bible-status";

    if (type) {
      elements.status.classList.add(
        `offline-bible-status-${type}`
      );
    }
  }

  function setLocked(locked) {
    isLocked = Boolean(locked);

    if (elements.modal) {
      elements.modal.dataset.locked =
        isLocked ? "true" : "false";
    }

    if (elements.close) {
      elements.close.disabled = isLocked;
      elements.close.hidden = isLocked;
    }

    if (elements.language) {
      elements.language.disabled = isLocked;
    }

    if (elements.bible) {
      elements.bible.disabled =
        isLocked ||
        !elements.bible.options.length;
    }

    if (elements.download) {
      elements.download.disabled =
        isLocked ||
        !elements.bible?.value;
    }

    elements.readyList
      ?.querySelectorAll("button")
      .forEach((button) => {
        button.disabled = isLocked;
      });
  }

  function openModal() {
    if (!elements.modal) return;

    elements.modal.hidden = false;
    elements.modal.setAttribute(
      "aria-hidden",
      "false"
    );

    document.body.classList.add(
      "offline-bible-is-open"
    );

    refreshReadyBibles();
    recoverInterruptedDownloads();

    if (
      !elements.bible?.options.length ||
      elements.bible.disabled
    ) {
      populateBibles();
    }

    window.setTimeout(() => {
      elements.language?.focus();
    }, 0);
  }

  function closeModal() {
    if (!elements.modal || isLocked) {
      return;
    }

    elements.modal.hidden = true;
    elements.modal.setAttribute(
      "aria-hidden",
      "true"
    );

    document.body.classList.remove(
      "offline-bible-is-open"
    );

    elements.trigger?.focus();
  }

  function populateLanguages() {
    const languageOptions =
      window.BibleSelector?.languageOptions ||
      [];

    elements.language.innerHTML = "";

    languageOptions.forEach((language) => {
      const option =
        document.createElement("option");

      option.value = language.apiUrl;
      option.textContent = language.label;

      elements.language.appendChild(option);
    });

    const saved =
      window.BibleSelector?.getSavedLanguage?.();

    if (
      saved?.apiUrl &&
      Array.from(
        elements.language.options
      ).some(
        (option) =>
          option.value === saved.apiUrl
      )
    ) {
      elements.language.value =
        saved.apiUrl;
    }
  }

  function preferredBibleId() {
    try {
      return (
        window.UserPreferences
          ?.getPreferredBibleState?.()
          ?.bibleId ||
        window.UserPreferences
          ?.read?.()
          ?.bibleId ||
        ""
      );
    } catch {
      return "";
    }
  }

  async function populateBibles() {
    const apiUrl =
      elements.language?.value;

    if (!apiUrl) {
      return;
    }

    elements.bible.disabled = true;
    elements.download.disabled = true;
    elements.bible.innerHTML =
      '<option value="">Loading Bibles...</option>';

    setStatus("");

    try {
      const bibles =
        await window.BibleSelector.loadBibles(
          apiUrl,
          { useCache: false }
        );

      elements.bible.innerHTML =
        '<option value="">Choose a Bible...</option>';

      bibles.forEach((bible) => {
        const option =
          document.createElement("option");

        option.value = bible.id;
        option.textContent =
          window.BibleSelector.getBibleOptionLabel(
            bible
          );

        option.dataset.abbreviation =
          window.BibleSelector.getBibleAbbreviation(
            bible
          );

        option.dataset.name =
          window.BibleSelector.getBibleTitle(
            bible
          );

        elements.bible.appendChild(option);
      });

      const preferred =
        preferredBibleId();

      if (
        preferred &&
        Array.from(
          elements.bible.options
        ).some(
          (option) =>
            option.value === preferred
        )
      ) {
        elements.bible.value =
          preferred;
      }

      elements.bible.disabled = false;
      await updateDownloadButton();
    } catch (error) {
      console.error(
        "Could not load offline Bible choices:",
        error
      );

      elements.bible.innerHTML =
        '<option value="">Bible list unavailable</option>';

      setStatus(
        "Could not load the Bible list. Check your connection and try again.",
        "error"
      );
    }
  }

  async function updateDownloadButton() {
    if (
      !elements.download ||
      !elements.bible
    ) {
      return;
    }

    const bibleId =
      elements.bible.value;

    if (!bibleId || isLocked) {
      elements.download.disabled = true;
      return;
    }

    const ready =
      await window.BibleOfflineDB.getReadyBible(
        bibleId
      );

    if (ready) {
      elements.download.disabled = true;
      elements.download
        .querySelector("span")
        .textContent = "Already Downloaded";
      return;
    }

    elements.download.disabled = false;
    elements.download
      .querySelector("span")
      .textContent = "Download Bible";
  }

  function formatDate(value) {
    if (!value) return "";

    const date = new Date(value);

    if (
      Number.isNaN(date.getTime())
    ) {
      return "";
    }

    return new Intl.DateTimeFormat(
      undefined,
      {
        year: "numeric",
        month: "short",
        day: "numeric"
      }
    ).format(date);
  }

  async function refreshReadyBibles() {
    if (!elements.readyList) return;

    try {
      const bibles =
        await window.BibleOfflineDB.getReadyBibles();

      elements.readyList.innerHTML = "";

      if (!bibles.length) {
        const empty =
          document.createElement("p");

        empty.className =
          "offline-bible-empty";
        empty.textContent =
          "No Bibles downloaded yet.";

        elements.readyList.appendChild(
          empty
        );

        await updateDownloadButton();
        return;
      }

      bibles.forEach((bible) => {
        const row =
          document.createElement("div");

        row.className =
          "offline-bible-ready-item";

        const copy =
          document.createElement("div");

        copy.className =
          "offline-bible-ready-copy";

        const title =
          document.createElement("strong");

        title.textContent =
          bible.abbreviation ||
          bible.name ||
          bible.id;

        const subtitle =
          document.createElement("span");

        const details = [];

        if (
          bible.name &&
          bible.name !== title.textContent
        ) {
          details.push(bible.name);
        }

        if (bible.totalChapters) {
          details.push(
            `${bible.totalChapters} chapters`
          );
        }

        if (bible.downloadedAt) {
          details.push(
            `Downloaded ${formatDate(
              bible.downloadedAt
            )}`
          );
        }

        subtitle.textContent =
          details.join(" • ");

        copy.append(title, subtitle);

        const remove =
          document.createElement("button");

        remove.type = "button";
        remove.className =
          "offline-bible-remove";
        remove.textContent = "Remove";

        remove.addEventListener(
          "click",
          async () => {
            if (isLocked) return;

            const label =
              bible.abbreviation ||
              bible.name ||
              "this Bible";

            const confirmed =
              window.confirm(
                `Remove ${label} from this device?\n\nThis removes only the downloaded Bible. Your notes, studies, Keywords, and annotations are not affected.`
              );

            if (!confirmed) {
              return;
            }

            remove.disabled = true;

            try {
              await window.BibleDownloadManager.removeBible(
                bible.id
              );

              setStatus(
                `${label} was removed from this device.`,
                "success"
              );

              await refreshReadyBibles();
            } catch (error) {
              console.error(
                "Could not remove downloaded Bible:",
                error
              );

              setStatus(
                "Could not remove this Bible. Please try again.",
                "error"
              );

              remove.disabled = false;
            }
          }
        );

        row.append(copy, remove);
        elements.readyList.appendChild(row);
      });

      setLocked(isLocked);
      await updateDownloadButton();
    } catch (error) {
      console.error(
        "Could not load downloaded Bibles:",
        error
      );

      elements.readyList.innerHTML =
        '<p class="offline-bible-empty">Could not read downloaded Bibles.</p>';
    }
  }

  async function recoverInterruptedDownloads() {
    try {
      const result =
        await window.BibleDownloadManager.cleanupInterruptedDownloads();

      if (result.cleaned.length) {
        setStatus(
          "An incomplete earlier download was removed safely.",
          "info"
        );

        await refreshReadyBibles();
      }

      if (
        result.activeElsewhere.length
      ) {
        const job =
          result.activeElsewhere[0];

        setStatus(
          `${
            job.abbreviation ||
            job.bibleName ||
            "A Bible"
          } is currently downloading in another tab.`,
          "info"
        );
      }
    } catch (error) {
      console.warn(
        "Could not check interrupted Bible downloads:",
        error
      );
    }
  }

  function resetProgress() {
    elements.progress.value = 0;
    elements.progressTitle.textContent =
      "Preparing download...";
    elements.progressPercent.textContent =
      "0%";
    elements.progressDetail.textContent =
      "";
  }

  function showProgress() {
    elements.progressPanel.hidden = false;
    resetProgress();
  }

  function hideProgress() {
    elements.progressPanel.hidden = true;
  }

  function updateProgress(detail = {}) {
    showProgress();

    const percent =
      Number.isFinite(Number(detail.percent))
        ? Math.max(
            0,
            Math.min(
              100,
              Number(detail.percent)
            )
          )
        : 0;

    elements.progress.value = percent;
    elements.progressPercent.textContent =
      `${Math.floor(percent)}%`;

    const label =
      detail.abbreviation ||
      selectedBibleLabel ||
      "Bible";

    if (detail.phase === "verifying") {
      elements.progressTitle.textContent =
        `Verifying ${label}`;
    } else if (
      detail.phase === "preparing"
    ) {
      elements.progressTitle.textContent =
        `Preparing ${label}`;
    } else {
      elements.progressTitle.textContent =
        `Downloading ${label}`;
    }

    if (detail.message) {
      elements.progressDetail.textContent =
        detail.message;
      return;
    }

    const parts = [];

    if (detail.currentChapterReference) {
      parts.push(
        detail.currentChapterReference
      );
    }

    if (
      detail.completedChapters &&
      detail.totalChapters
    ) {
      parts.push(
        `${detail.completedChapters} of ${detail.totalChapters} chapters`
      );
    }

    elements.progressDetail.textContent =
      parts.join(" • ");
  }

  async function beginDownload() {
    const bibleId =
      elements.bible?.value;

    if (!bibleId) {
      setStatus(
        "Choose a Bible to download.",
        "error"
      );
      return;
    }

    const selectedOption =
      elements.bible.options[
        elements.bible.selectedIndex
      ];

    selectedBibleLabel =
      selectedOption?.dataset
        ?.abbreviation ||
      selectedOption?.textContent ||
      "Bible";

    setLocked(true);
    showProgress();
    setStatus(
      `Keep this window open while ${selectedBibleLabel} downloads.`,
      "info"
    );

    try {
      const result =
        await window.BibleDownloadManager.startDownload(
          bibleId
        );

      if (result?.cancelled) {
        hideProgress();

        setStatus(
          `${selectedBibleLabel} download cancelled. Only the incomplete ${selectedBibleLabel} data was removed.`,
          "info"
        );
      } else {
        elements.progress.value = 100;
        elements.progressPercent.textContent =
          "100%";
        elements.progressTitle.textContent =
          `${selectedBibleLabel} is ready`;
        elements.progressDetail.textContent =
          `${result.counts.chapters} chapters • ${result.counts.verses} verses stored`;

        setStatus(
          `${selectedBibleLabel} is ready on this device.`,
          "success"
        );
      }
    } catch (error) {
      console.error(
        "Bible download failed:",
        error
      );

      hideProgress();

      if (
        error?.code ===
        "DOWNLOAD_ACTIVE_OTHER_TAB"
      ) {
        setStatus(
          error.message,
          "info"
        );
      } else if (
        error?.code ===
        "BIBLE_ALREADY_READY"
      ) {
        setStatus(
          error.message,
          "info"
        );
      } else {
        setStatus(
          `The ${selectedBibleLabel} download could not be completed. Its incomplete data was removed. ${
            error?.message || ""
          }`.trim(),
          "error"
        );
      }
    } finally {
      setLocked(false);
      await refreshReadyBibles();
    }
  }

  function bindEvents() {
    elements.trigger?.addEventListener(
      "click",
      openModal
    );

    elements.close?.addEventListener(
      "click",
      closeModal
    );

    elements.modal?.addEventListener(
      "click",
      (event) => {
        if (
          event.target === elements.modal &&
          !isLocked
        ) {
          closeModal();
        }
      }
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key === "Escape" &&
          !elements.modal?.hidden &&
          !isLocked
        ) {
          closeModal();
        }
      }
    );

    elements.language?.addEventListener(
      "change",
      populateBibles
    );

    elements.bible?.addEventListener(
      "change",
      updateDownloadButton
    );

    elements.download?.addEventListener(
      "click",
      beginDownload
    );

    elements.cancel?.addEventListener(
      "click",
      () => {
        if (
          !window.BibleDownloadManager.cancelActiveDownload()
        ) {
          return;
        }

        elements.cancel.disabled = true;
        elements.progressTitle.textContent =
          `Cancelling ${selectedBibleLabel}`;
        elements.progressDetail.textContent =
          `Removing only the incomplete ${selectedBibleLabel} download...`;

        setStatus(
          "Cancelling download safely...",
          "info"
        );
      }
    );

    window.addEventListener(
      "bible-download-progress",
      (event) => {
        updateProgress(
          event.detail || {}
        );
      }
    );

    window.addEventListener(
      "bible-download-cancelling",
      () => {
        elements.cancel.disabled = true;
      }
    );

    window.addEventListener(
      "bible-download-complete",
      () => {
        elements.cancel.disabled = false;
      }
    );

    window.addEventListener(
      "bible-download-cancelled",
      () => {
        elements.cancel.disabled = false;
      }
    );

    window.addEventListener(
      "bible-download-error",
      () => {
        elements.cancel.disabled = false;
      }
    );
  }

  function initialize() {
    if (initialized) return;

    if (
      !window.BibleOfflineDB ||
      !window.BibleData ||
      !window.BibleSelector ||
      !window.BibleDownloadManager
    ) {
      console.error(
        "Offline Bible Manager could not start because a required Bible module is unavailable."
      );
      return;
    }

    createMarkup();
    cacheElements();
    populateLanguages();
    bindEvents();
    refreshReadyBibles();
    recoverInterruptedDownloads();

    initialized = true;
  }

  document.addEventListener(
    "DOMContentLoaded",
    initialize
  );

  return Object.freeze({
    open: openModal,
    close: closeModal,
    refresh: refreshReadyBibles
  });
})();
