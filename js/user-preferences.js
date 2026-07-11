"use strict";

/*
 * Shared user-preference service.
 *
 * Visible preferences:
 * 1. Preferred language
 * 2. Preferred Bible
 * 3. Starting page (Home or Reading)
 *
 * The last opened passage is remembered automatically for Reading-page startup,
 * but it is not a visible preference and never changes the preferred Bible.
 */

window.UserPreferences = (() => {
  const STORAGE_KEY = "branchOfIsraelPreferences";

  const DEFAULTS = {
    languageApiUrl: "",
    languageName: "All",
    bibleId: "",
    bibleAbbr: "",
    bibleName: "",
    landingPage: "index",
    freehandWarningEnabled: true,
    lastPassage: null
  };

  function read() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const legacyFreehandWarningHidden =
        localStorage.getItem("boi-hide-freehand-warning") === "true";

      return {
        ...DEFAULTS,
        ...saved,
        freehandWarningEnabled:
          typeof saved.freehandWarningEnabled === "boolean"
            ? saved.freehandWarningEnabled
            : !legacyFreehandWarningHidden,
        lastPassage: saved.lastPassage || null
      };
    } catch (error) {
      console.warn("Unable to read preferences:", error);
      return { ...DEFAULTS };
    }
  }

  function write(nextPreferences) {
    const current = read();
    const merged = {
      ...current,
      ...nextPreferences
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  }

  function getPreferredLanguage() {
    const preferences = read();
    const options = window.BibleSelector?.languageOptions || [];

    return (
      options.find((item) => item.apiUrl === preferences.languageApiUrl) ||
      window.BibleSelector?.getSavedLanguage?.() ||
      options[0] ||
      null
    );
  }

  function getPreferredBibleState() {
    const preferences = read();

    return {
      bibleId: preferences.bibleId || "",
      bibleAbbr: preferences.bibleAbbr || "",
      bibleName: preferences.bibleName || "",
      bookId: "",
      bookName: "",
      chapterId: ""
    };
  }

  function rememberCurrentPassage() {
    if (!/verse\.html$/i.test(window.location.pathname)) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const bibleId = params.get("bible") || params.get("version") || "";
    const bookId = params.get("book") || "";
    const chapterId = params.get("chapter") || "";

    if (!bibleId || !bookId || !chapterId) {
      return;
    }

    write({
      lastPassage: {
        bibleId,
        bibleAbbr: params.get("bibleAbbr") || params.get("abbr") || "",
        bibleName: params.get("bibleName") || "",
        bookId,
        bookName: params.get("bookName") || params.get("name") || "",
        chapterId
      }
    });
  }

  async function buildReadingStartUrl() {
    const preferences = read();
    const preferredBibleId = preferences.bibleId;

    if (!preferredBibleId || !window.BibleSelector) {
      return "";
    }

    const remembered = preferences.lastPassage;

    if (
      remembered?.bibleId === preferredBibleId &&
      remembered.bookId &&
      remembered.chapterId
    ) {
      const url = new URL("verse.html", window.location.href);
      url.searchParams.set("bible", remembered.bibleId);
      url.searchParams.set("bibleAbbr", preferences.bibleAbbr || remembered.bibleAbbr || "");
      url.searchParams.set("bibleName", preferences.bibleName || remembered.bibleName || "");
      url.searchParams.set("book", remembered.bookId);
      url.searchParams.set("bookName", remembered.bookName || remembered.bookId);
      url.searchParams.set("chapter", remembered.chapterId);
      return url.toString();
    }

    const books = await window.BibleSelector.loadBooks(preferredBibleId);
    const firstBook = books[0];

    if (!firstBook) {
      return "";
    }

    const chapters = await window.BibleSelector.loadChapters(
      preferredBibleId,
      firstBook.id
    );
    const firstChapter = chapters[0];

    if (!firstChapter) {
      return "";
    }

    return window.BibleSelector.buildVerseUrl({
      bible: {
        id: preferredBibleId,
        abbreviation: preferences.bibleAbbr,
        name: preferences.bibleName
      },
      book: firstBook,
      chapterId: firstChapter.id
    });
  }

  async function redirectFromIndexIfNeeded() {
    if (!/index\.html$|\/$/i.test(window.location.pathname)) {
      return false;
    }

    const params = new URLSearchParams(window.location.search);

    if (params.get("stay") === "home") {
      return false;
    }

    const preferences = read();

    if (preferences.landingPage !== "verse" || !preferences.bibleId) {
      return false;
    }

    try {
      const destination = await buildReadingStartUrl();

      if (destination) {
        window.location.replace(destination);
        return true;
      }
    } catch (error) {
      console.error("Unable to open preferred reading page:", error);
    }

    return false;
  }

  function setModalOpen(isOpen) {
    const modal = document.getElementById("preferencesModal");

    if (!modal) {
      return;
    }

    modal.style.display = isOpen ? "flex" : "none";
    modal.classList.toggle("is-open", isOpen);
    document.body.classList.toggle("preferences-is-open", isOpen);

    if (isOpen) {
      document.getElementById("preferences-language")?.focus();
    }
  }

  function setStatus(message, isError = false) {
    const status = document.getElementById("preferences-status");

    if (!status) {
      return;
    }

    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  async function populateBibleOptions(apiUrl, selectedBibleId = "") {
    const bibleSelect = document.getElementById("preferences-bible");

    if (!bibleSelect) {
      return;
    }

    bibleSelect.disabled = true;
    bibleSelect.innerHTML = '<option value="">Loading Bibles...</option>';

    try {
      const bibles = await window.BibleSelector.loadBibles(apiUrl);
      bibleSelect.innerHTML = '<option value="">Select a Bible...</option>';

      bibles.forEach((bible) => {
        const option = document.createElement("option");
        option.value = bible.id;
        option.textContent = window.BibleSelector.getBibleAbbreviation(bible);
        option.dataset.name = window.BibleSelector.getBibleTitle(bible);
        option.dataset.abbr = window.BibleSelector.getBibleAbbreviation(bible);
        option.title = window.BibleSelector.getBibleTooltip(bible);
        bibleSelect.appendChild(option);
      });

      bibleSelect.disabled = false;
      bibleSelect.value = bibles.some((bible) => bible.id === selectedBibleId)
        ? selectedBibleId
        : "";
    } catch (error) {
      console.error("Unable to load preference Bibles:", error);
      bibleSelect.innerHTML = '<option value="">Unable to load Bibles</option>';
      setStatus("Unable to load Bible choices. Please try again.", true);
    }
  }

  async function openModal() {
    const languageSelect = document.getElementById("preferences-language");
    const landingSelect = document.getElementById("preferences-landing-page");
    const freehandWarningCheckbox = document.getElementById(
      "preferences-freehand-warning"
    );

    if (!languageSelect || !landingSelect || !window.BibleSelector) {
      return;
    }

    const preferences = read();
    const languages = window.BibleSelector.languageOptions || [];
    const preferredLanguage = getPreferredLanguage() || languages[0];

    languageSelect.innerHTML = "";

    languages.forEach((language) => {
      const option = document.createElement("option");
      option.value = language.apiUrl;
      option.textContent = language.label;
      languageSelect.appendChild(option);
    });

    languageSelect.value = preferredLanguage?.apiUrl || "";
    landingSelect.value = preferences.landingPage === "verse" ? "verse" : "index";

    if (freehandWarningCheckbox) {
      freehandWarningCheckbox.checked = preferences.freehandWarningEnabled !== false;
    }

    setStatus("");
    setModalOpen(true);

    await populateBibleOptions(languageSelect.value, preferences.bibleId);
  }

  async function saveFromModal() {
    const languageSelect = document.getElementById("preferences-language");
    const bibleSelect = document.getElementById("preferences-bible");
    const landingSelect = document.getElementById("preferences-landing-page");
    const freehandWarningCheckbox = document.getElementById(
      "preferences-freehand-warning"
    );

    if (!languageSelect || !bibleSelect || !landingSelect) {
      return;
    }

    if (!bibleSelect.value) {
      setStatus("Please select a preferred Bible.", true);
      bibleSelect.focus();
      return;
    }

    const selectedLanguage = languageSelect.options[languageSelect.selectedIndex];
    const selectedBible = bibleSelect.options[bibleSelect.selectedIndex];

    const savedPreferences = write({
      languageApiUrl: languageSelect.value,
      languageName: selectedLanguage?.textContent || "",
      bibleId: bibleSelect.value,
      bibleAbbr: selectedBible?.dataset.abbr || selectedBible?.textContent || "",
      bibleName: selectedBible?.dataset.name || selectedBible?.textContent || "",
      landingPage: landingSelect.value === "verse" ? "verse" : "index",
      freehandWarningEnabled: freehandWarningCheckbox
        ? freehandWarningCheckbox.checked
        : read().freehandWarningEnabled
    });

    window.BibleSelector.saveLanguage(
      languageSelect.value,
      selectedLanguage?.textContent || ""
    );

    window.dispatchEvent(
      new CustomEvent("bible-preferences-changed", {
        detail: {
          languageApiUrl: savedPreferences.languageApiUrl,
          languageName: savedPreferences.languageName,
          bibleId: savedPreferences.bibleId,
          bibleAbbr: savedPreferences.bibleAbbr,
          bibleName: savedPreferences.bibleName,
          landingPage: savedPreferences.landingPage,
          freehandWarningEnabled: savedPreferences.freehandWarningEnabled
        }
      })
    );

    setStatus("Preferences saved.");

    window.setTimeout(() => {
      setModalOpen(false);
    }, 450);
  }

  function initializeModal() {
    const modal = document.getElementById("preferencesModal");

    if (!modal) {
      return;
    }

    const languageSelect = document.getElementById("preferences-language");
    const openButtons = document.querySelectorAll(
      "#openPreferences, [data-open-preferences]"
    );

    openButtons.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        window.closeNav?.();
        openModal();
      });
    });

    document.getElementById("closePreferences")?.addEventListener("click", () => {
      setModalOpen(false);
    });

    document.getElementById("cancelPreferences")?.addEventListener("click", () => {
      setModalOpen(false);
    });

    document.getElementById("savePreferences")?.addEventListener("click", saveFromModal);

    languageSelect?.addEventListener("change", () => {
      setStatus("");
      populateBibleOptions(languageSelect.value, "");
    });

    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        setModalOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal.style.display !== "none") {
        setModalOpen(false);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    rememberCurrentPassage();
    initializeModal();
  });

  return {
    read,
    write,
    getPreferredLanguage,
    getPreferredBibleState,
    rememberCurrentPassage,
    buildReadingStartUrl,
    redirectFromIndexIfNeeded,
    openModal
  };
})();
