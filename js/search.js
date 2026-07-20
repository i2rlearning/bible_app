"use strict";

(function () {
  const DEFAULT_BIBLE = {
    bibleId: "bba9f40183526463-018",
    bibleAbbr: "BSB",
    bibleName: "Berean Standard Bible"
  };

  const DEFAULT_PAGE_SIZE = 10;
  const PAGE_SIZE_OPTIONS = new Set([10, 25, 50]);
  const RAW_RESULTS_FETCH_STEP = 50;
  const API_PAGE_SIZE = 10;
  const STOP_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "been", "being", "by",
    "for", "from", "had", "has", "have", "he", "her", "his", "i", "in",
    "is", "it", "its", "of", "on", "or", "our", "she", "that", "the",
    "their", "them", "they", "this", "to", "was", "we", "were", "with",
    "you", "your"
  ]);

  const elements = {};
  const state = {
    bible: getInitialBibleState(),
    query: "",
    exactWordOnly: false,
    page: 0,
    pageSize: DEFAULT_PAGE_SIZE,
    allResults: [],
    rawResults: [],
    bookOrder: [],
    activeHighlightPatterns: [],
    passagePicker: null,
    activeApiQuery: "",
    nextApiOffset: 0,
    apiTotal: null,
    loadedAllRawResults: false
  };

  document.addEventListener("DOMContentLoaded", initializeSearchPage);

  function initializeSearchPage() {
    elements.form = document.getElementById("scripture-search-form");
    elements.input = document.getElementById("search-input");
    elements.exactWordOnly = document.getElementById("exact-word-only");
    elements.clear = document.getElementById("clear-search");
    elements.currentBible = document.getElementById("search-current-bible");
    elements.resultsTitle = document.getElementById("search-results-title");
    elements.resultsSummary = document.getElementById("search-results-summary");
    elements.status = document.getElementById("search-status");
    elements.resultsList = document.getElementById("results-list");
    elements.pagination = document.getElementById("search-pagination");
    elements.pageSize = document.getElementById("results-page-size");
    elements.resultsPanel = document.querySelector(".search-results-panel");

    const params = new URLSearchParams(window.location.search);
    state.query = normalizeSearchText(params.get("query") || "");
    state.exactWordOnly = params.get("exact") === "1";
    state.pageSize = getValidPageSize(params.get("pageSize"));

    if (elements.input) {
      elements.input.value = state.query;
      elements.input.focus();
    }

    if (elements.exactWordOnly) {
      elements.exactWordOnly.checked = state.exactWordOnly;
    }

    if (elements.pageSize) {
      elements.pageSize.value = String(state.pageSize);
    }

    updateCurrentBibleLabel();
    bindEvents();
    initializePassagePicker();

    if (!state.query) {
      renderEmptyState("");
    }

    loadBibleBookOrder()
      .catch((error) => {
        console.warn("Could not load Bible book order:", error);
        state.bookOrder = [];
      })
      .finally(() => {
        if (state.query) {
          runSearch(0, false);
        }
      });
  }

  function bindEvents() {
    elements.form?.addEventListener("submit", (event) => {
      event.preventDefault();
      state.query = normalizeSearchText(elements.input?.value || "");
      state.exactWordOnly = !!elements.exactWordOnly?.checked;

      if (!state.query) {
        setStatus("Please enter a word, phrase, or reference.", true);
        return;
      }

      runSearch(0, true);
    });

    elements.exactWordOnly?.addEventListener("change", () => {
      if (!state.query) return;

      state.exactWordOnly = !!elements.exactWordOnly.checked;
      runSearch(0, true);
    });

    elements.clear?.addEventListener("click", () => {
      state.query = "";
      state.page = 0;
      state.allResults = [];
      state.rawResults = [];
      state.activeHighlightPatterns = [];
      state.activeApiQuery = "";
      state.nextApiOffset = 0;
      state.apiTotal = null;
      state.loadedAllRawResults = false;

      if (elements.input) {
        elements.input.value = "";
        elements.input.focus();
      }

      if (elements.exactWordOnly) {
        elements.exactWordOnly.checked = false;
      }

      updateUrl();
      renderEmptyState("Enter a word, phrase, or reference to begin.");
    });

    elements.pageSize?.addEventListener("change", async () => {
      state.pageSize = getValidPageSize(elements.pageSize.value);
      state.page = 0;
      updateUrl();

      if (state.activeApiQuery) {
        setStatus("Loading more results...");
        await loadMoreResultsForCurrentSearch(state.pageSize);
        clearStatus();
      }

      if (state.allResults.length) {
        renderResults();
        scrollToResults();
      }
    });

    elements.resultsList?.addEventListener("click", (event) => {
      const copyButton = event.target.closest("[data-copy-result]");

      if (!copyButton) return;

      const result = state.allResults[Number(copyButton.dataset.copyResult)];

      if (!result) return;

      copyResult(result, copyButton);
    });
  }

  function getValidPageSize(value) {
    const numericValue = Number(value);

    return PAGE_SIZE_OPTIONS.has(numericValue)
      ? numericValue
      : DEFAULT_PAGE_SIZE;
  }

  function initializePassagePicker() {
    const root = document.getElementById("passage-picker");
    const menuLink = document.getElementById("openPassagePickerFromMenu");

    if (!root || !window.BibleSelector || !window.BibleLanguage) {
      return;
    }

    try {
      state.passagePicker = window.BibleSelector.createPassagePicker({
        root,
        languageController: window.BibleLanguage,
        current: {
          bibleId: state.bible.bibleId,
          bibleAbbr: state.bible.bibleAbbr,
          bibleName: state.bible.bibleName,
          bookId: "",
          bookName: "",
          chapterId: ""
        }
      });
    } catch (error) {
      console.error("Search passage picker failed to initialize:", error);
      return;
    }

    menuLink?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      window.closeNav?.();

      window.setTimeout(() => {
        state.passagePicker?.setOpen?.(true);
      }, 0);
    });
  }

  window.addEventListener("bible-preferences-changed", (event) => {
    const next = event.detail || {};

    state.bible = {
      bibleId: next.bibleId || state.bible.bibleId,
      bibleAbbr: next.bibleAbbr || state.bible.bibleAbbr,
      bibleName: next.bibleName || state.bible.bibleName
    };

    updateCurrentBibleLabel();

    state.passagePicker?.applyPreferences?.({
      languageApiUrl: next.languageApiUrl,
      bibleId: state.bible.bibleId,
      bibleAbbr: state.bible.bibleAbbr,
      bibleName: state.bible.bibleName
    });

    if (state.query) {
      state.bookOrder = [];
      loadBibleBookOrder()
        .catch((error) => {
          console.warn("Could not reload Bible book order:", error);
        })
        .finally(() => {
          runSearch(0, true);
        });
    }
  });

  function getInitialBibleState() {
    const params = new URLSearchParams(window.location.search);
    const urlBibleId =
      params.get("bible") ||
      params.get("version") ||
      params.get("bibleId") ||
      "";

    const urlState = {
      bibleId: urlBibleId,
      bibleAbbr:
        params.get("bibleAbbr") ||
        params.get("abbr") ||
        "",
      bibleName:
        params.get("bibleName") ||
        params.get("name") ||
        ""
    };

    if (urlState.bibleId) {
      return {
        bibleId: urlState.bibleId,
        bibleAbbr: urlState.bibleAbbr || "Selected Bible",
        bibleName: urlState.bibleName || urlState.bibleAbbr || "Selected Bible"
      };
    }

    const preferences = readPreferences();

    if (preferences.bibleId) {
      return {
        bibleId: preferences.bibleId,
        bibleAbbr: preferences.bibleAbbr || "Preferred Bible",
        bibleName: preferences.bibleName || preferences.bibleAbbr || "Preferred Bible"
      };
    }

    return { ...DEFAULT_BIBLE };
  }

  function readPreferences() {
    if (window.UserPreferences?.read) {
      return window.UserPreferences.read();
    }

    try {
      return JSON.parse(localStorage.getItem("branchOfIsraelPreferences") || "{}");
    } catch (error) {
      console.warn("Unable to read preferences:", error);
      return {};
    }
  }

  function updateCurrentBibleLabel() {
    const label = state.bible.bibleAbbr || state.bible.bibleName || "Selected Bible";

    if (elements.currentBible) {
      elements.currentBible.textContent = label;
    }
  }

  function normalizeSearchText(value) {
    return (value || "")
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getSearchTerms(query) {
    const withoutQuotes = query.replace(/^"|"$/g, "");
    const terms = withoutQuotes
      .toLowerCase()
      .match(/[a-z0-9]+(?:'[a-z0-9]+)?/gi);

    if (!terms) return [];

    const meaningful = terms.filter((term) => !STOP_WORDS.has(term));

    return meaningful.length ? meaningful : terms;
  }

  function isQuotedPhrase(query) {
    return /^".+"$/.test(query.trim());
  }

  function getExactPhrase(query) {
    return isQuotedPhrase(query)
      ? query.trim().slice(1, -1)
      : "";
  }

  function buildSearchQueries(query) {
    const normalized = normalizeSearchText(query);
    const exactPhrase = getExactPhrase(normalized);

    return [exactPhrase || normalized].filter(Boolean);
  }

  function buildWordVariants(word) {
    const variants = new Set([word]);

    if (word.length < 3) {
      return Array.from(variants);
    }

    getWordFamilyForms(word).forEach((variant) => variants.add(variant));

    return Array.from(variants);
  }

  function getWordFamilyForms(word) {
    const forms = new Set([word]);

    forms.add(`${word}s`);
    forms.add(`${word}es`);
    forms.add(`${word}ed`);
    forms.add(`${word}ing`);
    forms.add(`${word}er`);
    forms.add(`${word}ers`);
    forms.add(`${word}est`);
    forms.add(`${word}ful`);
    forms.add(`${word}fulness`);
    forms.add(`${word}ward`);
    forms.add(`${word}wards`);

    if (word.endsWith("e")) {
      forms.add(`${word}d`);
      forms.add(`${word.slice(0, -1)}ing`);
    }

    if (word.endsWith("y")) {
      forms.add(`${word.slice(0, -1)}ies`);
      forms.add(`${word.slice(0, -1)}ied`);
    }

    if (word.endsWith("ain")) {
      const stem = word.slice(0, -3);

      forms.add(`${stem}ain`);
      forms.add(`${stem}ains`);
      forms.add(`${stem}ained`);
      forms.add(`${stem}aining`);
      forms.add(`${stem}ainer`);
      forms.add(`${stem}ainers`);
      forms.add(`${stem}inence`);
      forms.add(`${stem}inences`);
      forms.add(`${stem}inent`);
      forms.add(`${stem}inently`);
    }

    if (word === "east" || word === "west" || word === "north" || word === "south") {
      forms.add(`${word}ern`);
      forms.add(`${word}ward`);
      forms.add(`${word}wards`);
    }

    return Array.from(forms).filter(Boolean);
  }

  async function runSearch(page, shouldUpdateUrl) {
    state.page = page;
    state.query = normalizeSearchText(elements.input?.value || state.query);
    state.exactWordOnly = !!elements.exactWordOnly?.checked;

    if (!state.query) {
      renderEmptyState("");
      return;
    }

    if (shouldUpdateUrl) {
      updateUrl();
    }

    showResultsPanel();
    setStatus("Searching...");
    clearResults();
    resetSearchProgress(buildSearchQueries(state.query)[0] || state.query);

    try {
      await loadMoreResultsForCurrentSearch((page + 1) * state.pageSize);
      renderResults();
    } catch (error) {
      console.error("Search failed:", error);
      setStatus(
        "Search did not return results. Try removing quotes, using fewer words, or checking the spelling.",
        true
      );
      clearResults();
    }
  }

  function updateUrl() {
    const params = new URLSearchParams();

    params.set("bible", state.bible.bibleId);

    if (state.bible.bibleAbbr) {
      params.set("bibleAbbr", state.bible.bibleAbbr);
    }

    if (state.bible.bibleName) {
      params.set("bibleName", state.bible.bibleName);
    }

    if (state.query) {
      params.set("query", state.query);
    }

    if (state.exactWordOnly) {
      params.set("exact", "1");
    }

    if (state.pageSize !== DEFAULT_PAGE_SIZE) {
      params.set("pageSize", String(state.pageSize));
    }

    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", nextUrl);
  }

  async function loadBibleBookOrder() {
    if (!state.bible.bibleId) return [];

    const response = await fetch(
      `https://api.scripture.api.bible/v1/bibles/${encodeURIComponent(state.bible.bibleId)}/books`,
      {
        headers: {
          "api-key": API_KEY
        }
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Could not load Bible books.");
    }

    state.bookOrder = (result.data || []).map((book, index) => ({
      id: book.id,
      name: book.name || "",
      abbreviation: book.abbreviation || "",
      order: index
    }));

    return state.bookOrder;
  }

  function resetSearchProgress(query) {
    state.activeApiQuery = query;
    state.rawResults = [];
    state.allResults = [];
    state.activeHighlightPatterns = [];
    state.nextApiOffset = 0;
    state.apiTotal = null;
    state.loadedAllRawResults = false;
  }

  async function loadMoreResultsForCurrentSearch(targetFilteredCount) {
    if (!state.activeApiQuery || state.loadedAllRawResults) {
      return;
    }

    let lastLoadedCount = -1;

    while (
      !state.loadedAllRawResults &&
      state.allResults.length < targetFilteredCount &&
      state.allResults.length !== lastLoadedCount
    ) {
      lastLoadedCount = state.allResults.length;

      const pages = await fetchNextRawResultBatch(state.activeApiQuery);
      const batchResults = [];

      pages.forEach((page) => {
        batchResults.push(...normalizeApiData(page.data));
      });

      state.rawResults.push(
        ...batchResults.map((result) => ({
          ...result,
          matchedQuery: state.activeApiQuery
        }))
      );

      const prepared = prepareResults(state.rawResults, state.query);
      state.allResults = prepared.results;
      state.activeHighlightPatterns = prepared.highlightPatterns;
    }
  }

  async function fetchNextRawResultBatch(query) {
    const offsets = [];
    const batchLimit = state.nextApiOffset + RAW_RESULTS_FETCH_STEP;

    for (
      let offset = state.nextApiOffset;
      offset < batchLimit;
      offset += API_PAGE_SIZE
    ) {
      if (state.apiTotal !== null && offset >= state.apiTotal) break;

      offsets.push(offset);
    }

    if (!offsets.length) {
      state.loadedAllRawResults = true;
      return [];
    }

    const pages = await Promise.allSettled(
      offsets.map((offset) => fetchSearchPage(query, offset))
    );

    const fulfilledPages = [];
    let firstError = null;

    pages.forEach((page) => {
      if (page.status === "fulfilled") {
        fulfilledPages.push(page.value);

        if (state.apiTotal === null) {
          state.apiTotal = Number(page.value.data?.total || 0);
        }

        return;
      }

      firstError ||= page.reason;
    });

    state.nextApiOffset = offsets[offsets.length - 1] + API_PAGE_SIZE;

    if (
      !fulfilledPages.length ||
      (state.apiTotal !== null && state.nextApiOffset >= state.apiTotal)
    ) {
      state.loadedAllRawResults = true;
    }

    if (!fulfilledPages.length && firstError) {
      throw firstError;
    }

    return fulfilledPages;
  }

  async function fetchSearchPage(query, offset) {
    if (!state.bible.bibleId) {
      throw new Error("No Bible version is selected.");
    }

    if (typeof API_KEY === "undefined" || !API_KEY) {
      throw new Error("The Bible API key is not available.");
    }

    const url =
      `https://api.scripture.api.bible/v1/bibles/${encodeURIComponent(state.bible.bibleId)}` +
      `/search?query=${encodeURIComponent(query)}&offset=${offset}`;

    const response = await fetch(url, {
      headers: {
        "api-key": API_KEY
      }
    });

    const result = await response.json();

    if (
      result.meta &&
      result.meta.fumsId &&
      window._BAPI &&
      typeof window._BAPI.t === "function"
    ) {
      try {
        window._BAPI.t(result.meta.fumsId);
      } catch (error) {
        console.warn("FUMS tracking failed:", error);
      }
    }

    if (!response.ok) {
      throw new Error(result.message || "Search request failed.");
    }

    return result;
  }

  function normalizeApiData(data = {}) {
    const results = [];

    (data.verses || []).forEach((verse) => {
      results.push({
        type: "verse",
        id: verse.id || "",
        reference: verse.reference || "",
        text: verse.text || "",
        chapterId: verse.chapterId || "",
        bookId: verse.bookId || "",
        raw: verse
      });
    });

    (data.passages || []).forEach((passage) => {
      results.push({
        type: "passage",
        id: passage.id || "",
        reference: passage.reference || "",
        html: passage.content || "",
        text: htmlToPlainText(passage.content || ""),
        chapterId: Array.isArray(passage.chapterIds) ? passage.chapterIds[0] : "",
        bookId: "",
        raw: passage
      });
    });

    return results;
  }

  function prepareResults(rawResults, query) {
    const highlightPatterns = buildHighlightPatterns(query);
    const deduped = dedupeResults(rawResults);
    const filtered = deduped.filter((result) => resultMatchesQueryMode(result, query));

    const scored = filtered.map((result) => ({
      ...result,
      score: scoreResult(result, query)
    }));

    scored.sort(compareResults);

    return {
      results: scored,
      highlightPatterns
    };
  }

  function dedupeResults(results) {
    const unique = new Map();

    results.forEach((result) => {
      const key = getResultKey(result);

      if (!unique.has(key)) {
        unique.set(key, result);
        return;
      }

      const existing = unique.get(key);

      existing.matchedQuery = mergeMatchedQueries(existing.matchedQuery, result.matchedQuery);
    });

    return Array.from(unique.values());
  }

  function getResultKey(result) {
    if (result.id) {
      return `${result.type}:${result.id}`;
    }

    return [
      result.type,
      state.bible.bibleId,
      normalizeComparableText(result.reference),
      result.chapterId,
      normalizeComparableText(result.text).slice(0, 160)
    ].join(":");
  }

  function mergeMatchedQueries(first, second) {
    return Array.from(new Set([first, second].filter(Boolean))).join(", ");
  }

  function resultMatchesQueryMode(result, query) {
    const exactPhrase = getExactPhrase(query);
    const text = `${result.reference} ${result.text}`;

    if (exactPhrase) {
      return normalizeComparableText(text).includes(
        normalizeComparableText(exactPhrase)
      );
    }

    const terms = getSearchTerms(query);

    if (!terms.length) {
      return true;
    }

    if (state.exactWordOnly) {
      return terms.some((term) => exactWordRegex(term).test(text));
    }

    return terms.some((term) => wordFamilyRegex(term).test(text));
  }

  function scoreResult(result, query) {
    const text = `${result.reference} ${result.text}`;
    const normalizedText = normalizeComparableText(text);
    const normalizedQuery = normalizeComparableText(query.replace(/^"|"$/g, ""));
    const terms = getSearchTerms(query);

    let score = 0;

    if (normalizedQuery && normalizedText.includes(normalizedQuery)) {
      score += 1000;
    }

    terms.forEach((term) => {
      if (exactWordRegex(term).test(text)) {
        score += 120;
      } else if (!state.exactWordOnly && wordFamilyRegex(term).test(text)) {
        score += 55;
      }
    });

    if (
      terms.length > 1 &&
      terms.every((term) => exactWordRegex(term).test(text))
    ) {
      score += 500;
    }

    if (result.type === "passage") {
      score += 25;
    }

    return score;
  }

  function compareResults(a, b) {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    const bookA = getBookOrderFromReference(a.reference);
    const bookB = getBookOrderFromReference(b.reference);

    if (bookA !== bookB) {
      return bookA - bookB;
    }

    const chapterA = getChapterNumber(a.reference);
    const chapterB = getChapterNumber(b.reference);

    if (chapterA !== chapterB) {
      return chapterA - chapterB;
    }

    return getVerseNumber(a.reference) - getVerseNumber(b.reference);
  }

  function buildHighlightPatterns(query) {
    const exactPhrase = getExactPhrase(query);
    const patterns = [];

    if (exactPhrase) {
      patterns.push({
        type: "phrase",
        value: exactPhrase
      });
      return patterns;
    }

    getSearchTerms(query).forEach((term) => {
      patterns.push({
        type: state.exactWordOnly ? "exact" : "family",
        value: term
      });
    });

    return patterns;
  }

  function renderResults() {
    const total = state.allResults.length;

    if (!total) {
      renderEmptyState(`No results found for “${state.query}”.`);
      return;
    }

    const start = state.page * state.pageSize;
    const end = Math.min(start + state.pageSize, total);
    const pageResults = state.allResults.slice(start, end);

    clearStatus();

    if (elements.resultsTitle) {
      elements.resultsTitle.textContent = `Results for “${state.query}”`;
    }

    if (elements.resultsSummary) {
      const moreMarker = state.loadedAllRawResults ? "" : "+";
      elements.resultsSummary.textContent =
        `${start + 1}-${end} of ${total}${moreMarker}`;
    }

    if (!elements.resultsList) return;

    elements.resultsList.innerHTML = "";

    pageResults.forEach((result, indexOnPage) => {
      const globalIndex = start + indexOnPage;
      elements.resultsList.appendChild(createResultElement(result, globalIndex));
    });

    renderPagination(total);
  }

  function createResultElement(result, globalIndex) {
    const article = document.createElement("article");
    article.className = "search-result";

    const title = document.createElement("h3");
    title.className = "search-result-reference";
    title.textContent = result.reference || "Search Result";

    const text = document.createElement("p");
    text.className = "search-result-text";

    if (result.type === "passage" && result.html) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = result.html;
      highlightElementText(wrapper, state.activeHighlightPatterns);
      text.innerHTML = wrapper.innerHTML;
    } else {
      text.innerHTML = highlightPlainText(result.text || "", state.activeHighlightPatterns);
    }

    const actions = document.createElement("div");
    actions.className = "search-result-actions";

    const openLink = document.createElement("a");
    openLink.className = "search-result-action";
    openLink.href = buildChapterUrl(result);
    openLink.textContent = "Open Chapter";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "search-result-action is-secondary";
    copyButton.dataset.copyResult = String(globalIndex);
    copyButton.textContent = "Copy";

    actions.append(openLink, copyButton);
    article.append(title, text, actions);

    return article;
  }

  function renderPagination(total) {
    if (!elements.pagination) return;

    const totalPages = Math.ceil(total / state.pageSize);
    const canLoadMore = !state.loadedAllRawResults;

    elements.pagination.innerHTML = "";

    if (totalPages <= 1 && !canLoadMore) {
      return;
    }

    const previousButton = document.createElement("button");
    previousButton.type = "button";
    previousButton.className = "search-page-button";
    previousButton.textContent = "Previous";
    previousButton.disabled = state.page === 0;
    previousButton.addEventListener("click", () => {
      if (state.page > 0) {
        state.page -= 1;
        renderResults();
        scrollToResults();
      }
    });

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.className = "search-page-button";
    nextButton.textContent = "Next";
    nextButton.disabled = state.page >= totalPages - 1 && !canLoadMore;
    nextButton.addEventListener("click", async () => {
      const nextPage = state.page + 1;
      const requiredResultCount = (nextPage + 1) * state.pageSize;

      if (
        state.allResults.length < requiredResultCount &&
        !state.loadedAllRawResults
      ) {
        nextButton.disabled = true;
        setStatus("Loading more results...");
        await loadMoreResultsForCurrentSearch(requiredResultCount);
        clearStatus();
      }

      if (state.allResults.length > nextPage * state.pageSize) {
        state.page = nextPage;
      }

      renderResults();
      scrollToResults();
    });

    const pageCount = document.createElement("span");
    pageCount.className = "search-page-count";
    pageCount.textContent = state.loadedAllRawResults
      ? `Page ${state.page + 1} of ${Math.max(totalPages, 1)}`
      : `Page ${state.page + 1}`;

    elements.pagination.append(previousButton, pageCount, nextButton);
  }

  function renderEmptyState(message) {
    if (!state.query) {
      hideResultsPanel();
      clearStatus();
      clearResults();
      return;
    }

    showResultsPanel();

    if (elements.resultsTitle) {
      elements.resultsTitle.textContent = "Results";
    }

    if (elements.resultsSummary) {
      elements.resultsSummary.textContent = message || "";
    }

    clearStatus();
    clearResults();
  }

  function showResultsPanel() {
    if (elements.resultsPanel) {
      elements.resultsPanel.hidden = false;
    }
  }

  function hideResultsPanel() {
    if (elements.resultsPanel) {
      elements.resultsPanel.hidden = true;
    }
  }

  function clearResults() {
    if (elements.resultsList) {
      elements.resultsList.innerHTML = "";
    }

    if (elements.pagination) {
      elements.pagination.innerHTML = "";
    }
  }

  function setStatus(message, isError = false) {
    if (!elements.status) return;

    elements.status.textContent = message;
    elements.status.classList.toggle("is-error", isError);
  }

  function clearStatus() {
    setStatus("");
  }

  function scrollToResults() {
    document.querySelector(".search-results-panel")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function buildChapterUrl(result) {
    const url = new URL("verse.html", window.location.href);

    url.searchParams.set("bible", state.bible.bibleId);

    if (state.bible.bibleAbbr) {
      url.searchParams.set("bibleAbbr", state.bible.bibleAbbr);
    }

    if (state.bible.bibleName) {
      url.searchParams.set("bibleName", state.bible.bibleName);
    }

    if (result.bookId) {
      url.searchParams.set("book", result.bookId);
    }

    if (result.chapterId) {
      url.searchParams.set("chapter", result.chapterId);
    }

    return url.toString();
  }

  async function copyResult(result, button) {
    const text = `${result.reference}\n\n${result.text}`.trim();

    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      showCopied(button);
    } catch (error) {
      fallbackCopyText(text);
      showCopied(button);
    }
  }

  function fallbackCopyText(text) {
    const textarea = document.createElement("textarea");

    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";

    document.body.appendChild(textarea);
    textarea.select();

    try {
      document.execCommand("copy");
    } finally {
      textarea.remove();
    }
  }

  function showCopied(button) {
    const originalText = button.textContent;

    button.textContent = "Copied";

    window.setTimeout(() => {
      button.textContent = originalText || "Copy";
    }, 1200);
  }

  function highlightPlainText(text, patterns) {
    const root = document.createElement("span");
    root.textContent = text || "";

    highlightElementText(root, patterns);

    return root.innerHTML;
  }

  function highlightElementText(root, patterns) {
    if (!patterns.length) return;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;

          if (!parent || ["SCRIPT", "STYLE", "MARK"].includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          return node.nodeValue.trim()
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const nodes = [];

    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
    }

    nodes.forEach((node) => {
      const highlighted = highlightTextToFragment(node.nodeValue, patterns);

      if (highlighted) {
        node.parentNode.replaceChild(highlighted, node);
      }
    });
  }

  function highlightTextToFragment(text, patterns) {
    const matches = [];

    patterns.forEach((pattern) => {
      const regex = getHighlightRegex(pattern);
      let match;

      while ((match = regex.exec(text)) !== null) {
        const value = match[2] || match[1] || match[0];
        const offsetInsideMatch = match[0].indexOf(value);
        const start = match.index + Math.max(offsetInsideMatch, 0);
        const end = start + value.length;

        matches.push({ start, end });

        if (match.index === regex.lastIndex) {
          regex.lastIndex += 1;
        }
      }
    });

    if (!matches.length) {
      return null;
    }

    const cleanMatches = mergeOverlappingMatches(matches, text.length);
    const fragment = document.createDocumentFragment();
    let cursor = 0;

    cleanMatches.forEach((match) => {
      if (match.start > cursor) {
        fragment.appendChild(document.createTextNode(text.slice(cursor, match.start)));
      }

      const mark = document.createElement("mark");
      mark.textContent = text.slice(match.start, match.end);
      fragment.appendChild(mark);
      cursor = match.end;
    });

    if (cursor < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursor)));
    }

    return fragment;
  }

  function mergeOverlappingMatches(matches, textLength) {
    const sorted = matches
      .filter((match) => match.start >= 0 && match.end <= textLength && match.end > match.start)
      .sort((a, b) => a.start - b.start || b.end - a.end);

    const merged = [];

    sorted.forEach((match) => {
      const last = merged[merged.length - 1];

      if (!last || match.start > last.end) {
        merged.push({ ...match });
        return;
      }

      last.end = Math.max(last.end, match.end);
    });

    return merged;
  }

  function getHighlightRegex(pattern) {
    if (pattern.type === "phrase") {
      return new RegExp(escapeRegExp(pattern.value), "gi");
    }

    if (pattern.type === "exact") {
      return exactWordRegex(pattern.value);
    }

    return wordFamilyRegex(pattern.value);
  }

  function exactWordRegex(word) {
    return new RegExp(`(^|[^A-Za-z0-9])(${escapeRegExp(word)})(?=[^A-Za-z0-9]|$)`, "gi");
  }

  function wordFamilyRegex(word) {
    if (state.exactWordOnly) {
      return exactWordRegex(word);
    }

    const forms = getWordFamilyForms(word)
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp);

    return new RegExp(
      `(^|[^A-Za-z0-9])(${forms.join("|")})(?=[^A-Za-z0-9]|$)`,
      "gi"
    );
  }

  function normalizeComparableText(value) {
    return (value || "")
      .toLowerCase()
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
      .replace(/[^a-z0-9\s:-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function htmlToPlainText(html) {
    const element = document.createElement("div");

    element.innerHTML = html || "";

    return element.innerText.trim();
  }

  function getBookOrderFromReference(reference) {
    if (!reference || !state.bookOrder.length) {
      return 9999;
    }

    const normalizedReference = reference.toLowerCase();

    const matchedBook = state.bookOrder.find((book) => {
      const bookName = book.name.toLowerCase();
      const bookAbbreviation = book.abbreviation.toLowerCase();

      return (
        normalizedReference.startsWith(`${bookName} `) ||
        normalizedReference.startsWith(`${bookName}.`) ||
        normalizedReference === bookName ||
        normalizedReference.startsWith(`${bookAbbreviation} `) ||
        normalizedReference.startsWith(`${bookAbbreviation}.`) ||
        normalizedReference === bookAbbreviation
      );
    });

    return matchedBook ? matchedBook.order : 9999;
  }

  function getChapterNumber(reference) {
    const match = (reference || "").match(/\s(\d+):/);

    return match ? parseInt(match[1], 10) : 0;
  }

  function getVerseNumber(reference) {
    const match = (reference || "").match(/:(\d+)/);

    return match ? parseInt(match[1], 10) : 0;
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
})();
