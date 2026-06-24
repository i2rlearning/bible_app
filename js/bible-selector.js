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
        "https://rest.api.bible/v1/bibles?language=eng&include-full-details=false"
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
        ? result.data
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
    getBookName,
    getChapterLabel,
    loadBibles,
    loadBooks,
    loadChapters,
    getChapterState,
    buildVerseUrl,
    clearCache
  };
})();
