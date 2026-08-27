"use strict";

// ============================================================================
// Keyword-aware Search
//
// This module extends search.html without changing the existing Bible-search
// engine in search.js. It adds two private, user-specific search directions:
//
//   Keyword -> connected Scriptures
//   Scripture reference -> associated Keywords
//
// Keyword autocomplete is intentionally capped so it stays usable with 100+
// Keywords. The existing backend/API and database relationships from Steps 0-3
// are reused; no new server route or migration is required.
// ============================================================================

(function () {
  const KEYWORD_SUGGESTION_LIMIT = 6;
  const KEYWORD_RESULT_LIMIT = 8;

  // Canonical Scripture book names -> stable API.Bible/USFM book IDs.
  // These are identifiers, not translations.
  const CANONICAL_BOOK_ID_MAP = new Map(Object.entries({
    "genesis": "GEN", "exodus": "EXO", "leviticus": "LEV", "numbers": "NUM",
    "deuteronomy": "DEU", "joshua": "JOS", "judges": "JDG", "ruth": "RUT",
    "1 samuel": "1SA", "2 samuel": "2SA", "1 kings": "1KI", "2 kings": "2KI",
    "1 chronicles": "1CH", "2 chronicles": "2CH", "ezra": "EZR", "nehemiah": "NEH",
    "esther": "EST", "job": "JOB", "psalms": "PSA", "psalm": "PSA",
    "proverbs": "PRO", "ecclesiastes": "ECC", "song of solomon": "SNG",
    "song of songs": "SNG", "isaiah": "ISA", "jeremiah": "JER",
    "lamentations": "LAM", "ezekiel": "EZK", "daniel": "DAN", "hosea": "HOS",
    "joel": "JOL", "amos": "AMO", "obadiah": "OBA", "jonah": "JON",
    "micah": "MIC", "nahum": "NAM", "habakkuk": "HAB", "zephaniah": "ZEP",
    "haggai": "HAG", "zechariah": "ZEC", "malachi": "MAL", "matthew": "MAT",
    "mark": "MRK", "luke": "LUK", "john": "JHN", "acts": "ACT",
    "romans": "ROM", "1 corinthians": "1CO", "2 corinthians": "2CO",
    "galatians": "GAL", "ephesians": "EPH", "philippians": "PHP",
    "colossians": "COL", "1 thessalonians": "1TH", "2 thessalonians": "2TH",
    "1 timothy": "1TI", "2 timothy": "2TI", "titus": "TIT", "philemon": "PHM",
    "hebrews": "HEB", "james": "JAS", "1 peter": "1PE", "2 peter": "2PE",
    "1 john": "1JN", "2 john": "2JN", "3 john": "3JN", "jude": "JUD",
    "revelation": "REV"
  }));

  const elements = {};
  const state = {
    keywords: [],
    keywordLibraryLoaded: false,
    keywordLibraryUnavailable: false,
    keywordLibraryPromise: null,
    resultRequestId: 0,
    keywordSearchHasContent: false,
    bookOrder: [],
    bookOrderBibleId: "",
    bookOrderPromise: null,
    skipNextKeywordSubmit: false
  };

  document.addEventListener("DOMContentLoaded", initializeKeywordSearch);

  function initializeKeywordSearch() {
    elements.form = document.getElementById("scripture-search-form");
    elements.input = document.getElementById("search-input");
    elements.exactWordOnly = document.getElementById("exact-word-only");
    elements.clear = document.getElementById("clear-search");
    elements.keywordSuggestions = document.getElementById("keyword-search-suggestions");
    elements.keywordResults = document.getElementById("keyword-search-results");
    elements.bibleResultsLabel = document.getElementById("bible-results-label");
    elements.resultsList = document.getElementById("results-list");
    elements.resultsSummary = document.getElementById("search-results-summary");

    if (!elements.form || !elements.input || !elements.keywordResults) {
      return;
    }

    bindKeywordSearchEvents();
    loadKeywordLibrary().catch(() => {});

    const initialQuery = normalizeSearchText(
      new URLSearchParams(window.location.search).get("query") || ""
    );

    if (initialQuery) {
      runKeywordSearch(initialQuery);
    }
  }

  function bindKeywordSearchEvents() {
    elements.input.addEventListener("input", updateKeywordSuggestions);
    elements.input.addEventListener("focus", updateKeywordSuggestions);
    elements.input.addEventListener("keydown", handleInputKeydown);

    elements.form.addEventListener("submit", () => {
      const query = normalizeSearchText(elements.input.value || "");
      closeKeywordSuggestions();

      if (state.skipNextKeywordSubmit) {
        state.skipNextKeywordSubmit = false;
        state.resultRequestId += 1;
        clearKeywordSearchResults();
        return;
      }

      if (query) {
        runKeywordSearch(query);
      } else {
        clearKeywordSearchResults();
      }
    });

    elements.clear?.addEventListener("click", () => {
      state.resultRequestId += 1;
      closeKeywordSuggestions();
      clearKeywordSearchResults();
    });

    elements.keywordSuggestions?.addEventListener(
      "keydown",
      handleKeywordSuggestionKeydown
    );

    document.addEventListener("pointerdown", (event) => {
      if (!event.target.closest(".search-input-shell")) {
        closeKeywordSuggestions();
      }
    });

    document.addEventListener("change", (event) => {
      if (event.target?.id !== "search-bible-select") return;

      state.bookOrder = [];
      state.bookOrderBibleId = "";
      state.bookOrderPromise = null;
    });

    window.addEventListener("bible-preferences-changed", () => {
      state.bookOrder = [];
      state.bookOrderBibleId = "";
      state.bookOrderPromise = null;
    });
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

    if (state.keywordLibraryUnavailable && !force) {
      return [];
    }

    if (state.keywordLibraryLoaded && !force) {
      return state.keywords;
    }

    if (state.keywordLibraryPromise) {
      return state.keywordLibraryPromise;
    }

    state.keywordLibraryPromise = (async () => {
      try {
        const result = await fetchAppJson("/api/study-tags");
        state.keywords = Array.isArray(result.tags) ? result.tags : [];
        state.keywordLibraryLoaded = true;
        state.keywordLibraryUnavailable = false;

        if (document.activeElement === elements.input) {
          updateKeywordSuggestions();
        }

        return state.keywords;
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          // Keywords are private. Normal Bible Search remains fully usable.
          state.keywordLibraryUnavailable = true;
          state.keywordLibraryLoaded = false;
          state.keywords = [];
          closeKeywordSuggestions();
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

  function getKeywordMatches(query) {
    const needle = normalizeKeywordQuery(query);

    if (needle.length < 2) {
      return [];
    }

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

  function updateKeywordSuggestions() {
    if (!elements.input || !elements.keywordSuggestions) return;

    const query = normalizeSearchText(elements.input.value || "");

    if (
      query.length < 2 ||
      parseReferenceQuery(query) ||
      !state.keywordLibraryLoaded ||
      state.keywordLibraryUnavailable
    ) {
      closeKeywordSuggestions();
      return;
    }

    const matches = getKeywordMatches(query).slice(0, KEYWORD_SUGGESTION_LIMIT);

    if (!matches.length) {
      closeKeywordSuggestions();
      return;
    }

    const panel = elements.keywordSuggestions;
    panel.innerHTML = "";

    const heading = document.createElement("div");
    heading.className = "search-keyword-suggestion-heading";
    heading.textContent = "Keywords";
    panel.appendChild(heading);

    matches.forEach((keyword) => {
      panel.appendChild(createKeywordSuggestionButton(keyword));
    });

    const bibleSearch = document.createElement("button");
    bibleSearch.type = "button";
    bibleSearch.className =
      "search-keyword-suggestion search-keyword-bible-suggestion";
    bibleSearch.dataset.keywordSuggestion = "bible";
    bibleSearch.setAttribute("role", "option");

    const bibleLabel = document.createElement("span");
    bibleLabel.className = "search-keyword-suggestion-name";
    bibleLabel.textContent = `Search Bible for “${query}”`;

    const bibleHint = document.createElement("span");
    bibleHint.className = "search-keyword-suggestion-count";
    bibleHint.textContent = "Bible Search";

    bibleSearch.append(bibleLabel, bibleHint);
    bibleSearch.addEventListener("click", () => {
      state.skipNextKeywordSubmit = true;
      closeKeywordSuggestions();
      elements.form.requestSubmit();
    });

    panel.appendChild(bibleSearch);
    panel.hidden = false;
    elements.input.setAttribute("aria-expanded", "true");
  }

  function createKeywordSuggestionButton(keyword) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-keyword-suggestion";
    button.dataset.keywordSuggestion = String(keyword.id || "");
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

  function closeKeywordSuggestions() {
    if (elements.keywordSuggestions) {
      elements.keywordSuggestions.hidden = true;
      elements.keywordSuggestions.innerHTML = "";
    }

    elements.input?.setAttribute("aria-expanded", "false");
  }

  function handleInputKeydown(event) {
    if (event.key === "ArrowDown" && !elements.keywordSuggestions?.hidden) {
      const first = elements.keywordSuggestions.querySelector(
        "button[data-keyword-suggestion]"
      );

      if (first) {
        event.preventDefault();
        first.focus();
      }
      return;
    }

    if (event.key === "Escape") {
      closeKeywordSuggestions();
    }
  }

  function handleKeywordSuggestionKeydown(event) {
    if (!elements.keywordSuggestions || elements.keywordSuggestions.hidden) return;

    const buttons = Array.from(
      elements.keywordSuggestions.querySelectorAll("button[data-keyword-suggestion]")
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

      if (currentIndex <= 0) {
        elements.input.focus();
      } else {
        buttons[currentIndex - 1].focus();
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeKeywordSuggestions();
      elements.input.focus();
    }
  }

  function selectKeywordAndSearch(keyword) {
    if (!keyword?.name || !elements.input) return;

    elements.input.value = keyword.name;

    if (elements.exactWordOnly) {
      elements.exactWordOnly.checked = false;
    }

    closeKeywordSuggestions();
    elements.form.requestSubmit();
  }

  function parseReferenceQuery(query) {
    const normalized = normalizeSearchText(query)
      .replace(/^"|"$/g, "")
      .replace(/[.;,]+$/g, "")
      .trim();

    if (!normalized) return null;

    // Supports chapter, chapter range, verse, verse range, and cross-chapter range.
    // The book portion is Unicode-friendly so selected-Bible book names can be
    // recognized even when the visible language is not English.
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

  function normalizeReferenceBookKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[.'’]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getCurrentBibleState() {
    const params = new URLSearchParams(window.location.search);
    const select = document.getElementById("search-bible-select");
    const selectedOption = select?.options?.[select.selectedIndex] || null;
    const preferences = readPreferences();

    return {
      bibleId:
        params.get("bible") ||
        select?.value ||
        preferences.bibleId ||
        "bba9f40183526463-018",
      bibleAbbr:
        params.get("bibleAbbr") ||
        selectedOption?.dataset?.abbr ||
        selectedOption?.textContent ||
        preferences.bibleAbbr ||
        "BSB",
      bibleName:
        params.get("bibleName") ||
        selectedOption?.dataset?.name ||
        selectedOption?.textContent ||
        preferences.bibleName ||
        "Berean Standard Bible"
    };
  }

  function readPreferences() {
    if (window.UserPreferences?.read) {
      return window.UserPreferences.read();
    }

    try {
      return JSON.parse(localStorage.getItem("branchOfIsraelPreferences") || "{}");
    } catch (error) {
      return {};
    }
  }

  async function ensureSelectedBibleBookOrder() {
    const bible = getCurrentBibleState();

    if (!bible.bibleId) {
      return [];
    }

    if (
      state.bookOrderBibleId === bible.bibleId &&
      state.bookOrder.length
    ) {
      return state.bookOrder;
    }

    if (state.bookOrderPromise) {
      return state.bookOrderPromise;
    }

    if (typeof API_KEY === "undefined" || !API_KEY) {
      return [];
    }

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
        console.warn("Could not load Bible books for Keyword reference matching:", error);
        state.bookOrder = [];
        state.bookOrderBibleId = bible.bibleId;
        return [];
      } finally {
        state.bookOrderPromise = null;
      }
    })();

    return state.bookOrderPromise;
  }

  async function getStableBookIdForReferenceBook(bookText) {
    const key = normalizeReferenceBookKey(bookText);

    if (!key) return "";

    const canonicalId = CANONICAL_BOOK_ID_MAP.get(key);
    if (canonicalId) return canonicalId;

    await ensureSelectedBibleBookOrder();

    const selectedBibleBook = state.bookOrder.find((book) => {
      return [book.id, book.name, book.abbreviation]
        .filter(Boolean)
        .some((value) => normalizeReferenceBookKey(value) === key);
    });

    return selectedBibleBook?.id || "";
  }

  async function getKeywordLookupReference(query) {
    const parsed = parseReferenceQuery(query);

    if (!parsed) return "";

    const bookId = await getStableBookIdForReferenceBook(parsed.bookText);
    const lookupBook = bookId || parsed.bookText;

    return `${lookupBook} ${parsed.locator}`.trim();
  }

  async function runKeywordSearch(query) {
    state.resultRequestId += 1;
    const requestId = state.resultRequestId;

    clearKeywordSearchResults();
    closeKeywordSuggestions();

    await loadKeywordLibrary();

    if (requestId !== state.resultRequestId || state.keywordLibraryUnavailable) {
      return;
    }

    const parsedReference = parseReferenceQuery(query);

    if (parsedReference) {
      const lookupReference = await getKeywordLookupReference(query);

      if (requestId !== state.resultRequestId) return;

      await renderReferenceKeywordResults(query, lookupReference, requestId);
      return;
    }

    const matches = getKeywordMatches(query);

    if (!matches.length) {
      return;
    }

    const exact = matches.find(
      (keyword) => normalizeKeywordQuery(keyword.name) === normalizeKeywordQuery(query)
    );

    if (exact) {
      await renderKeywordDetail(exact, requestId);
      return;
    }

    renderKeywordMatchResults(matches, query);
  }

  function clearKeywordSearchResults() {
    if (elements.keywordResults) {
      elements.keywordResults.innerHTML = "";
      elements.keywordResults.hidden = true;
    }

    state.keywordSearchHasContent = false;
    updateBibleResultsLabel();
  }

  function showKeywordSearchContainer() {
    if (!elements.keywordResults) return null;

    elements.keywordResults.hidden = false;
    elements.keywordResults.innerHTML = "";
    state.keywordSearchHasContent = true;
    updateBibleResultsLabel();

    return elements.keywordResults;
  }

  function updateBibleResultsLabel() {
    if (!elements.bibleResultsLabel) return;

    const hasBibleResults = Boolean(elements.resultsList?.children?.length);
    elements.bibleResultsLabel.hidden = !state.keywordSearchHasContent || !hasBibleResults;
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
    const container = showKeywordSearchContainer();
    if (!container) return;

    const visible = matches.slice(0, KEYWORD_RESULT_LIMIT);

    container.appendChild(
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

      keywords.forEach((keyword) => {
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
        list.appendChild(button);
      });
    };

    renderRows(visible);
    container.appendChild(list);

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
      container.appendChild(more);
    }

    refreshBibleResultSeparationSoon();
  }

  async function renderKeywordDetail(keyword, requestId) {
    const container = showKeywordSearchContainer();
    if (!container) return;

    const initialCount = Math.max(0, Number(keyword.scriptureCount) || 0);

    container.appendChild(
      createKeywordSectionHeading(
        "Keyword",
        keyword.name || "Keyword",
        `${initialCount} Scripture${initialCount === 1 ? "" : "s"}`
      )
    );

    const loading = document.createElement("p");
    loading.className = "search-keyword-loading";
    loading.textContent = "Loading connected Scriptures...";
    container.appendChild(loading);

    try {
      const result = await fetchAppJson(
        `/api/study-tags/${encodeURIComponent(keyword.id)}/scriptures`
      );

      if (requestId !== state.resultRequestId) return;

      const scriptures = Array.isArray(result.scriptures) ? result.scriptures : [];
      container.innerHTML = "";

      container.appendChild(
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
        container.appendChild(empty);
        refreshBibleResultSeparationSoon();
        return;
      }

      const list = document.createElement("div");
      list.className = "search-keyword-scripture-list";

      scriptures.forEach((item) => {
        list.appendChild(createKeywordScriptureRow(item));
      });

      container.appendChild(list);
      refreshBibleResultSeparationSoon();
    } catch (error) {
      if (requestId !== state.resultRequestId) return;

      container.innerHTML = "";
      container.appendChild(
        createKeywordSectionHeading("Keyword", keyword.name || "Keyword")
      );

      const message = document.createElement("p");
      message.className = "search-keyword-empty is-error";
      message.textContent = error.status === 401
        ? "Log in to search your private Keywords."
        : (error.message || "Could not load this Keyword's Scriptures.");
      container.appendChild(message);
      refreshBibleResultSeparationSoon();
    }
  }

  function createKeywordScriptureRow(item) {
    const row = document.createElement("div");
    row.className = "search-keyword-scripture-row";

    const text = document.createElement("div");
    text.className = "search-keyword-scripture-text";

    const reference = document.createElement("strong");
    reference.textContent = item.reference || item.normalizedReference || "Scripture";
    text.appendChild(reference);

    if (item.note) {
      const note = document.createElement("p");
      note.textContent = item.note;
      text.appendChild(note);
    }

    const open = document.createElement("a");
    open.className = "search-keyword-open-link";
    open.href = buildKeywordScriptureUrl(item);
    open.textContent = "Open Chapter";

    row.append(text, open);
    return row;
  }

  async function renderReferenceKeywordResults(displayReference, lookupReference, requestId) {
    if (!lookupReference) return;

    const container = showKeywordSearchContainer();
    if (!container) return;

    container.appendChild(
      createKeywordSectionHeading("Associated Keywords", displayReference)
    );

    const loading = document.createElement("p");
    loading.className = "search-keyword-loading";
    loading.textContent = "Checking your Keywords...";
    container.appendChild(loading);

    try {
      const result = await fetchAppJson(
        `/api/scripture-references/tags?reference=${encodeURIComponent(lookupReference)}`
      );

      if (requestId !== state.resultRequestId) return;

      const keywords = Array.isArray(result.tags) ? result.tags : [];
      container.innerHTML = "";

      container.appendChild(
        createKeywordSectionHeading(
          "Associated Keywords",
          displayReference,
          `${keywords.length} Keyword${keywords.length === 1 ? "" : "s"}`
        )
      );

      if (!keywords.length) {
        const empty = document.createElement("p");
        empty.className = "search-keyword-empty";
        empty.textContent = "No Keywords are associated with this Scripture yet.";
        container.appendChild(empty);
        refreshBibleResultSeparationSoon();
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

      container.appendChild(chips);
      refreshBibleResultSeparationSoon();
    } catch (error) {
      if (requestId !== state.resultRequestId) return;

      if (error.status === 400) {
        clearKeywordSearchResults();
        return;
      }

      container.innerHTML = "";
      container.appendChild(
        createKeywordSectionHeading("Associated Keywords", displayReference)
      );

      const message = document.createElement("p");
      message.className = "search-keyword-empty is-error";
      message.textContent = error.status === 401
        ? "Log in to see your private Keywords for this Scripture."
        : (error.message || "Could not load associated Keywords.");
      container.appendChild(message);
      refreshBibleResultSeparationSoon();
    }
  }

  function refreshBibleResultSeparationSoon() {
    window.requestAnimationFrame(() => {
      updateBibleResultsLabel();
      updateBibleEmptySummary();

      window.setTimeout(() => {
        updateBibleResultsLabel();
        updateBibleEmptySummary();
      }, 120);
    });
  }

  function updateBibleEmptySummary() {
    if (!state.keywordSearchHasContent || !elements.resultsSummary) return;

    const summary = elements.resultsSummary.textContent || "";

    if (/^No results found for /i.test(summary)) {
      elements.resultsSummary.textContent = summary.replace(
        /^No results found for /i,
        "No Bible results found for "
      );
    }
  }

  function buildKeywordScriptureUrl(item) {
    const url = new URL("verse.html", window.location.href);
    const bible = getCurrentBibleState();
    const reference = normalizeSearchText(
      item.reference || item.normalizedReference || ""
    );
    const parsed = parseReferenceQuery(reference);
    const canonicalBook = normalizeReferenceBookKey(
      item.book || parsed?.bookText || ""
    );
    const bookId =
      CANONICAL_BOOK_ID_MAP.get(canonicalBook) ||
      String(item.bookId || "").toUpperCase();
    const chapterNumber =
      Number(item.startChapter) ||
      Number(parsed?.locator?.match(/^\d+/)?.[0]) ||
      0;

    url.searchParams.set("bible", bible.bibleId);

    if (bible.bibleAbbr) {
      url.searchParams.set("bibleAbbr", bible.bibleAbbr);
    }

    if (bible.bibleName) {
      url.searchParams.set("bibleName", bible.bibleName);
    }

    if (bookId) {
      url.searchParams.set("book", bookId);
    }

    if (bookId && chapterNumber > 0) {
      url.searchParams.set("chapter", `${bookId}.${chapterNumber}`);
    }

    return url.toString();
  }
})();
