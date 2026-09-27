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
 * Creates the gateway and connects the existing online reader to it.
 * Download creation is added in a later Step 2 checkpoint.
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

  async function getBibleCatalog(apiUrl) {
    const result = await requestJson(apiUrl);
    return Array.isArray(result?.data) ? result.data : [];
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
