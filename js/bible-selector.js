"use strict";

/*
 * Shared Bible selector data service.
 *
 * This file intentionally contains no page-specific layout code.
 * Both index.html and verse.html can use the same language, Bible,
 * book, chapter, URL, caching, and chapter-boundary logic.
 *
 * Load js/my_key.js before this file so API_KEY is available.
 */

window.BibleSelector = (() => {
  const API_BASE_URL =
    "https://api.scripture.api.bible/v1";

  const STORAGE_KEYS = {
    languageApiUrl: "selectedBibleApi",
    languageName: "selectedLanguageName"
  };

  const languageOptions = [
    {
      label: "All",
      apiUrl:
        `${API_BASE_URL}/bibles?include-full-details=false`
    },
    {
      label: "English",
      apiUrl:
        "https://rest.api.bible/v1/bibles?language=eng&include-full-details=true"
    },
    {
      label: "Greek",
      apiUrl:
        `${API_BASE_URL}/bibles?language=grc&include-full-details=false`
    },
    {
      label: "Hebrew",
      apiUrl:
        `${API_BASE_URL}/bibles?ids=a8a97eebae3c98e4-01%2C%202c500771ea16da93-01%2C%200b262f1ed7f084a6-01&include-full-details=false`
    }
  ];

  const cache = {
    biblesByApiUrl: new Map(),
    booksByBibleId: new Map(),
    chaptersByBibleAndBook: new Map()
  };

  function getApiKey() {
    if (
      typeof API_KEY === "undefined" ||
      !API_KEY
    ) {
      throw new Error(
        "API_KEY is unavailable. Load js/my_key.js before js/bible-selector.js."
      );
    }

    return API_KEY;
  }

  async function requestJson(url) {
    const response = await fetch(
      url,
      {
        headers: {
          "api-key": getApiKey()
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        `API.Bible request failed with status ${response.status}.`
      );
    }

    return response.json();
  }

  function getDefaultLanguage() {
    return languageOptions[0];
  }

  function getSavedLanguage() {
    const savedApiUrl =
      localStorage.getItem(
        STORAGE_KEYS.languageApiUrl
      );

    const matchedLanguage =
      languageOptions.find(
        (language) =>
          language.apiUrl === savedApiUrl
      );

    return (
      matchedLanguage ||
      getDefaultLanguage()
    );
  }

  function saveLanguage(
    apiUrl,
    languageName
  ) {
    localStorage.setItem(
      STORAGE_KEYS.languageApiUrl,
      apiUrl
    );

    localStorage.setItem(
      STORAGE_KEYS.languageName,
      languageName
    );
  }

  function getBibleAbbreviation(bible) {
    return (
      bible?.abbreviation ||
      bible?.abbreviationLocal ||
      bible?.name ||
      bible?.nameLocal ||
      bible?.id ||
      ""
    );
  }

  function getBibleTitle(bible) {
    return (
      bible?.name ||
      bible?.nameLocal ||
      bible?.abbreviation ||
      bible?.abbreviationLocal ||
      bible?.id ||
      ""
    );
  }

  function getBibleDescription(bible) {
    return (
      bible?.description ||
      bible?.descriptionLocal ||
      ""
    );
  }

  function getBibleTooltip(bible) {
    const title =
      getBibleTitle(bible).trim();

    const description =
      getBibleDescription(bible).trim();

    if (!description) {
      return title;
    }

    if (
      description.toLowerCase() ===
      title.toLowerCase()
    ) {
      return title;
    }

    return `${title} (${description})`;
  }

  function getBibleOptionLabel(bible) {
    return getBibleTooltip(bible);
  }

  function getBookName(book) {
    return (
      book?.name ||
      book?.nameLong ||
      book?.abbreviation ||
      book?.id ||
      ""
    );
  }

  function getChapterLabel(chapter) {
    return (
      chapter?.number ||
      chapter?.id?.split(".").pop() ||
      chapter?.id ||
      ""
    );
  }

  async function loadBibles(
    apiUrl =
      getSavedLanguage().apiUrl,
    options = {}
  ) {
    const useCache =
      options.useCache !== false;

    if (
      useCache &&
      cache.biblesByApiUrl.has(apiUrl)
    ) {
      return cache.biblesByApiUrl.get(
        apiUrl
      );
    }

    const result =
      await requestJson(apiUrl);

    const bibles =
      Array.isArray(result.data)
        ? [...result.data]
        : [];

    bibles.sort(
      (a, b) =>
        getBibleAbbreviation(a).localeCompare(
          getBibleAbbreviation(b)
        )
    );

    cache.biblesByApiUrl.set(
      apiUrl,
      bibles
    );

    return bibles;
  }

  async function loadBooks(
    bibleId,
    options = {}
  ) {
    if (!bibleId) {
      return [];
    }

    const useCache =
      options.useCache !== false;

    if (
      useCache &&
      cache.booksByBibleId.has(bibleId)
    ) {
      return cache.booksByBibleId.get(
        bibleId
      );
    }

    const result =
      await requestJson(
        `${API_BASE_URL}/bibles/${encodeURIComponent(
          bibleId
        )}/books`
      );

    const books =
      Array.isArray(result.data)
        ? result.data
        : [];

    cache.booksByBibleId.set(
      bibleId,
      books
    );

    return books;
  }

  async function loadChapters(
    bibleId,
    bookId,
    options = {}
  ) {
    if (!bibleId || !bookId) {
      return [];
    }

    const cacheKey =
      `${bibleId}:${bookId}`;

    const useCache =
      options.useCache !== false;

    if (
      useCache &&
      cache.chaptersByBibleAndBook.has(
        cacheKey
      )
    ) {
      return cache.chaptersByBibleAndBook.get(
        cacheKey
      );
    }

    const result =
      await requestJson(
        `${API_BASE_URL}/bibles/${encodeURIComponent(
          bibleId
        )}/books/${encodeURIComponent(
          bookId
        )}/chapters`
      );

  const chapters =
    Array.isArray(result.data)
      ? result.data.filter(
          (chapter) => {
            const chapterId =
              String(chapter.id || "")
                .trim()
                .toLowerCase();
  
            const chapterNumber =
              String(chapter.number || "")
                .trim()
                .toLowerCase();
  
            return (
              chapterId !== "intro" &&
              chapterNumber !== "intro" &&
              !chapterId.endsWith(".intro")
            );
          }
        )
      : [];

    cache.chaptersByBibleAndBook.set(
      cacheKey,
      chapters
    );

    return chapters;
  }

  function getChapterState(
    chapters,
    currentChapterId
  ) {
    const orderedChapters =
      Array.isArray(chapters)
        ? chapters
        : [];

    const currentIndex =
      orderedChapters.findIndex(
        (chapter) =>
          chapter.id === currentChapterId
      );

    return {
      chapters: orderedChapters,
      currentIndex,
      previousChapter:
        currentIndex > 0
          ? orderedChapters[
              currentIndex - 1
            ]
          : null,
      nextChapter:
        currentIndex >= 0 &&
        currentIndex <
          orderedChapters.length - 1
          ? orderedChapters[
              currentIndex + 1
            ]
          : null,
      firstChapter:
        orderedChapters[0] || null,
      lastChapter:
        orderedChapters[
          orderedChapters.length - 1
        ] || null
    };
  }

  function buildVerseUrl({
    baseUrl =
      window.location.href,
    bible,
    book,
    chapterId
  }) {
    if (
      !bible?.id ||
      !book?.id ||
      !chapterId
    ) {
      throw new Error(
        "Bible, book, and chapter are required to build a verse URL."
      );
    }

    const url =
      new URL(
        "verse.html",
        baseUrl
      );

    url.search = "";

    url.searchParams.set(
      "bible",
      bible.id
    );

    url.searchParams.set(
      "bibleAbbr",
      getBibleAbbreviation(bible)
    );

    url.searchParams.set(
      "bibleName",
      getBibleTitle(bible)
    );

    url.searchParams.set(
      "book",
      book.id
    );

    url.searchParams.set(
      "bookName",
      getBookName(book)
    );

    url.searchParams.set(
      "chapter",
      chapterId
    );

    return url.toString();
  }


  function resetSelect(
    selectElement,
    message,
    disabled = true
  ) {
    if (!selectElement) {
      return;
    }

    selectElement.innerHTML = "";

    const option =
      document.createElement("option");

    option.value = "";
    option.textContent = message;

    selectElement.appendChild(option);
    selectElement.disabled = disabled;
  }

  function getPassagePickerOpenLabel(root, options = {}) {
    return (
      options.openButtonLabel ||
      root.dataset.passagePickerOpenLabel ||
      "Open"
    );
  }

  function ensurePassagePickerToggle(root) {
    if (root.querySelector("#passage-picker-toggle")) {
      return;
    }

    const toggle = document.createElement("button");

    toggle.type = "button";
    toggle.id = "passage-picker-toggle";
    toggle.className = "passage-picker-toggle";
    toggle.setAttribute("aria-haspopup", "dialog");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "passage-picker-panel");
    toggle.innerHTML = `
      <span id="current-passage-label">Open Passage</span>
      <span class="passage-picker-chevron" aria-hidden="true">▼</span>
    `;

    root.prepend(toggle);
  }

  function ensurePassagePickerMarkup(root, options = {}) {
    ensurePassagePickerToggle(root);

    const openButtonLabel =
      getPassagePickerOpenLabel(root, options);

    let panel =
      root.querySelector("#passage-picker-panel");

    if (!panel) {
      const panelClass =
        root.dataset.passagePickerPanelClass || "";

      const panelClassName =
        ["passage-picker-panel", panelClass]
          .filter(Boolean)
          .join(" ");

      root.insertAdjacentHTML(
        "beforeend",
        `
          <div
            id="passage-picker-panel"
            class="${panelClassName}"
            role="dialog"
            aria-modal="false"
            aria-labelledby="passage-picker-title"
            hidden
          >
            <div class="passage-picker-header">
              <h2 id="passage-picker-title">Open a Passage</h2>
              <button
                type="button"
                id="passage-picker-close"
                class="passage-picker-close"
                aria-label="Close passage picker"
              >
                &times;
              </button>
            </div>

            <div class="passage-picker-fields">
              <label class="passage-picker-field" for="language-select">
                <span>Language</span>
                <select id="language-select"></select>
              </label>

              <label class="passage-picker-field" for="bible-select">
                <span>Bible</span>
                <select id="bible-select">
                  <option value="">Loading Bibles...</option>
                </select>
              </label>

              <label class="passage-picker-field" for="book-select">
                <span>Book</span>
                <select id="book-select" disabled>
                  <option value="">Loading Books...</option>
                </select>
              </label>

              <label class="passage-picker-field" for="chapter-select">
                <span>Chapter</span>
                <select id="chapter-select" disabled>
                  <option value="">...</option>
                </select>
              </label>
            </div>

            <div class="passage-picker-actions">
              <button
                type="button"
                id="passage-picker-open"
                class="passage-picker-open"
                disabled
              ></button>
            </div>
          </div>
        `
      );

      panel =
        root.querySelector("#passage-picker-panel");
    }

    const openButton =
      root.querySelector("#passage-picker-open");

    if (openButton) {
      openButton.textContent = openButtonLabel;
    }

    return panel;
  }

  function createPassagePicker(options = {}) {
    const root =
      options.root ||
      document.getElementById(
        "passage-picker"
      );

    if (!root) {
      throw new Error(
        "Passage picker root element was not found."
      );
    }

    const languageController =
      options.languageController ||
      window.BibleLanguage;

    if (!languageController) {
      throw new Error(
        "BibleLanguage is unavailable. Load bible-language.js before bible-selector.js."
      );
    }

    const current = {
      bibleId:
        options.current?.bibleId || "",
      bibleAbbr:
        options.current?.bibleAbbr || "",
      bibleName:
        options.current?.bibleName || "",
      bookId:
        options.current?.bookId || "",
      bookName:
        options.current?.bookName || "",
      chapterId:
        options.current?.chapterId || ""
    };

    ensurePassagePickerMarkup(root, options);

    const toggle =
      root.querySelector(
        "#passage-picker-toggle"
      );

    const panel =
      root.querySelector(
        "#passage-picker-panel"
      );

    const closeButton =
      root.querySelector(
        "#passage-picker-close"
      );

    const openButton =
      root.querySelector(
        "#passage-picker-open"
      );

    const currentLabel =
      root.querySelector(
        "#current-passage-label"
      );

    const languageSelect =
      root.querySelector(
        "#language-select"
      );

    const bibleSelect =
      root.querySelector(
        "#bible-select"
      );

    const bookSelect =
      root.querySelector(
        "#book-select"
      );

    const chapterSelect =
      root.querySelector(
        "#chapter-select"
      );

    const requiredElements = [
      toggle,
      panel,
      closeButton,
      openButton,
      languageSelect,
      bibleSelect,
      bookSelect,
      chapterSelect
    ];

    if (
      requiredElements.some(
        (element) => !element
      )
    ) {
      throw new Error(
        "The passage picker markup is incomplete."
      );
    }

    let availableBibles = [];
    let availableBooks = [];
    let availableChapters = [];

    function updateCurrentLabel() {
      if (!currentLabel) {
        return;
      }

      const chapterLabel =
        getChapterLabel({
          id: current.chapterId
        });

      const labelParts = [
        current.bibleAbbr ||
          current.bibleName ||
          "Bible",
        `${current.bookName || current.bookId} ${chapterLabel}`.trim()
      ].filter(Boolean);

      currentLabel.textContent =
        labelParts.join(" · ");

      toggle.title =
        `Change passage: ${labelParts.join(" — ")}`;
    }

    function updateOpenButton() {
      openButton.disabled =
        !bibleSelect.value ||
        !bookSelect.value ||
        !chapterSelect.value;
    }

    async function syncSelectionsToCurrentPassage() {
      const apiUrl =
        languageSelect.value ||
        languageController.getSelectedApiUrl();

      await populateBibles(
        apiUrl,
        true
      );

      if (bibleSelect.value) {
        await populateBooks(
          bibleSelect.value,
          true
        );
      }

      updateOpenButton();
    }

    function getSelectedBible() {
      return availableBibles.find(
        (bible) =>
          bible.id === bibleSelect.value
      ) || null;
    }

    function showFullBibleOptionLabels() {
      for (const option of bibleSelect.options) {
        if (!option.value) {
          continue;
        }

        const bible =
          availableBibles.find(
            (item) => item.id === option.value
          );

        if (!bible) {
          continue;
        }

        const fullLabel =
          getBibleOptionLabel(bible);

        option.textContent = fullLabel;
        option.title =
          fullLabel.length > 10
            ? fullLabel
            : "";
      }
    }

    function showSelectedBibleAbbreviation() {
      const selectedBible =
        getSelectedBible();

      if (!selectedBible) {
        bibleSelect.title = "";
        return;
      }

      const selectedOption =
        bibleSelect.options[
          bibleSelect.selectedIndex
        ];

      if (selectedOption) {
        selectedOption.textContent =
          getBibleAbbreviation(
            selectedBible
          );
      }

      const fullLabel =
        getBibleOptionLabel(
          selectedBible
        );

      bibleSelect.title =
        fullLabel.length > 10
          ? fullLabel
          : "";
    }

    function updateBibleTooltip() {
      showSelectedBibleAbbreviation();
    }

    function setOpen(isOpen) {
      panel.hidden = !isOpen;

      toggle.setAttribute(
        "aria-expanded",
        String(isOpen)
      );

      document.body.classList.toggle(
        "passage-picker-is-open",
        isOpen
      );

      if (isOpen) {
        syncSelectionsToCurrentPassage()
          .catch((error) => {
            console.warn(
              "Unable to sync passage picker with current page:",
              error
            );
          })
          .finally(() => {
            requestAnimationFrame(() => {
              languageSelect.focus();
            });
          });
      }
    }

    function isOpen() {
      return !panel.hidden;
    }

    async function populateBibles(
      apiUrl,
      preserveCurrent = true
    ) {
      resetSelect(
        bibleSelect,
        "Loading Bibles...",
        true
      );

      try {
        availableBibles =
          await loadBibles(apiUrl);

        bibleSelect.innerHTML = "";

        const placeholder =
          document.createElement("option");

        placeholder.value = "";
        placeholder.textContent =
          "Select a Bible...";

        bibleSelect.appendChild(
          placeholder
        );

        for (
          const bible of availableBibles
        ) {
          const option =
            document.createElement("option");

          option.value = bible.id;
          const fullLabel =
            getBibleOptionLabel(bible);

          option.textContent =
            fullLabel;

          option.title =
            fullLabel.length > 10
              ? fullLabel
              : "";

          bibleSelect.appendChild(option);
        }

        const currentBibleExists =
          preserveCurrent &&
          availableBibles.some(
            (bible) =>
              bible.id === current.bibleId
          );

        bibleSelect.value =
          currentBibleExists
            ? current.bibleId
            : "";

        bibleSelect.disabled =
          availableBibles.length === 0;

        updateBibleTooltip();
        updateOpenButton();
      } catch (error) {
        console.error(
          "Unable to load Bible dropdown:",
          error
        );

        resetSelect(
          bibleSelect,
          "Unable to load Bibles",
          true
        );
      }
    }

    async function populateBooks(
      selectedBibleId,
      preserveCurrent = true
    ) {
      if (!selectedBibleId) {
        availableBooks = [];

        resetSelect(
          bookSelect,
          "Select a Bible first",
          true
        );

        resetSelect(
          chapterSelect,
          "Select a book first",
          true
        );

        updateOpenButton();
        return;
      }

      resetSelect(
        bookSelect,
        "Loading Books...",
        true
      );

      resetSelect(
        chapterSelect,
        "Loading Chapters...",
        true
      );

      try {
        availableBooks =
          await loadBooks(
            selectedBibleId
          );

        bookSelect.innerHTML = "";

        const placeholder =
          document.createElement("option");

        placeholder.value = "";
        placeholder.textContent =
          "Select a Book...";

        bookSelect.appendChild(
          placeholder
        );

        for (
          const bookItem of availableBooks
        ) {
          const option =
            document.createElement("option");

          option.value = bookItem.id;
          option.textContent =
            getBookName(bookItem);

          bookSelect.appendChild(option);
        }

        const currentBookExists =
          preserveCurrent &&
          availableBooks.some(
            (bookItem) =>
              bookItem.id === current.bookId
          );

        bookSelect.value =
          currentBookExists
            ? current.bookId
            : "";

        bookSelect.disabled =
          availableBooks.length === 0;

        if (currentBookExists) {
          await populateChapters(
            selectedBibleId,
            current.bookId,
            true
          );
        } else {
          availableChapters = [];

          resetSelect(
            chapterSelect,
            "Select a book first",
            true
          );
        }

        updateOpenButton();
      } catch (error) {
        console.error(
          "Unable to load Book dropdown:",
          error
        );

        resetSelect(
          bookSelect,
          "Unable to load Books",
          true
        );

        resetSelect(
          chapterSelect,
          "Select a book first",
          true
        );
      }
    }

    async function populateChapters(
      selectedBibleId,
      selectedBookId,
      preserveCurrent = true
    ) {
      if (
        !selectedBibleId ||
        !selectedBookId
      ) {
        availableChapters = [];

        resetSelect(
          chapterSelect,
          "Select a book first",
          true
        );

        updateOpenButton();
        return;
      }

      resetSelect(
        chapterSelect,
        "Loading Chapters...",
        true
      );

      try {
        availableChapters =
          await loadChapters(
            selectedBibleId,
            selectedBookId
          );

        chapterSelect.innerHTML = "";

        const placeholder =
          document.createElement("option");

        placeholder.value = "";
        //placeholder.textContent = "Select a Chapter...";

        chapterSelect.appendChild(
          placeholder
        );

        for (
          const chapterItem of availableChapters
        ) {
          const option =
            document.createElement("option");

          option.value = chapterItem.id;
          option.textContent =
            getChapterLabel(chapterItem);

          chapterSelect.appendChild(option);
        }

        const currentChapterExists =
          preserveCurrent &&
          selectedBookId ===
            current.bookId &&
          availableChapters.some(
            (chapterItem) =>
              chapterItem.id ===
              current.chapterId
          );

        chapterSelect.value =
          currentChapterExists
            ? current.chapterId
            : "";

        chapterSelect.disabled =
          availableChapters.length === 0;

        updateOpenButton();
      } catch (error) {
        console.error(
          "Unable to load Chapter dropdown:",
          error
        );

        resetSelect(
          chapterSelect,
          "Unable to load Chapters",
          true
        );
      }
    }

    function openSelectedPassage() {
      const selectedBible =
        availableBibles.find(
          (bible) =>
            bible.id === bibleSelect.value
        );

      const selectedBook =
        availableBooks.find(
          (bookItem) =>
            bookItem.id === bookSelect.value
        );

      const selectedChapterId =
        chapterSelect.value;

      if (
        !selectedBible ||
        !selectedBook ||
        !selectedChapterId
      ) {
        updateOpenButton();
        return;
      }

      const destinationUrl =
        buildVerseUrl({
          baseUrl:
            options.baseUrl ||
            window.location.href,
          bible: selectedBible,
          book: selectedBook,
          chapterId:
            selectedChapterId
        });

      if (
        typeof options.onNavigate ===
          "function"
      ) {
        options.onNavigate(
          destinationUrl,
          {
            bible: selectedBible,
            book: selectedBook,
            chapterId:
              selectedChapterId
          }
        );

        return;
      }

      window.location.assign(
        destinationUrl
      );
    }

    toggle.addEventListener(
      "click",
      () => {
        setOpen(!isOpen());
      }
    );

    closeButton.addEventListener(
      "click",
      () => {
        setOpen(false);
        toggle.focus();
      }
    );

    openButton.addEventListener(
      "click",
      openSelectedPassage
    );

    bibleSelect.addEventListener(
      "mousedown",
      showFullBibleOptionLabels
    );

    bibleSelect.addEventListener(
      "focus",
      showFullBibleOptionLabels
    );

    bibleSelect.addEventListener(
      "blur",
      showSelectedBibleAbbreviation
    );

    bibleSelect.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key === "Enter" ||
          event.key === " " ||
          event.key === "ArrowDown" ||
          event.key === "ArrowUp"
        ) {
          showFullBibleOptionLabels();
        }
      }
    );

    bibleSelect.addEventListener(
      "change",
      async () => {
        updateBibleTooltip();

        availableBooks = [];
        availableChapters = [];

        await populateBooks(
          bibleSelect.value,
          true
        );

        updateOpenButton();
      }
    );

    bookSelect.addEventListener(
      "change",
      async () => {
        availableChapters = [];

        await populateChapters(
          bibleSelect.value,
          bookSelect.value,
          true
        );

        updateOpenButton();
      }
    );

    chapterSelect.addEventListener(
      "change",
      updateOpenButton
    );

    document.addEventListener(
      "click",
      (event) => {
        if (
          !isOpen() ||
          root.contains(event.target)
        ) {
          return;
        }

        setOpen(false);
      }
    );

    document.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key !== "Escape" ||
          !isOpen()
        ) {
          return;
        }

        event.preventDefault();
        setOpen(false);
        toggle.focus();
      }
    );

    window.addEventListener(
      "pageshow",
      () => {
        if (!isOpen()) {
          return;
        }

        syncSelectionsToCurrentPassage().catch((error) => {
          console.warn(
            "Unable to restore passage picker state:",
            error
          );
        });
      }
    );

    updateCurrentLabel();
    updateOpenButton();

    languageController.setupSelect(
      languageSelect,
      {
        async onChange({ apiUrl }) {
          availableBooks = [];
          availableChapters = [];

          await populateBibles(
            apiUrl,
            false
          );

          resetSelect(
            bookSelect,
            "Select a Bible first",
            true
          );

          resetSelect(
            chapterSelect,
            "Select a book first",
            true
          );

          updateOpenButton();
        }
      }
    );

    syncSelectionsToCurrentPassage().catch((error) => {
      console.error(
        "Unable to initialize passage picker:",
        error
      );

      resetSelect(
        bibleSelect,
        "Unable to load Bibles",
        true
      );
    });

    async function applyPreferences(preferences = {}) {
      const languageApiUrl =
        preferences.languageApiUrl ||
        languageController.getSelectedApiUrl();

      current.bibleId = preferences.bibleId || "";
      current.bibleAbbr = preferences.bibleAbbr || "";
      current.bibleName = preferences.bibleName || "";
      current.bookId = "";
      current.bookName = "";
      current.chapterId = "";

      const languageOptionExists =
        Array.from(languageSelect.options).some(
          (option) => option.value === languageApiUrl
        );

      if (languageOptionExists) {
        languageSelect.value = languageApiUrl;
      }

      availableBooks = [];
      availableChapters = [];

      resetSelect(
        bookSelect,
        "Select a Bible first",
        true
      );

      resetSelect(
        chapterSelect,
        "Select a book first",
        true
      );

      await populateBibles(
        languageApiUrl,
        true
      );

      if (bibleSelect.value) {
        await populateBooks(
          bibleSelect.value,
          false
        );
      }

      updateCurrentLabel();
      updateOpenButton();
    }

    return {
      isOpen,
      setOpen,
      openSelectedPassage,
      applyPreferences,
      refresh() {
        return populateBibles(
          languageController
            .getSelectedApiUrl(),
          true
        ).then(() => {
          if (bibleSelect.value) {
            return populateBooks(
              bibleSelect.value,
              true
            );
          }

          return undefined;
        });
      }
    };
  }

  function clearCache() {
    cache.biblesByApiUrl.clear();
    cache.booksByBibleId.clear();
    cache.chaptersByBibleAndBook.clear();
  }

  return {
    API_BASE_URL,
    languageOptions,
    getDefaultLanguage,
    getSavedLanguage,
    saveLanguage,
    getBibleAbbreviation,
    getBibleTitle,
    getBibleDescription,
    getBibleTooltip,
    getBibleOptionLabel,
    getBookName,
    getChapterLabel,
    loadBibles,
    loadBooks,
    loadChapters,
    getChapterState,
    buildVerseUrl,
    ensurePassagePickerMarkup,
    createPassagePicker,
    clearCache
  };
})();
