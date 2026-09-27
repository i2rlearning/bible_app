"use strict";

/*
 * BibleDownloadManager
 *
 * Downloads one complete Bible at a time into BibleOfflineDB.
 *
 * The download is deliberately separate from page UI so the same service can
 * later be used from the unified Study Desk shell.
 *
 * A Bible is never considered usable locally until every expected chapter has
 * been downloaded, verse-indexed, verified, and the Bible record is switched
 * to status === "ready".
 */

window.BibleDownloadManager = (() => {
  const REFRESH_AFTER_DAYS = 29;
  const STALE_DOWNLOAD_MS = 2 * 60 * 1000;

  let activeDownload = null;

  const OWNER_STORAGE_KEY =
    "BibleOfflineDownloadOwnerId";

  function getOwnerId() {
    let ownerId =
      sessionStorage.getItem(
        OWNER_STORAGE_KEY
      );

    if (!ownerId) {
      ownerId =
        window.crypto?.randomUUID?.() ||
        `tab-${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}`;

      sessionStorage.setItem(
        OWNER_STORAGE_KEY,
        ownerId
      );
    }

    return ownerId;
  }

  const ownerId = getOwnerId();

  class DownloadCancelledError extends Error {
    constructor() {
      super("Bible download cancelled.");
      this.name = "DownloadCancelledError";
      this.code = "DOWNLOAD_CANCELLED";
    }
  }

  function requireDependencies() {
    if (!window.BibleOfflineDB) {
      throw new Error("BibleOfflineDB is unavailable.");
    }

    if (!window.BibleData?.requestJson) {
      throw new Error("BibleData is unavailable.");
    }
  }

  function dispatch(name, detail = {}) {
    window.dispatchEvent(
      new CustomEvent(name, {
        detail
      })
    );
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function addDaysIso(date, days) {
    return new Date(
      date.getTime() + days * 24 * 60 * 60 * 1000
    ).toISOString();
  }

  function getBibleAbbreviation(details) {
    return (
      details?.abbreviation ||
      details?.abbreviationLocal ||
      details?.name ||
      details?.nameLocal ||
      details?.id ||
      ""
    );
  }

  function getBibleName(details) {
    return (
      details?.name ||
      details?.nameLocal ||
      details?.abbreviation ||
      details?.abbreviationLocal ||
      details?.id ||
      ""
    );
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

  function isIntroChapter(chapter) {
    const chapterId = String(chapter?.id || "")
      .trim()
      .toLowerCase();

    const chapterNumber = String(chapter?.number || "")
      .trim()
      .toLowerCase();

    return (
      chapterId === "intro" ||
      chapterNumber === "intro" ||
      chapterId.endsWith(".intro")
    );
  }

  function throwIfCancelled(context) {
    if (
      !context ||
      context.cancelRequested ||
      context.controller.signal.aborted
    ) {
      throw new DownloadCancelledError();
    }
  }

  function sidToVerseId(sid) {
    const match = String(sid || "")
      .trim()
      .match(/^([0-9A-Z]+)\s+([^:]+):(.+)$/i);

    if (!match) {
      return "";
    }

    return `${match[1]}.${match[2]}.${match[3]}`
      .replace(/\s+/g, "");
  }

  function getMarkerVerseNumber(marker, chapter) {
    const explicit = (
      marker?.getAttribute("data-number") ||
      marker?.textContent ||
      ""
    )
      .trim()
      .replace(/[^\dA-Za-z-]/g, "");

    if (explicit) {
      return explicit;
    }

    const sid = marker?.getAttribute("data-sid") || "";
    const sidMatch = sid.match(/:(.+)$/);

    if (sidMatch?.[1]) {
      return sidMatch[1].trim();
    }

    const id =
      marker?.getAttribute("data-verse-id") ||
      marker?.id ||
      "";

    const idParts = id.split(".");

    if (idParts.length >= 3) {
      return idParts.slice(2).join("-");
    }

    return "";
  }

  function getMarkerVerseId(marker, chapter) {
    const dataVerseId =
      marker?.getAttribute("data-verse-id") || "";

    if (dataVerseId) {
      return dataVerseId;
    }

    const markerId = marker?.id || "";

    if (/^[0-9A-Z]+\.[^.]+\..+$/i.test(markerId)) {
      return markerId;
    }

    const sidId = sidToVerseId(
      marker?.getAttribute("data-sid") || ""
    );

    if (sidId) {
      return sidId;
    }

    const verseNumber =
      getMarkerVerseNumber(marker, chapter);

    if (
      chapter?.bookId &&
      chapter?.number &&
      verseNumber
    ) {
      return `${chapter.bookId}.${chapter.number}.${verseNumber}`;
    }

    return "";
  }

  function cleanVerseFragment(fragment) {
    const wrapper = document.createElement("div");
    wrapper.appendChild(fragment);

    wrapper
      .querySelectorAll(
        [
          ".v",
          ".f",
          ".x",
          ".c",
          ".s",
          ".s1",
          ".s2",
          ".s3",
          ".s4",
          ".ms",
          ".ms1",
          ".ms2",
          ".ms3",
          ".mr",
          ".r",
          ".d"
        ].join(",")
      )
      .forEach((element) => element.remove());

    return wrapper.textContent
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractVerseRecords(
    bibleId,
    chapter,
    chapterHtml
  ) {
    const root = document.createElement("div");
    root.innerHTML = chapterHtml || "";

    const markers = Array.from(
      root.querySelectorAll(".v")
    );

    return markers
      .map((marker, index) => {
        const verseId =
          getMarkerVerseId(marker, chapter);

        if (!verseId) {
          return null;
        }

        const range = document.createRange();
        range.selectNodeContents(root);
        range.setStartAfter(marker);

        const nextMarker = markers[index + 1];

        if (nextMarker) {
          range.setEndBefore(nextMarker);
        }

        const text = cleanVerseFragment(
          range.cloneContents()
        );

        const verseNumber =
          getMarkerVerseNumber(marker, chapter);

        const chapterReference =
          String(chapter?.reference || "").trim();

        const reference =
          chapterReference && verseNumber
            ? `${chapterReference}:${verseNumber}`
            : verseId;

        return {
          id: verseId,
          orgId:
            sidToVerseId(
              marker.getAttribute("data-sid") || ""
            ) || verseId,
          bookId: chapter.bookId || "",
          chapterId: chapter.id,
          number: verseNumber,
          reference,
          text,
          searchText: text.toLocaleLowerCase()
        };
      })
      .filter(Boolean);
  }

  async function requestApi(path, signal) {
    throwIfCancelled(activeDownload);

    return window.BibleData.requestJson(
      `${window.BibleData.API_BASE_URL}${path}`,
      { signal }
    );
  }

  async function cleanupInterruptedDownloads() {
    requireDependencies();

    const jobs =
      await window.BibleOfflineDB.getDownloadJobs(
        "downloading"
      );

    const cleaned = [];
    const activeElsewhere = [];

    for (const job of jobs) {
      if (
        activeDownload &&
        activeDownload.bibleId === job.bibleId
      ) {
        continue;
      }

      if (
        job.ownerId &&
        job.ownerId === ownerId
      ) {
        await window.BibleOfflineDB.deleteBibleData(
          job.bibleId
        );

        cleaned.push(job.bibleId);
        continue;
      }

      const updatedAt =
        Date.parse(job.updatedAt || job.startedAt || "");

      const age = Number.isFinite(updatedAt)
        ? Date.now() - updatedAt
        : Number.POSITIVE_INFINITY;

      if (age <= STALE_DOWNLOAD_MS) {
        activeElsewhere.push(job);
        continue;
      }

      await window.BibleOfflineDB.deleteBibleData(
        job.bibleId
      );

      cleaned.push(job.bibleId);
    }

    return {
      cleaned,
      activeElsewhere
    };
  }

  async function ensureNoOtherActiveDownload() {
    const recovery =
      await cleanupInterruptedDownloads();

    if (recovery.activeElsewhere.length) {
      const job = recovery.activeElsewhere[0];
      const error = new Error(
        `${
          job.abbreviation ||
          job.bibleName ||
          "A Bible"
        } is already downloading in another tab.`
      );
      error.code = "DOWNLOAD_ACTIVE_OTHER_TAB";
      throw error;
    }
  }

  async function buildManifest(
    bibleId,
    context
  ) {
    const signal = context.controller.signal;

    dispatch("bible-download-progress", {
      bibleId,
      phase: "preparing",
      message: "Preparing Bible download..."
    });

    const detailsResult = await requestApi(
      `/bibles/${encodeURIComponent(bibleId)}`,
      signal
    );

    throwIfCancelled(context);

    const details = detailsResult?.data || {};

    if (!details.id) {
      details.id = bibleId;
    }

    const booksResult = await requestApi(
      `/bibles/${encodeURIComponent(
        bibleId
      )}/books`,
      signal
    );

    throwIfCancelled(context);

    const books = Array.isArray(booksResult?.data)
      ? booksResult.data
      : [];

    if (!books.length) {
      throw new Error(
        "This Bible did not return a book list."
      );
    }

    const chapters = [];

    for (
      let bookIndex = 0;
      bookIndex < books.length;
      bookIndex += 1
    ) {
      throwIfCancelled(context);

      const book = books[bookIndex];

      dispatch("bible-download-progress", {
        bibleId,
        phase: "preparing",
        message: `Preparing ${getBookName(book)}...`,
        bookIndex: bookIndex + 1,
        totalBooks: books.length
      });

      const chapterResult = await requestApi(
        `/bibles/${encodeURIComponent(
          bibleId
        )}/books/${encodeURIComponent(
          book.id
        )}/chapters`,
        signal
      );

      const bookChapters = Array.isArray(
        chapterResult?.data
      )
        ? chapterResult.data.filter(
            (chapter) => !isIntroChapter(chapter)
          )
        : [];

      bookChapters.forEach(
        (chapter, chapterIndex) => {
          chapters.push({
            ...chapter,
            bookId: chapter.bookId || book.id,
            bookName: getBookName(book),
            order: chapterIndex
          });
        }
      );
    }

    if (!chapters.length) {
      throw new Error(
        "This Bible did not return any readable chapters."
      );
    }

    return {
      details,
      books,
      chapters
    };
  }

  async function persistManifest(
    bibleId,
    manifest,
    context
  ) {
    const startedAt = nowIso();
    const abbreviation =
      getBibleAbbreviation(manifest.details);
    const bibleName =
      getBibleName(manifest.details);

    await window.BibleOfflineDB.putBible({
      id: bibleId,
      status: "downloading",
      abbreviation,
      name: bibleName,
      details: manifest.details,
      copyright:
        manifest.details?.copyright || "",
      totalBooks: manifest.books.length,
      totalChapters: manifest.chapters.length,
      downloadedChapters: 0,
      downloadedVerses: 0,
      startedAt,
      updatedAt: startedAt
    });

    await window.BibleOfflineDB.putBooks(
      bibleId,
      manifest.books.map((book, index) => ({
        ...book,
        order: index
      }))
    );

    await window.BibleOfflineDB.putChapters(
      bibleId,
      manifest.chapters
    );

    const job = {
      bibleId,
      ownerId,
      status: "downloading",
      phase: "downloading",
      abbreviation,
      bibleName,
      totalBooks: manifest.books.length,
      totalChapters: manifest.chapters.length,
      completedChapters: 0,
      downloadedVerses: 0,
      startedAt,
      updatedAt: startedAt
    };

    await window.BibleOfflineDB.putDownloadJob(job);

    context.abbreviation = abbreviation;
    context.bibleName = bibleName;
    context.job = job;
  }

  async function downloadChapters(
    bibleId,
    manifest,
    context
  ) {
    let downloadedVerses = 0;

    for (
      let index = 0;
      index < manifest.chapters.length;
      index += 1
    ) {
      throwIfCancelled(context);

      const chapterMeta = manifest.chapters[index];

      const query = new URLSearchParams({
        "content-type": "html",
        "include-notes": "true",
        "include-titles": "true",
        "include-chapter-numbers": "false",
        "include-verse-numbers": "true",
        "include-verse-spans": "false"
      });

      const result = await requestApi(
        `/bibles/${encodeURIComponent(
          bibleId
        )}/chapters/${encodeURIComponent(
          chapterMeta.id
        )}?${query.toString()}`,
        context.controller.signal
      );

      throwIfCancelled(context);

      const chapterData = result?.data || {};
      const content = String(
        chapterData.content || ""
      );

      if (!content.trim()) {
        throw new Error(
          `No chapter text was returned for ${
            chapterMeta.reference ||
            chapterMeta.id
          }.`
        );
      }

      const storedChapter = {
        ...chapterMeta,
        ...chapterData,
        id: chapterMeta.id,
        bookId:
          chapterData.bookId ||
          chapterMeta.bookId,
        bookName: chapterMeta.bookName,
        order: chapterMeta.order,
        content,
        meta: result?.meta || {}
      };

      const verseRecords =
        extractVerseRecords(
          bibleId,
          storedChapter,
          content
        );

      const expectedVerseCount =
        Number(chapterData.verseCount);

      if (
        Number.isFinite(expectedVerseCount) &&
        expectedVerseCount > 0 &&
        verseRecords.length !== expectedVerseCount
      ) {
        const error = new Error(
          `Verse indexing did not match ${
            storedChapter.reference ||
            storedChapter.id
          }. Expected ${expectedVerseCount} verses and found ${verseRecords.length}.`
        );
        error.code = "VERSE_INDEX_INCOMPLETE";
        throw error;
      }

      if (!verseRecords.length) {
        const error = new Error(
          `No verse markers were found for ${
            storedChapter.reference ||
            storedChapter.id
          }.`
        );
        error.code = "VERSE_INDEX_EMPTY";
        throw error;
      }

      await window.BibleOfflineDB.putChapters(
        bibleId,
        [storedChapter]
      );

      await window.BibleOfflineDB.putVerses(
        bibleId,
        verseRecords
      );

      downloadedVerses += verseRecords.length;

      const completedChapters = index + 1;
      const percent = Math.floor(
        (completedChapters /
          manifest.chapters.length) *
          100
      );

      context.job = {
        ...context.job,
        phase: "downloading",
        currentBookName:
          storedChapter.bookName || "",
        currentChapterReference:
          storedChapter.reference ||
          storedChapter.id,
        completedChapters,
        downloadedVerses,
        percent,
        updatedAt: nowIso()
      };

      await window.BibleOfflineDB.putDownloadJob(
        context.job
      );

      await window.BibleOfflineDB.putBible({
        id: bibleId,
        status: "downloading",
        abbreviation: context.abbreviation,
        name: context.bibleName,
        details: manifest.details,
        copyright:
          manifest.details?.copyright || "",
        totalBooks: manifest.books.length,
        totalChapters:
          manifest.chapters.length,
        downloadedChapters:
          completedChapters,
        downloadedVerses,
        startedAt: context.job.startedAt,
        updatedAt: context.job.updatedAt
      });

      dispatch("bible-download-progress", {
        ...context.job
      });
    }

    return {
      downloadedVerses
    };
  }

  async function verifyAndFinalize(
    bibleId,
    manifest,
    totals,
    context
  ) {
    context.job = {
      ...context.job,
      phase: "verifying",
      percent: 100,
      updatedAt: nowIso()
    };

    await window.BibleOfflineDB.putDownloadJob(
      context.job
    );

    dispatch("bible-download-progress", {
      ...context.job,
      message: "Verifying downloaded Bible..."
    });

    const counts =
      await window.BibleOfflineDB.getBibleRecordCounts(
        bibleId
      );

    if (counts.books !== manifest.books.length) {
      throw new Error(
        "Bible verification failed: book count does not match."
      );
    }

    if (
      counts.chapters !== manifest.chapters.length
    ) {
      throw new Error(
        "Bible verification failed: chapter count does not match."
      );
    }

    if (
      counts.verses !== totals.downloadedVerses
    ) {
      throw new Error(
        "Bible verification failed: verse count does not match."
      );
    }

    const completedAt = new Date();
    const completedAtIso =
      completedAt.toISOString();
    const refreshDueAt =
      addDaysIso(
        completedAt,
        REFRESH_AFTER_DAYS
      );

    await window.BibleOfflineDB.putBible({
      id: bibleId,
      status: "ready",
      abbreviation: context.abbreviation,
      name: context.bibleName,
      details: manifest.details,
      copyright:
        manifest.details?.copyright || "",
      totalBooks: counts.books,
      totalChapters: counts.chapters,
      totalVerses: counts.verses,
      downloadedChapters: counts.chapters,
      downloadedVerses: counts.verses,
      downloadedAt: completedAtIso,
      refreshDueAt,
      startedAt: context.job.startedAt,
      updatedAt: completedAtIso
    });

    await window.BibleOfflineDB.putDownloadJob({
      ...context.job,
      status: "ready",
      phase: "complete",
      percent: 100,
      completedChapters: counts.chapters,
      downloadedVerses: counts.verses,
      completedAt: completedAtIso,
      updatedAt: completedAtIso
    });

    dispatch("bible-download-complete", {
      bibleId,
      abbreviation: context.abbreviation,
      bibleName: context.bibleName,
      counts,
      downloadedAt: completedAtIso,
      refreshDueAt
    });

    return {
      bibleId,
      counts,
      downloadedAt: completedAtIso,
      refreshDueAt
    };
  }

  async function startDownload(bibleId) {
    requireDependencies();

    if (!bibleId) {
      throw new Error(
        "Choose a Bible to download."
      );
    }

    if (activeDownload) {
      const error = new Error(
        `${activeDownload.abbreviation || "A Bible"} is already downloading.`
      );
      error.code = "DOWNLOAD_ACTIVE";
      throw error;
    }

    const readyBible =
      await window.BibleOfflineDB.getReadyBible(
        bibleId
      );

    if (readyBible) {
      const error = new Error(
        `${
          readyBible.abbreviation ||
          readyBible.name ||
          "This Bible"
        } is already downloaded on this device.`
      );
      error.code = "BIBLE_ALREADY_READY";
      throw error;
    }

    await ensureNoOtherActiveDownload();

    const existing =
      await window.BibleOfflineDB.getBible(
        bibleId
      );

    if (existing && existing.status !== "ready") {
      await window.BibleOfflineDB.deleteBibleData(
        bibleId
      );
    }

    const context = {
      bibleId,
      ownerId,
      controller: new AbortController(),
      cancelRequested: false,
      abbreviation: "",
      bibleName: "",
      job: null
    };

    activeDownload = context;

    dispatch("bible-download-start", {
      bibleId
    });

    try {
      const manifest =
        await buildManifest(
          bibleId,
          context
        );

      throwIfCancelled(context);

      await persistManifest(
        bibleId,
        manifest,
        context
      );

      const totals =
        await downloadChapters(
          bibleId,
          manifest,
          context
        );

      throwIfCancelled(context);

      return await verifyAndFinalize(
        bibleId,
        manifest,
        totals,
        context
      );
    } catch (error) {
      const cancelled =
        context.cancelRequested ||
        error?.name === "AbortError" ||
        error?.code === "DOWNLOAD_CANCELLED";

      try {
        await window.BibleOfflineDB.deleteBibleData(
          bibleId
        );
      } catch (cleanupError) {
        console.error(
          "Could not fully roll back the incomplete Bible download:",
          cleanupError
        );
      }

      if (cancelled) {
        dispatch("bible-download-cancelled", {
          bibleId,
          abbreviation:
            context.abbreviation || "",
          bibleName:
            context.bibleName || ""
        });

        return {
          bibleId,
          cancelled: true
        };
      }

      dispatch("bible-download-error", {
        bibleId,
        abbreviation:
          context.abbreviation || "",
        bibleName:
          context.bibleName || "",
        error
      });

      throw error;
    } finally {
      activeDownload = null;
    }
  }

  function cancelActiveDownload() {
    if (!activeDownload) {
      return false;
    }

    activeDownload.cancelRequested = true;
    activeDownload.controller.abort();

    dispatch("bible-download-cancelling", {
      bibleId: activeDownload.bibleId,
      abbreviation:
        activeDownload.abbreviation || "",
      bibleName:
        activeDownload.bibleName || ""
    });

    return true;
  }

  function getActiveDownload() {
    if (!activeDownload) {
      return null;
    }

    return {
      bibleId: activeDownload.bibleId,
      abbreviation:
        activeDownload.abbreviation || "",
      bibleName:
        activeDownload.bibleName || ""
    };
  }

  async function removeBible(bibleId) {
    requireDependencies();

    if (!bibleId) return;

    if (
      activeDownload &&
      activeDownload.bibleId === bibleId
    ) {
      throw new Error(
        "Cancel the current download before removing this Bible."
      );
    }

    await window.BibleOfflineDB.deleteBibleData(
      bibleId
    );

    dispatch("bible-download-removed", {
      bibleId
    });
  }

  return Object.freeze({
    startDownload,
    cancelActiveDownload,
    getActiveDownload,
    removeBible,
    cleanupInterruptedDownloads
  });
})();
