"use strict";

/*
 * BibleData
 *
 * Shared Bible data gateway.
 *
 * Page code should ask BibleData for Bible metadata, books, chapters, and
 * chapter content instead of deciding for itself whether to use API.Bible or
 * IndexedDB.
 *
 * The gateway prefers a complete local Bible when one is available and falls
 * back to API.Bible for data that has not been downloaded.
 */

window.BibleData = (() => {
  const API_BASE_URL = "https://api.scripture.api.bible/v1";

  function getApiKey() {
    if (typeof API_KEY === "undefined" || !API_KEY) {
      throw new Error(
        "API_KEY is unavailable. Load js/my_key.js before js/bible-data.js."
      );
    }

    return API_KEY;
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "api-key": getApiKey(),
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      const error = new Error(
        `API.Bible request failed with status ${response.status}.`
      );
      error.status = response.status;
      throw error;
    }

    return response.json();
  }

  function trackFums(meta) {
    if (!meta?.fumsId) {
      return;
    }

    if (!window._BAPI || typeof window._BAPI.t !== "function") {
      return;
    }

    try {
      window._BAPI.t(meta.fumsId);
    } catch (error) {
      console.warn("FUMS tracking failed:", error);
    }
  }

  async function getReadyLocalBible(bibleId) {
    if (!window.BibleOfflineDB || !bibleId) {
      return null;
    }

    try {
      return await window.BibleOfflineDB.getReadyBible(bibleId);
    } catch (error) {
      console.warn("Could not inspect local Bible availability:", error);
      return null;
    }
  }

  function createLocalIntegrityError(bibleId, detail) {
    const error = new Error(
      `The downloaded Bible ${bibleId} is marked ready but ${detail} is missing.`
    );
    error.code = "LOCAL_BIBLE_INCOMPLETE";
    return error;
  }

  async function isBibleReadyOffline(bibleId) {
    return Boolean(await getReadyLocalBible(bibleId));
  }

  function normalizeLocalBibleRecord(record) {
    if (!record) {
      return null;
    }

    const details =
      record.details && typeof record.details === "object"
        ? record.details
        : {};

    return {
      ...details,
      id: details.id || record.id || "",
      abbreviation:
        details.abbreviation ||
        details.abbreviationLocal ||
        record.abbreviation ||
        "",
      name:
        details.name ||
        details.nameLocal ||
        record.name ||
        "",
      _offlineReady: true,
      _source: "local"
    };
  }

  function getRequestedCatalogFilters(apiUrl) {
    try {
      const url = new URL(
        apiUrl,
        window.location?.origin || "https://example.invalid"
      );

      const languageId =
        String(url.searchParams.get("language") || "")
          .trim()
          .toLowerCase();

      const ids = new Set(
        String(url.searchParams.get("ids") || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      );

      return {
        languageId,
        ids
      };
    } catch (_error) {
      return {
        languageId: "",
        ids: new Set()
      };
    }
  }

  function getBibleLanguageId(bible) {
    return String(
      bible?.language?.id ||
      bible?.languageId ||
      bible?.language?.iso6393 ||
      bible?.language?.iso639_3 ||
      ""
    )
      .trim()
      .toLowerCase();
  }

  function filterLocalCatalogForRequest(bibles, apiUrl) {
    const { languageId, ids } =
      getRequestedCatalogFilters(apiUrl);

    return bibles.filter((bible) => {
      if (ids.size && !ids.has(String(bible?.id || ""))) {
        return false;
      }

      if (languageId) {
        return getBibleLanguageId(bible) === languageId;
      }

      return true;
    });
  }

  function markCatalogSource(bibles, source) {
    if (!Array.isArray(bibles)) {
      return [];
    }

    Object.defineProperty(
      bibles,
      "_source",
      {
        value: source,
        enumerable: false,
        configurable: true
      }
    );

    return bibles;
  }

  async function getLocalBibleCatalog(apiUrl) {
    if (
      !window.BibleOfflineDB ||
      typeof window.BibleOfflineDB.getReadyBibles !== "function"
    ) {
      return [];
    }

    try {
      const records =
        await window.BibleOfflineDB.getReadyBibles();

      const bibles =
        records
          .map(normalizeLocalBibleRecord)
          .filter(Boolean);

      return filterLocalCatalogForRequest(
        bibles,
        apiUrl
      );
    } catch (error) {
      console.warn(
        "Could not read the downloaded Bible catalog:",
        error
      );
      return [];
    }
  }

  function mergeBibleCatalogs(apiBibles, localBibles) {
    const merged = new Map();

    for (const bible of apiBibles) {
      if (!bible?.id) {
        continue;
      }

      merged.set(
        bible.id,
        {
          ...bible,
          _source: "api"
        }
      );
    }

    for (const bible of localBibles) {
      if (!bible?.id) {
        continue;
      }

      const apiBible = merged.get(bible.id);

      merged.set(
        bible.id,
        apiBible
          ? {
              ...bible,
              ...apiBible,
              _offlineReady: true
            }
          : bible
      );
    }

    return [...merged.values()];
  }

  async function getBibleCatalog(apiUrl, options = {}) {
    const localBibles =
      await getLocalBibleCatalog(apiUrl);

    const offlineHint =
      typeof navigator !== "undefined" &&
      navigator.onLine === false;

    if (options.localOnly === true || offlineHint) {
      return markCatalogSource(
        localBibles,
        "local"
      );
    }

    try {
      const result = await requestJson(apiUrl);
      const apiBibles =
        Array.isArray(result?.data)
          ? result.data
          : [];

      return markCatalogSource(
        mergeBibleCatalogs(
          apiBibles,
          localBibles
        ),
        "api"
      );
    } catch (error) {
      if (localBibles.length) {
        return markCatalogSource(
          localBibles,
          "local"
        );
      }

      throw error;
    }
  }

  async function getBibleDetails(bibleId) {
    if (!bibleId) {
      throw new Error("Bible id is required.");
    }

    const localBible = await getReadyLocalBible(bibleId);

    if (localBible) {
      const details =
        localBible.details && typeof localBible.details === "object"
          ? localBible.details
          : localBible;

      return {
        ...details,
        id: details.id || bibleId,
        _source: "local"
      };
    }

    const result = await requestJson(
      `${API_BASE_URL}/bibles/${encodeURIComponent(bibleId)}`
    );

    return {
      ...(result?.data || {}),
      _source: "api"
    };
  }

  async function getBooks(bibleId) {
    if (!bibleId) {
      return [];
    }

    const localBible = await getReadyLocalBible(bibleId);

    if (localBible) {
      const books = await window.BibleOfflineDB.getBooks(bibleId);

      if (!books.length) {
        throw createLocalIntegrityError(bibleId, "its book list");
      }

      return books.map(({ bibleId: _bibleId, order: _order, ...book }) => book);
    }

    const result = await requestJson(
      `${API_BASE_URL}/bibles/${encodeURIComponent(bibleId)}/books`
    );

    return Array.isArray(result?.data) ? result.data : [];
  }

  async function getChapters(bibleId, bookId) {
    if (!bibleId || !bookId) {
      return [];
    }

    const localBible = await getReadyLocalBible(bibleId);

    if (localBible) {
      const chapters = await window.BibleOfflineDB.getChapters(
        bibleId,
        bookId
      );

      if (!chapters.length) {
        throw createLocalIntegrityError(
          bibleId,
          `the chapter list for ${bookId}`
        );
      }

      return chapters.map(
        ({ bibleId: _bibleId, order: _order, ...chapter }) => chapter
      );
    }

    const result = await requestJson(
      `${API_BASE_URL}/bibles/${encodeURIComponent(
        bibleId
      )}/books/${encodeURIComponent(bookId)}/chapters`
    );

    return Array.isArray(result?.data) ? result.data : [];
  }

  async function getChapter(bibleId, chapterId, options = {}) {
    if (!bibleId || !chapterId) {
      throw new Error("Bible id and chapter id are required.");
    }

    const localBible = await getReadyLocalBible(bibleId);

    if (localBible) {
      const chapter = await window.BibleOfflineDB.getChapter(
        bibleId,
        chapterId
      );

      if (!chapter || typeof chapter.content !== "string") {
        throw createLocalIntegrityError(
          bibleId,
          `chapter ${chapterId}`
        );
      }

      trackFums(chapter.meta || {});

      return {
        content: chapter.content,
        data: {
          ...chapter,
          bibleId: undefined
        },
        meta: chapter.meta || {},
        source: "local"
      };
    }

    const query = new URLSearchParams({
      "content-type": options.contentType || "html",
      "include-notes":
        options.includeNotes === false ? "false" : "true"
    });

    const result = await requestJson(
      `${API_BASE_URL}/bibles/${encodeURIComponent(
        bibleId
      )}/chapters/${encodeURIComponent(chapterId)}?${query.toString()}`
    );

    trackFums(result?.meta);

    return {
      content: result?.data?.content || "",
      data: result?.data || {},
      meta: result?.meta || {},
      source: "api"
    };
  }

  return Object.freeze({
    API_BASE_URL,
    requestJson,
    getBibleCatalog,
    getBibleDetails,
    getBooks,
    getChapters,
    getChapter,
    isBibleReadyOffline
  });
})();
