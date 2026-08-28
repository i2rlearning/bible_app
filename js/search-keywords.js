"use strict";

// ============================================================================
// Keyword Search tab
//
// Keeps the existing Scripture Search engine in search.js separate from the
// user-specific Keyword relationship search:
//
//   Keyword -> connected Scriptures
//   Scripture reference -> associated Keywords
//
// The two result types never share a result count or result list.
// ============================================================================

(function () {
  const KEYWORD_SUGGESTION_LIMIT = 6;
  const BOOK_SUGGESTION_LIMIT = 3;
  const KEYWORD_RESULT_LIMIT = 8;
  const KEYWORD_SCRIPTURE_BATCH_SIZE = 10;
  const SCRIPTURE_PREVIEW_LIMIT = 230;

  const CANONICAL_BOOKS = [
    ["Genesis", "GEN"], ["Exodus", "EXO"], ["Leviticus", "LEV"],
    ["Numbers", "NUM"], ["Deuteronomy", "DEU"], ["Joshua", "JOS"],
    ["Judges", "JDG"], ["Ruth", "RUT"], ["1 Samuel", "1SA"],
    ["2 Samuel", "2SA"], ["1 Kings", "1KI"], ["2 Kings", "2KI"],
    ["1 Chronicles", "1CH"], ["2 Chronicles", "2CH"], ["Ezra", "EZR"],
    ["Nehemiah", "NEH"], ["Esther", "EST"], ["Job", "JOB"],
    ["Psalms", "PSA"], ["Proverbs", "PRO"], ["Ecclesiastes", "ECC"],
    ["Song of Solomon", "SNG"], ["Isaiah", "ISA"], ["Jeremiah", "JER"],
    ["Lamentations", "LAM"], ["Ezekiel", "EZK"], ["Daniel", "DAN"],
    ["Hosea", "HOS"], ["Joel", "JOL"], ["Amos", "AMO"],
    ["Obadiah", "OBA"], ["Jonah", "JON"], ["Micah", "MIC"],
    ["Nahum", "NAM"], ["Habakkuk", "HAB"], ["Zephaniah", "ZEP"],
    ["Haggai", "HAG"], ["Zechariah", "ZEC"], ["Malachi", "MAL"],
    ["Matthew", "MAT"], ["Mark", "MRK"], ["Luke", "LUK"],
    ["John", "JHN"], ["Acts", "ACT"], ["Romans", "ROM"],
    ["1 Corinthians", "1CO"], ["2 Corinthians", "2CO"],
    ["Galatians", "GAL"], ["Ephesians", "EPH"], ["Philippians", "PHP"],
    ["Colossians", "COL"], ["1 Thessalonians", "1TH"],
    ["2 Thessalonians", "2TH"], ["1 Timothy", "1TI"],
    ["2 Timothy", "2TI"], ["Titus", "TIT"], ["Philemon", "PHM"],
    ["Hebrews", "HEB"], ["James", "JAS"], ["1 Peter", "1PE"],
    ["2 Peter", "2PE"], ["1 John", "1JN"], ["2 John", "2JN"],
    ["3 John", "3JN"], ["Jude", "JUD"], ["Revelation", "REV"]
  ].map(([name, id]) => ({ name, id, abbreviation: id }));

  const CANONICAL_BOOK_ID_MAP = new Map(
    CANONICAL_BOOKS.map((book) => [normalizeReferenceBookKey(book.name), book.id])
  );

  // Common alternate canonical labels.
  CANONICAL_BOOK_ID_MAP.set("psalm", "PSA");
  CANONICAL_BOOK_ID_MAP.set("song of songs", "SNG");

  const elements = {};

  const state = {
    mode: "scripture",
    scriptureQuery: "",
    scriptureExact: false,
    scriptureHeaderSnapshot: null,
    keywordQuery: "",
    keywordSummary: "Search a Keyword or Scripture reference.",
    keywordHasRendered: false,
    keywords: [],
    keywordLibraryLoaded: false,
    keywordLibraryUnavailable: false,
    keywordLibraryPromise: null,
    resultRequestId: 0,
    suggestionRequestId: 0,
    bookOrder: [],
    bookOrderBibleId: "",
    bookOrderPromise: null,
    passageCache: new Map()
  };

  document.addEventListener("DOMContentLoaded", initializeKeywordSearch);

  function initializeKeywordSearch() {
    elements.form = document.getElementById("scripture-search-form");
    elements.input = document.getElementById("search-input");
    elements.exactWordOnly = document.getElementById("exact-word-only");
    elements.clear = document.getElementById("clear-search");
    elements.keywordSuggestions = document.getElementById("keyword-search-suggestions");
    elements.keywordResults = document.getElementById("keyword-search-results");
    elements.resultsList = document.getElementById("results-list");
    elements.resultsSummary = document.getElementById("search-results-summary");
    elements.resultsTitle = document.getElementById("search-results-title");
    elements.status = document.getElementById("search-status");
    elements.pagination = document.getElementById("search-pagination");
    elements.pageSizeControl = document.getElementById("results-page-size-control");
    elements.scriptureOptions = document.getElementById("scripture-search-options");
    elements.scriptureTab = document.getElementById("scripture-search-tab");
    elements.keywordTab = document.getElementById("keyword-search-tab");
    elements.searchTitle = document.getElementById("search-title");
    elements.searchHelp = document.getElementById("search-help");

    if (!elements.form || !elements.input || !elements.keywordResults) {
      return;
    }

    state.scriptureQuery = normalizeSearchText(elements.input.value || "");
    state.scriptureExact = Boolean(elements.exactWordOnly?.checked);
    captureScriptureHeader();
    bindKeywordSearchEvents();
    syncSearchModeUi();

    loadKeywordLibrary().catch(() => {});
  }

  function bindKeywordSearchEvents() {
    elements.scriptureTab?.addEventListener("click", () => setSearchMode("scripture"));
    elements.keywordTab?.addEventListener("click", () => setSearchMode("keyword"));

    // Capture phase lets Keyword Search own submit/clear while that tab is active,
    // without changing the existing search.js Scripture Search implementation.
    elements.form.addEventListener("submit", handleFormSubmitCapture, true);
    elements.clear?.addEventListener("click", handleClearCapture, true);

    elements.input.addEventListener("input", () => {
      if (state.mode !== "keyword") return;
      state.keywordQuery = normalizeSearchText(elements.input.value || "");
      updateKeywordSuggestions();
    });

    elements.input.addEventListener("focus", () => {
      if (state.mode === "keyword") updateKeywordSuggestions();
    });

    elements.input.addEventListener("keydown", handleInputKeydown);
    elements.keywordSuggestions?.addEventListener("keydown", handleSuggestionKeydown);

    document.addEventListener("pointerdown", (event) => {
      if (state.mode !== "keyword") return;
      if (!event.target.closest(".search-input-shell")) closeSuggestions();
    });

    document.addEventListener("change", (event) => {
      if (event.target?.id !== "search-bible-select") return;
      resetBibleDependentCaches();

      if (state.mode === "keyword" && state.keywordQuery) {
        window.setTimeout(() => runKeywordSearch(state.keywordQuery), 0);
      }
    });

    window.addEventListener("bible-preferences-changed", () => {
      resetBibleDependentCaches();

      if (state.mode === "keyword" && state.keywordQuery) {
        window.setTimeout(() => runKeywordSearch(state.keywordQuery), 0);
      }
    });
  }

  function handleFormSubmitCapture(event) {
    if (state.mode !== "keyword") {
      state.scriptureQuery = normalizeSearchText(elements.input.value || "");
      state.scriptureExact = Boolean(elements.exactWordOnly?.checked);
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const query = normalizeSearchText(elements.input.value || "");
    state.keywordQuery = query;
    closeSuggestions();

    if (!query) {
      clearKeywordResults("Enter a Keyword or Scripture reference.");
      elements.input.focus();
      return;
    }

    runKeywordSearch(query);
  }

  function handleClearCapture(event) {
    if (state.mode !== "keyword") return;

    event.preventDefault();
    event.stopImmediatePropagation();

    state.resultRequestId += 1;
    state.keywordQuery = "";
    elements.input.value = "";
    closeSuggestions();
    clearKeywordResults("Search a Keyword or Scripture reference.");
    elements.input.focus();
  }

  function setSearchMode(nextMode) {
    if (nextMode !== "scripture" && nextMode !== "keyword") return;
    if (nextMode === state.mode) return;

    if (state.mode === "scripture") {
      state.scriptureQuery = normalizeSearchText(elements.input.value || "");
      state.scriptureExact = Boolean(elements.exactWordOnly?.checked);
      captureScriptureHeader();

      // The first time the user opens Keyword Search, carry the current search
      // text over as a convenience. Thereafter each tab remembers its own query.
      if (!state.keywordQuery) {
        state.keywordQuery = state.scriptureQuery;
      }
    } else {
      state.keywordQuery = normalizeSearchText(elements.input.value || "");
    }

    state.mode = nextMode;
    closeSuggestions();
    syncSearchModeUi();

    if (state.mode === "keyword") {
      elements.input.value = state.keywordQuery;
      loadKeywordLibrary().catch(() => {});
      ensureSelectedBibleBookOrder().catch(() => {});

      if (state.keywordQuery) {
        runKeywordSearch(state.keywordQuery);
      } else {
        clearKeywordResults("Search a Keyword or Scripture reference.");
      }
    } else {
      state.resultRequestId += 1;
      elements.input.value = state.scriptureQuery;

      if (elements.exactWordOnly) {
        elements.exactWordOnly.checked = state.scriptureExact;
      }

      restoreScriptureHeader();
    }

    elements.input.focus();
  }

  function syncSearchModeUi() {
    const keywordMode = state.mode === "keyword";

    document.body.classList.toggle("search-mode-keywords", keywordMode);
    document.body.classList.toggle("search-mode-scripture", !keywordMode);

    setTabState(elements.scriptureTab, !keywordMode);
    setTabState(elements.keywordTab, keywordMode);

    if (elements.scriptureOptions) elements.scriptureOptions.hidden = keywordMode;
    if (elements.pageSizeControl) elements.pageSizeControl.hidden = keywordMode;
    if (elements.status) elements.status.hidden = keywordMode;
    if (elements.resultsList) elements.resultsList.hidden = keywordMode;
    if (elements.pagination) elements.pagination.hidden = keywordMode;

    if (keywordMode) {
      elements.input.placeholder = "Search a Keyword or Scripture reference...";
      if (elements.searchTitle) elements.searchTitle.textContent = "Find Keywords and connected Scripture";
      if (elements.searchHelp) {
        elements.searchHelp.textContent =
          "Search a Keyword to see its connected Scriptures, or enter a Scripture reference to see the Keywords associated with it.";
      }
      if (elements.resultsTitle) elements.resultsTitle.textContent = "Keyword Results";
      if (elements.resultsSummary) elements.resultsSummary.textContent = state.keywordSummary;
      elements.keywordResults.hidden = !state.keywordHasRendered;
    } else {
      elements.input.placeholder = 'Try "kingdom of heaven", east, or John 3:16';
      if (elements.searchTitle) elements.searchTitle.textContent = "Find a verse or passage";
      if (elements.searchHelp) {
        elements.searchHelp.textContent =
          "Smart search shows exact matches first and highlights variant forms when they are returned. Use quotes for an exact phrase, or the checkbox for exact matches.";
      }
      elements.keywordResults.hidden = true;
    }
  }

  function setTabState(tab, active) {
    if (!tab) return;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
    tab.tabIndex = active ? 0 : -1;
  }

  function captureScriptureHeader() {
    state.scriptureHeaderSnapshot = {
      title: elements.resultsTitle?.textContent || "Results",
      summary: elements.resultsSummary?.textContent || ""
    };
  }

  function restoreScriptureHeader() {
    const snapshot = state.scriptureHeaderSnapshot;
    if (!snapshot) return;
    if (elements.resultsTitle) elements.resultsTitle.textContent = snapshot.title;
    if (elements.resultsSummary) elements.resultsSummary.textContent = snapshot.summary;
  }

  function resetBibleDependentCaches() {
    state.bookOrder = [];
    state.bookOrderBibleId = "";
    state.bookOrderPromise = null;
    state.passageCache.clear();
    state.suggestionRequestId += 1;
  }

  async function fetchAppJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });

    let result = {};

    try {
      result = await response.json();
    } catch (error) {
      result = { message: "Unexpected server response" };
    }

    if (!response.ok) {
      const requestError = new Error(result.message || "Request failed");
      requestError.status = response.status;
      requestError.code = result.code || "";
      requestError.data = result;
      throw requestError;
    }

    return result;
  }

  async function loadKeywordLibrary(options = {}) {
    const force = Boolean(options.force);

    if (state.keywordLibraryUnavailable && !force) return [];
    if (state.keywordLibraryLoaded && !force) return state.keywords;
    if (state.keywordLibraryPromise) return state.keywordLibraryPromise;

    state.keywordLibraryPromise = (async () => {
      try {
        const result = await fetchAppJson("/api/study-tags");
        state.keywords = Array.isArray(result.tags) ? result.tags : [];
        state.keywordLibraryLoaded = true;
        state.keywordLibraryUnavailable = false;
        return state.keywords;
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          state.keywordLibraryUnavailable = true;
          state.keywordLibraryLoaded = false;
          state.keywords = [];
          closeSuggestions();
          return [];
        }

        console.warn("Could not load Keyword Library for Search:", error);
        return [];
      } finally {
        state.keywordLibraryPromise = null;
      }
    })();

    return state.keywordLibraryPromise;
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeKeywordQuery(value) {
    return normalizeSearchText(value)
      .replace(/^"|"$/g, "")
      .toLowerCase();
  }

  function normalizeReferenceBookKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[.'’]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getKeywordMatches(query) {
    const needle = normalizeKeywordQuery(query);
    if (needle.length < 2) return [];

    return state.keywords
      .filter((keyword) => normalizeKeywordQuery(keyword.name).includes(needle))
      .map((keyword) => {
        const name = normalizeKeywordQuery(keyword.name);
        let rank = 2;
        if (name === needle) rank = 0;
        else if (name.startsWith(needle)) rank = 1;
        return { keyword, rank };
      })
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        const countA = Math.max(0, Number(a.keyword.scriptureCount) || 0);
        const countB = Math.max(0, Number(b.keyword.scriptureCount) || 0);
        if (countA !== countB) return countB - countA;
        return String(a.keyword.name || "").localeCompare(String(b.keyword.name || ""));
      })
      .map((item) => item.keyword);
  }

  function parseReferenceQuery(query) {
    const normalized = normalizeSearchText(query)
      .replace(/^"|"$/g, "")
      .replace(/[.;,]+$/g, "")
      .trim();

    if (!normalized) return null;

    const match = normalized.match(
      /^(.+?)\s+(\d+(?:-\d+|:\d+(?:-\d+(?::\d+)?)?)?)$/u
    );

    if (!match) return null;

    return {
      original: normalized,
      bookText: normalizeSearchText(match[1]),
      locator: normalizeSearchText(match[2])
    };
  }

  function getCurrentBibleState() {
    const params = new URLSearchParams(window.location.search);
    const select = document.getElementById("search-bible-select");
    const selectedOption = select?.options?.[select.selectedIndex] || null;
    const preferences = readPreferences();

    return {
      bibleId:
        select?.value ||
        params.get("bible") ||
        preferences.bibleId ||
        "bba9f40183526463-018",
      bibleAbbr:
        selectedOption?.dataset?.abbr ||
        params.get("bibleAbbr") ||
        preferences.bibleAbbr ||
        "BSB",
      bibleName:
        selectedOption?.dataset?.name ||
        params.get("bibleName") ||
        preferences.bibleName ||
        "Berean Standard Bible"
    };
  }

  function readPreferences() {
    if (window.UserPreferences?.read) return window.UserPreferences.read();

    try {
      return JSON.parse(localStorage.getItem("branchOfIsraelPreferences") || "{}");
    } catch (error) {
      return {};
    }
  }

  async function ensureSelectedBibleBookOrder() {
    const bible = getCurrentBibleState();
    if (!bible.bibleId) return [];

    if (state.bookOrderBibleId === bible.bibleId && state.bookOrder.length) {
      return state.bookOrder;
    }

    if (state.bookOrderPromise) return state.bookOrderPromise;
    if (typeof API_KEY === "undefined" || !API_KEY) return [];

    state.bookOrderPromise = (async () => {
      try {
        const response = await fetch(
          `https://api.scripture.api.bible/v1/bibles/${encodeURIComponent(bible.bibleId)}/books`,
          { headers: { "api-key": API_KEY } }
        );
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || "Could not load Bible books.");
        }

        state.bookOrder = (result.data || []).map((book) => ({
          id: book.id || "",
          name: book.name || "",
          abbreviation: book.abbreviation || ""
        }));
        state.bookOrderBibleId = bible.bibleId;
        return state.bookOrder;
      } catch (error) {
        console.warn("Could not load Bible books for Keyword Search:", error);
        state.bookOrder = [];
        state.bookOrderBibleId = bible.bibleId;
        return [];
      } finally {
        state.bookOrderPromise = null;
      }
    })();

    return state.bookOrderPromise;
  }

  function getAllSearchableBooks() {
    const byId = new Map();

    CANONICAL_BOOKS.forEach((book) => byId.set(book.id, { ...book }));

    state.bookOrder.forEach((book) => {
      const id = String(book.id || "").toUpperCase();
      if (!id) return;
      byId.set(id, {
        id,
        name: book.name || byId.get(id)?.name || id,
        abbreviation: book.abbreviation || id
      });
    });

    return Array.from(byId.values());
  }

  function getBookMatches(bookText) {
    const needle = normalizeReferenceBookKey(bookText);
    if (!needle) return [];

    return getAllSearchableBooks()
      .map((book) => {
        const candidates = [book.name, book.abbreviation, book.id]
          .filter(Boolean)
          .map(normalizeReferenceBookKey);

        let rank = 99;
        if (candidates.some((value) => value === needle)) rank = 0;
        else if (candidates.some((value) => value.startsWith(needle))) rank = 1;
        else if (candidates.some((value) => value.includes(needle))) rank = 2;

        return { book, rank };
      })
      .filter((item) => item.rank < 99)
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return String(a.book.name || "").localeCompare(String(b.book.name || ""));
      })
      .map((item) => item.book);
  }

  function getBookIdSync(bookText) {
    const key = normalizeReferenceBookKey(bookText);
    if (!key) return "";

    const canonical = CANONICAL_BOOK_ID_MAP.get(key);
    if (canonical) return canonical;

    const selected = state.bookOrder.find((book) => {
      return [book.id, book.name, book.abbreviation]
        .filter(Boolean)
        .some((value) => normalizeReferenceBookKey(value) === key);
    });

    return String(selected?.id || "").toUpperCase();
  }

  async function getStableBookIdForReferenceBook(bookText) {
    let id = getBookIdSync(bookText);
    if (id) return id;

    await ensureSelectedBibleBookOrder();
    id = getBookIdSync(bookText);

    if (id) return id;

    const partialMatches = getBookMatches(bookText);
    return partialMatches.length === 1 ? partialMatches[0].id : "";
  }

  async function getKeywordLookupReference(query) {
    const parsed = parseReferenceQuery(query);
    if (!parsed) return "";

    const bookId = await getStableBookIdForReferenceBook(parsed.bookText);
    if (!bookId) return "";

    return `${bookId} ${parsed.locator}`;
  }

  async function updateKeywordSuggestions() {
    if (state.mode !== "keyword" || !elements.keywordSuggestions) return;

    const query = normalizeSearchText(elements.input.value || "");
    const requestId = ++state.suggestionRequestId;

    if (query.length < 2) {
      closeSuggestions();
      return;
    }

    await Promise.all([
      loadKeywordLibrary(),
      ensureSelectedBibleBookOrder()
    ]);

    if (
      requestId !== state.suggestionRequestId ||
      state.mode !== "keyword"
    ) {
      return;
    }

    const keywordMatches = state.keywordLibraryUnavailable
      ? []
      : getKeywordMatches(query).slice(0, KEYWORD_SUGGESTION_LIMIT);
    const scriptureSuggestions = getScriptureSuggestions(query);
    const parsedReference = parseReferenceQuery(query);

    if (!keywordMatches.length && !scriptureSuggestions.length) {
      closeSuggestions();
      return;
    }

    const panel = elements.keywordSuggestions;
    panel.innerHTML = "";

    const addKeywords = () => {
      if (!keywordMatches.length) return;
      appendSuggestionHeading(panel, "Keywords");
      keywordMatches.forEach((keyword) => {
        panel.appendChild(createKeywordSuggestionButton(keyword));
      });
    };

    const addScripture = () => {
      if (!scriptureSuggestions.length) return;
      appendSuggestionHeading(panel, "Scripture");
      scriptureSuggestions.forEach((suggestion) => {
        panel.appendChild(createScriptureSuggestionButton(suggestion));
      });
    };

    // Once a chapter/reference pattern is present, Scripture intent becomes the
    // more likely choice. For ordinary words or a bare book name, Keywords stay first.
    if (parsedReference) {
      addScripture();
      addKeywords();
    } else {
      addKeywords();
      addScripture();
    }

    panel.hidden = false;
    elements.input.setAttribute("aria-expanded", "true");
  }

  function getScriptureSuggestions(query) {
    const normalized = normalizeSearchText(query);
    const parsed = parseReferenceQuery(normalized);

    if (parsed) {
      const matches = getBookMatches(parsed.bookText).slice(0, BOOK_SUGGESTION_LIMIT);
      return matches.map((book) => ({
        type: "reference",
        complete: true,
        value: `${book.name} ${parsed.locator}`,
        label: `${book.name} ${parsed.locator}`,
        hint: "Find associated Keywords"
      }));
    }

    // Bare book-name suggestions are useful for ambiguous cases such as a
    // Keyword named "Romans". Choosing the Scripture option simply fills the
    // book name and lets the user continue with chapter/verse.
    if (/\d/.test(normalized)) return [];

    return getBookMatches(normalized)
      .slice(0, BOOK_SUGGESTION_LIMIT)
      .map((book) => ({
        type: "book",
        complete: false,
        value: `${book.name} `,
        label: book.name,
        hint: "Type a chapter or verse"
      }));
  }

  function appendSuggestionHeading(panel, text) {
    const heading = document.createElement("div");
    heading.className = "search-keyword-suggestion-heading";
    heading.textContent = text;
    panel.appendChild(heading);
  }

  function createKeywordSuggestionButton(keyword) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-keyword-suggestion";
    button.dataset.searchSuggestion = "keyword";
    button.setAttribute("role", "option");

    const name = document.createElement("span");
    name.className = "search-keyword-suggestion-name";
    name.textContent = keyword.name || "Keyword";

    const count = document.createElement("span");
    count.className = "search-keyword-suggestion-count";
    const scriptureCount = Math.max(0, Number(keyword.scriptureCount) || 0);
    count.textContent = `${scriptureCount} Scripture${scriptureCount === 1 ? "" : "s"}`;

    button.append(name, count);
    button.addEventListener("click", () => selectKeywordAndSearch(keyword));
    return button;
  }

  function createScriptureSuggestionButton(suggestion) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-keyword-suggestion search-scripture-suggestion";
    button.dataset.searchSuggestion = "scripture";
    button.setAttribute("role", "option");

    const name = document.createElement("span");
    name.className = "search-keyword-suggestion-name";
    name.textContent = suggestion.label;

    const hint = document.createElement("span");
    hint.className = "search-keyword-suggestion-count";
    hint.textContent = suggestion.hint;

    button.append(name, hint);
    button.addEventListener("click", () => {
      elements.input.value = suggestion.value;
      state.keywordQuery = normalizeSearchText(suggestion.value);
      closeSuggestions();

      if (suggestion.complete) {
        runKeywordSearch(state.keywordQuery);
      } else {
        elements.input.focus();
        updateKeywordSuggestions();
      }
    });

    return button;
  }

  function selectKeywordAndSearch(keyword) {
    if (!keyword?.name) return;
    elements.input.value = keyword.name;
    state.keywordQuery = keyword.name;
    closeSuggestions();
    runKeywordSearch(keyword.name);
  }

  function closeSuggestions() {
    state.suggestionRequestId += 1;

    if (elements.keywordSuggestions) {
      elements.keywordSuggestions.hidden = true;
      elements.keywordSuggestions.innerHTML = "";
    }

    elements.input?.setAttribute("aria-expanded", "false");
  }

  function handleInputKeydown(event) {
    if (state.mode !== "keyword") return;

    if (event.key === "ArrowDown" && !elements.keywordSuggestions?.hidden) {
      const first = elements.keywordSuggestions.querySelector(
        "button[data-search-suggestion]"
      );

      if (first) {
        event.preventDefault();
        first.focus();
      }
      return;
    }

    if (event.key === "Escape") closeSuggestions();
  }

  function handleSuggestionKeydown(event) {
    if (state.mode !== "keyword" || elements.keywordSuggestions?.hidden) return;

    const buttons = Array.from(
      elements.keywordSuggestions.querySelectorAll("button[data-search-suggestion]")
    );

    if (!buttons.length) return;
    const currentIndex = buttons.indexOf(document.activeElement);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      buttons[(currentIndex + 1 + buttons.length) % buttons.length].focus();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (currentIndex <= 0) elements.input.focus();
      else buttons[currentIndex - 1].focus();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeSuggestions();
      elements.input.focus();
    }
  }

  async function runKeywordSearch(query) {
    if (state.mode !== "keyword") return;

    const normalizedQuery = normalizeSearchText(query);
    state.keywordQuery = normalizedQuery;
    state.resultRequestId += 1;
    const requestId = state.resultRequestId;

    closeSuggestions();
    clearKeywordContainer();

    await Promise.all([
      loadKeywordLibrary(),
      ensureSelectedBibleBookOrder()
    ]);

    if (requestId !== state.resultRequestId || state.mode !== "keyword") return;

    if (state.keywordLibraryUnavailable) {
      renderSimpleKeywordMessage(
        "Keyword Search",
        "Log in to search your private Keywords.",
        ""
      );
      return;
    }

    const parsedReference = parseReferenceQuery(normalizedQuery);

    // Valid Scripture structure takes priority over an identically named Keyword.
    if (parsedReference) {
      const lookupReference = await getKeywordLookupReference(normalizedQuery);
      if (requestId !== state.resultRequestId) return;

      if (!lookupReference) {
        renderSimpleKeywordMessage(
          "Scripture",
          `Could not recognize the Bible book in “${normalizedQuery}”.`,
          "Try selecting the Scripture suggestion as you type."
        );
        return;
      }

      await renderReferenceKeywordResults(normalizedQuery, lookupReference, requestId);
      return;
    }

    const matches = getKeywordMatches(normalizedQuery);
    const exact = matches.find(
      (keyword) => normalizeKeywordQuery(keyword.name) === normalizeKeywordQuery(normalizedQuery)
    );

    if (exact) {
      await renderKeywordDetail(exact, requestId);
      return;
    }

    if (matches.length) {
      renderKeywordMatchResults(matches, normalizedQuery);
      return;
    }

    const bookMatches = getBookMatches(normalizedQuery);

    if (bookMatches.some((book) => normalizeReferenceBookKey(book.name) === normalizeReferenceBookKey(normalizedQuery))) {
      renderSimpleKeywordMessage(
        "Scripture",
        `Enter a chapter or verse after ${bookMatches[0].name}.`,
        `For example: ${bookMatches[0].name} 12:3`
      );
      return;
    }

    renderSimpleKeywordMessage(
      "Keyword Search",
      `No Keywords match “${normalizedQuery}”.`,
      "Try part of a Keyword name, or enter a Scripture reference such as John 3:16."
    );
  }

  function clearKeywordContainer() {
    elements.keywordResults.innerHTML = "";
    elements.keywordResults.hidden = false;
    state.keywordHasRendered = true;
  }

  function clearKeywordResults(summary) {
    state.keywordSummary = summary || "";
    state.keywordHasRendered = false;
    elements.keywordResults.innerHTML = "";
    elements.keywordResults.hidden = true;
    if (state.mode === "keyword" && elements.resultsSummary) {
      elements.resultsSummary.textContent = state.keywordSummary;
    }
  }

  function setKeywordSummary(summary) {
    state.keywordSummary = summary || "";
    if (state.mode === "keyword" && elements.resultsSummary) {
      elements.resultsSummary.textContent = state.keywordSummary;
    }
  }

  function renderSimpleKeywordMessage(eyebrow, message, detail) {
    clearKeywordContainer();
    setKeywordSummary(message);

    elements.keywordResults.appendChild(
      createKeywordSectionHeading(eyebrow, message)
    );

    if (detail) {
      const note = document.createElement("p");
      note.className = "search-keyword-empty";
      note.textContent = detail;
      elements.keywordResults.appendChild(note);
    }
  }

  function createKeywordSectionHeading(eyebrow, title, meta = "") {
    const heading = document.createElement("div");
    heading.className = "search-keyword-result-heading";

    const text = document.createElement("div");

    const label = document.createElement("p");
    label.className = "search-keyword-result-eyebrow";
    label.textContent = eyebrow;

    const name = document.createElement("h3");
    name.textContent = title;

    text.append(label, name);
    heading.appendChild(text);

    if (meta) {
      const count = document.createElement("span");
      count.className = "search-keyword-result-meta";
      count.textContent = meta;
      heading.appendChild(count);
    }

    return heading;
  }

  function renderKeywordMatchResults(matches, query) {
    clearKeywordContainer();
    setKeywordSummary(`${matches.length} Keyword match${matches.length === 1 ? "" : "es"} for “${query}”.`);

    const visible = matches.slice(0, KEYWORD_RESULT_LIMIT);

    elements.keywordResults.appendChild(
      createKeywordSectionHeading(
        "Keyword Matches",
        `Keywords matching “${query}”`,
        `${matches.length} match${matches.length === 1 ? "" : "es"}`
      )
    );

    const list = document.createElement("div");
    list.className = "search-keyword-match-list";

    const renderRows = (keywords) => {
      list.innerHTML = "";
      keywords.forEach((keyword) => list.appendChild(createKeywordMatchRow(keyword)));
    };

    renderRows(visible);
    elements.keywordResults.appendChild(list);

    if (matches.length > visible.length) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "search-keyword-view-all";
      more.textContent = `View all ${matches.length} Keyword matches`;
      more.addEventListener("click", () => {
        renderRows(matches);
        list.classList.add("is-expanded");
        more.remove();
      });
      elements.keywordResults.appendChild(more);
    }
  }

  function createKeywordMatchRow(keyword) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-keyword-match-row";

    const main = document.createElement("span");
    main.className = "search-keyword-match-main";

    const dot = document.createElement("span");
    dot.className = "search-keyword-color-dot";
    dot.style.background = keyword.color || "#dbeafe";

    const name = document.createElement("strong");
    name.textContent = keyword.name || "Keyword";
    main.append(dot, name);

    const count = document.createElement("span");
    count.className = "search-keyword-match-count";
    const scriptureCount = Math.max(0, Number(keyword.scriptureCount) || 0);
    count.textContent = `${scriptureCount} Scripture${scriptureCount === 1 ? "" : "s"}`;

    button.append(main, count);
    button.addEventListener("click", () => selectKeywordAndSearch(keyword));
    return button;
  }

  async function renderKeywordDetail(keyword, requestId) {
    clearKeywordContainer();

    const initialCount = Math.max(0, Number(keyword.scriptureCount) || 0);
    setKeywordSummary(
      `${keyword.name || "Keyword"} - ${initialCount} connected Scripture${initialCount === 1 ? "" : "s"}.`
    );

    elements.keywordResults.appendChild(
      createKeywordSectionHeading(
        "Keyword",
        keyword.name || "Keyword",
        `${initialCount} Scripture${initialCount === 1 ? "" : "s"}`
      )
    );

    const loading = document.createElement("p");
    loading.className = "search-keyword-loading";
    loading.textContent = "Loading connected Scriptures...";
    elements.keywordResults.appendChild(loading);

    try {
      const result = await fetchAppJson(
        `/api/study-tags/${encodeURIComponent(keyword.id)}/scriptures`
      );

      if (requestId !== state.resultRequestId || state.mode !== "keyword") return;

      const scriptures = Array.isArray(result.scriptures) ? result.scriptures : [];
      elements.keywordResults.innerHTML = "";
      setKeywordSummary(
        `${keyword.name || "Keyword"} - ${scriptures.length} connected Scripture${scriptures.length === 1 ? "" : "s"}.`
      );

      elements.keywordResults.appendChild(
        createKeywordSectionHeading(
          "Keyword",
          keyword.name || "Keyword",
          `${scriptures.length} Scripture${scriptures.length === 1 ? "" : "s"}`
        )
      );

      if (!scriptures.length) {
        const empty = document.createElement("p");
        empty.className = "search-keyword-empty";
        empty.textContent = "No Scriptures are connected to this Keyword yet.";
        elements.keywordResults.appendChild(empty);
        return;
      }

      const list = document.createElement("div");
      list.className = "search-keyword-scripture-list";
      elements.keywordResults.appendChild(list);

      renderKeywordScriptureBatches(scriptures, list, requestId);
    } catch (error) {
      if (requestId !== state.resultRequestId) return;

      elements.keywordResults.innerHTML = "";
      elements.keywordResults.appendChild(
        createKeywordSectionHeading("Keyword", keyword.name || "Keyword")
      );

      const message = document.createElement("p");
      message.className = "search-keyword-empty is-error";
      message.textContent = error.status === 401
        ? "Log in to search your private Keywords."
        : (error.message || "Could not load this Keyword's Scriptures.");
      elements.keywordResults.appendChild(message);
    }
  }

  function renderKeywordScriptureBatches(scriptures, list, requestId) {
    let shown = 0;
    let moreButton = null;

    const appendNextBatch = () => {
      if (moreButton) {
        moreButton.remove();
        moreButton = null;
      }

      const next = scriptures.slice(shown, shown + KEYWORD_SCRIPTURE_BATCH_SIZE);
      next.forEach((item) => list.appendChild(createKeywordScriptureCard(item, requestId)));
      shown += next.length;

      if (shown < scriptures.length) {
        const remaining = scriptures.length - shown;
        const nextCount = Math.min(KEYWORD_SCRIPTURE_BATCH_SIZE, remaining);
        moreButton = document.createElement("button");
        moreButton.type = "button";
        moreButton.className = "search-keyword-show-more-scriptures";
        moreButton.textContent = `Show ${nextCount} more Scripture${nextCount === 1 ? "" : "s"}`;
        moreButton.addEventListener("click", appendNextBatch);
        elements.keywordResults.appendChild(moreButton);
      }
    };

    appendNextBatch();
  }

  function createKeywordScriptureCard(item, requestId, options = {}) {
    const row = document.createElement("article");
    row.className = "search-keyword-scripture-row";

    const text = document.createElement("div");
    text.className = "search-keyword-scripture-text";

    const reference = document.createElement("strong");
    reference.textContent = item.reference || item.normalizedReference || options.displayReference || "Scripture";
    text.appendChild(reference);

    const preview = document.createElement("p");
    preview.className = "search-keyword-scripture-preview is-loading";
    preview.textContent = "Loading verse preview...";
    text.appendChild(preview);

    if (item.note) {
      const note = document.createElement("p");
      note.className = "search-keyword-relationship-note";
      note.textContent = `Keyword note: ${item.note}`;
      text.appendChild(note);
    }

    const open = document.createElement("a");
    open.className = "search-keyword-open-link";
    open.href = buildKeywordScriptureUrl(item);
    open.textContent = "View Chapter";

    row.append(text, open);

    fetchScripturePreview(item)
      .then((previewText) => {
        if (requestId !== state.resultRequestId || !row.isConnected) return;
        preview.classList.remove("is-loading");
        preview.textContent = previewText || "Verse preview unavailable.";
      })
      .catch(() => {
        if (requestId !== state.resultRequestId || !row.isConnected) return;
        preview.classList.remove("is-loading");
        preview.textContent = "Verse preview unavailable.";
      });

    return row;
  }

  async function renderReferenceKeywordResults(displayReference, lookupReference, requestId) {
    clearKeywordContainer();
    setKeywordSummary(`Checking Keywords associated with ${displayReference}.`);

    elements.keywordResults.appendChild(
      createKeywordSectionHeading("Scripture", displayReference)
    );

    const previewWrap = document.createElement("div");
    previewWrap.className = "search-reference-preview-wrap";
    previewWrap.appendChild(
      createKeywordScriptureCard({ reference: displayReference }, requestId)
    );
    elements.keywordResults.appendChild(previewWrap);

    const loading = document.createElement("p");
    loading.className = "search-keyword-loading";
    loading.textContent = "Checking associated Keywords...";
    elements.keywordResults.appendChild(loading);

    try {
      const result = await fetchAppJson(
        `/api/scripture-references/tags?reference=${encodeURIComponent(lookupReference)}`
      );

      if (requestId !== state.resultRequestId || state.mode !== "keyword") return;

      const keywords = Array.isArray(result.tags) ? result.tags : [];
      loading.remove();
      setKeywordSummary(
        `${displayReference} - ${keywords.length} associated Keyword${keywords.length === 1 ? "" : "s"}.`
      );

      const subheading = document.createElement("div");
      subheading.className = "search-associated-keyword-heading";
      subheading.textContent = `Associated Keywords (${keywords.length})`;
      elements.keywordResults.appendChild(subheading);

      if (!keywords.length) {
        const empty = document.createElement("p");
        empty.className = "search-keyword-empty";
        empty.textContent = "No Keywords are associated with this Scripture yet.";
        elements.keywordResults.appendChild(empty);
        return;
      }

      const chips = document.createElement("div");
      chips.className = "search-associated-keyword-list";

      keywords.forEach((keyword) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "search-associated-keyword-chip";

        const dot = document.createElement("span");
        dot.className = "search-keyword-color-dot";
        dot.style.background = keyword.color || "#dbeafe";

        const name = document.createElement("span");
        name.textContent = keyword.name || "Keyword";

        button.append(dot, name);
        button.addEventListener("click", () => selectKeywordAndSearch(keyword));
        chips.appendChild(button);
      });

      elements.keywordResults.appendChild(chips);
    } catch (error) {
      if (requestId !== state.resultRequestId) return;
      loading.remove();

      if (error.status === 400) {
        setKeywordSummary(`Could not recognize ${displayReference}.`);
        const message = document.createElement("p");
        message.className = "search-keyword-empty is-error";
        message.textContent = "Enter a valid Scripture reference, for example John 3:16.";
        elements.keywordResults.appendChild(message);
        return;
      }

      const message = document.createElement("p");
      message.className = "search-keyword-empty is-error";
      message.textContent = error.status === 401
        ? "Log in to see your private Keywords for this Scripture."
        : (error.message || "Could not load associated Keywords.");
      elements.keywordResults.appendChild(message);
    }
  }

  async function fetchScripturePreview(item) {
    const bible = getCurrentBibleState();
    const reference = normalizeSearchText(item.reference || item.normalizedReference || "");
    const passageId = await buildPassageId(reference, item);

    if (!bible.bibleId || !passageId) return "";
    if (typeof API_KEY === "undefined" || !API_KEY) return "";

    const cacheKey = `${bible.bibleId}::${passageId}`;
    if (state.passageCache.has(cacheKey)) return state.passageCache.get(cacheKey);

    const url =
      `https://api.scripture.api.bible/v1/bibles/${encodeURIComponent(bible.bibleId)}` +
      `/passages/${encodeURIComponent(passageId)}` +
      "?content-type=html" +
      "&include-notes=false" +
      "&include-titles=false" +
      "&include-chapter-numbers=false" +
      "&include-verse-numbers=false" +
      "&include-verse-spans=false";

    const response = await fetch(url, {
      method: "GET",
      headers: { "api-key": API_KEY }
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Could not load verse preview.");
    }

    if (
      result.meta?.fumsId &&
      window._BAPI &&
      typeof window._BAPI.t === "function"
    ) {
      try {
        window._BAPI.t(result.meta.fumsId);
      } catch (error) {
        console.warn("FUMS tracking failed:", error);
      }
    }

    const plainText = htmlToPlainText(result.data?.content || "");
    const preview = truncatePreview(plainText, SCRIPTURE_PREVIEW_LIMIT);
    state.passageCache.set(cacheKey, preview);
    return preview;
  }

  async function buildPassageId(reference, item = {}) {
    const parsed = parseReferenceQuery(reference);
    if (!parsed) return "";

    const bookId =
      String(item.bookId || "").toUpperCase() ||
      await getStableBookIdForReferenceBook(parsed.bookText);

    if (!bookId) return "";

    const locator = parsed.locator;
    let match = locator.match(/^(\d+)$/);
    if (match) return `${bookId}.${match[1]}`;

    match = locator.match(/^(\d+)-(\d+)$/);
    if (match) return `${bookId}.${match[1]}-${bookId}.${match[2]}`;

    match = locator.match(/^(\d+):(\d+)$/);
    if (match) return `${bookId}.${match[1]}.${match[2]}`;

    match = locator.match(/^(\d+):(\d+)-(\d+)$/);
    if (match) {
      return `${bookId}.${match[1]}.${match[2]}-${bookId}.${match[1]}.${match[3]}`;
    }

    match = locator.match(/^(\d+):(\d+)-(\d+):(\d+)$/);
    if (match) {
      return `${bookId}.${match[1]}.${match[2]}-${bookId}.${match[3]}.${match[4]}`;
    }

    return "";
  }

  function htmlToPlainText(html) {
    const holder = document.createElement("div");
    holder.innerHTML = html || "";
    return normalizeSearchText(holder.textContent || holder.innerText || "");
  }

  function truncatePreview(text, limit) {
    const normalized = normalizeSearchText(text);
    if (normalized.length <= limit) return normalized;

    const sliced = normalized.slice(0, limit + 1);
    const lastSpace = sliced.lastIndexOf(" ");
    const end = lastSpace > Math.floor(limit * 0.72) ? lastSpace : limit;
    return `${normalized.slice(0, end).trim()}...`;
  }

  function buildKeywordScriptureUrl(item) {
    const url = new URL("verse.html", window.location.href);
    const bible = getCurrentBibleState();
    const reference = normalizeSearchText(item.reference || item.normalizedReference || "");
    const parsed = parseReferenceQuery(reference);
    const bookId =
      String(item.bookId || "").toUpperCase() ||
      getBookIdSync(item.book || parsed?.bookText || "");
    const chapterNumber =
      Number(item.startChapter) ||
      Number(parsed?.locator?.match(/^\d+/)?.[0]) ||
      0;

    url.searchParams.set("bible", bible.bibleId);
    if (bible.bibleAbbr) url.searchParams.set("bibleAbbr", bible.bibleAbbr);
    if (bible.bibleName) url.searchParams.set("bibleName", bible.bibleName);
    if (bookId) url.searchParams.set("book", bookId);
    if (bookId && chapterNumber > 0) {
      url.searchParams.set("chapter", `${bookId}.${chapterNumber}`);
    }

    return url.toString();
  }
})();
