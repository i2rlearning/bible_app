/*
 * Project file: js/bible-search.js
 * Purpose: Provides shared Scripture search logic, using downloaded Bible data
 * when available and the online API when an online search is required.
 */

"use strict";

window.BibleSearch = (() => {
  const API_BASE_URL = "https://api.scripture.api.bible/v1";
  const localVerseCache = new Map();

  function normalizeLocalVerse(verse) {
    return {
      type: "verse",
      id: verse?.id || "",
      reference: verse?.reference || verse?.id || "",
      text: verse?.text || "",
      chapterId: verse?.chapterId || "",
      bookId: verse?.bookId || "",
      raw: verse || {},
      source: "local"
    };
  }

  async function canSearchLocal(bibleId) {
    if (!bibleId || !window.BibleOfflineDB) {
      return false;
    }

    try {
      return await window.BibleOfflineDB.isBibleReady(bibleId);
    } catch (error) {
      console.warn("Could not check local Bible search availability:", error);
      return false;
    }
  }

  async function getLocalVerseResults(bibleId) {
    if (!bibleId) {
      throw new Error("Bible id is required for local search.");
    }

    if (!(await canSearchLocal(bibleId))) {
      const error = new Error("This Bible is not available for local search.");
      error.code = "LOCAL_BIBLE_NOT_AVAILABLE";
      throw error;
    }

    if (localVerseCache.has(bibleId)) {
      return localVerseCache.get(bibleId);
    }

    const verses = await window.BibleOfflineDB.getVersesForBible(bibleId);
    const results = verses.map(normalizeLocalVerse);

    localVerseCache.set(bibleId, results);
    return results;
  }

  async function getApiSearchPage(bibleId, query, offset = 0) {
    if (!bibleId) {
      throw new Error("Bible id is required for search.");
    }

    if (!window.BibleData?.requestJson) {
      throw new Error("BibleData is unavailable.");
    }

    const url =
      `${API_BASE_URL}/bibles/${encodeURIComponent(bibleId)}` +
      `/search?query=${encodeURIComponent(query)}&offset=${Number(offset) || 0}`;

    const result = await window.BibleData.requestJson(url);

    if (
      result?.meta?.fumsId &&
      window._BAPI &&
      typeof window._BAPI.t === "function"
    ) {
      try {
        window._BAPI.t(result.meta.fumsId);
      } catch (error) {
        console.warn("FUMS tracking failed:", error);
      }
    }

    return result;
  }

  function clearLocalCache(bibleId = "") {
    if (bibleId) {
      localVerseCache.delete(bibleId);
      return;
    }

    localVerseCache.clear();
  }

  window.addEventListener("bible-download-complete", (event) => {
    clearLocalCache(event?.detail?.bibleId || "");
  });

  window.addEventListener("bible-download-removed", (event) => {
    clearLocalCache(event?.detail?.bibleId || "");
  });

  return Object.freeze({
    canSearchLocal,
    getLocalVerseResults,
    getApiSearchPage,
    clearLocalCache
  });
})();
