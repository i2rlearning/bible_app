"use strict";

/*
 * BibleOfflineDB
 *
 * IndexedDB storage foundation for downloaded Bible data.
 *
 * This module intentionally contains no page-specific UI code.
 * It is safe to load anywhere in the application.
 *
 * A Bible is considered usable offline only when its bible record has
 * status === "ready". Partial/in-progress records must never be treated as
 * an offline Bible.
 */

window.BibleOfflineDB = (() => {
  const DB_NAME = "BibleOfflineDB";
  const DB_VERSION = 1;

  const STORES = Object.freeze({
    bibles: "bibles",
    books: "books",
    chapters: "chapters",
    verses: "verses",
    downloadJobs: "downloadJobs"
  });

  let databasePromise = null;

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
    });
  }

  function transactionToPromise(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(transaction.error || new Error("IndexedDB transaction was aborted."));
      transaction.onerror = () => {
        // The abort handler provides the final transaction error.
      };
    });
  }

  function ensureIndex(store, indexName, keyPath, options = {}) {
    if (!store.indexNames.contains(indexName)) {
      store.createIndex(indexName, keyPath, options);
    }
  }

  function upgradeDatabase(database) {
    let biblesStore;
    if (!database.objectStoreNames.contains(STORES.bibles)) {
      biblesStore = database.createObjectStore(STORES.bibles, {
        keyPath: "id"
      });
    } else {
      biblesStore = null;
    }

    if (biblesStore) {
      ensureIndex(biblesStore, "byStatus", "status", { unique: false });
      ensureIndex(biblesStore, "byUpdatedAt", "updatedAt", { unique: false });
    }

    let booksStore;
    if (!database.objectStoreNames.contains(STORES.books)) {
      booksStore = database.createObjectStore(STORES.books, {
        keyPath: ["bibleId", "id"]
      });
      ensureIndex(booksStore, "byBibleId", "bibleId", { unique: false });
      ensureIndex(booksStore, "byBibleAndOrder", ["bibleId", "order"], {
        unique: false
      });
    }

    let chaptersStore;
    if (!database.objectStoreNames.contains(STORES.chapters)) {
      chaptersStore = database.createObjectStore(STORES.chapters, {
        keyPath: ["bibleId", "id"]
      });
      ensureIndex(chaptersStore, "byBibleId", "bibleId", { unique: false });
      ensureIndex(chaptersStore, "byBibleAndBook", ["bibleId", "bookId"], {
        unique: false
      });
      ensureIndex(
        chaptersStore,
        "byBibleBookAndOrder",
        ["bibleId", "bookId", "order"],
        { unique: false }
      );
    }

    let versesStore;
    if (!database.objectStoreNames.contains(STORES.verses)) {
      versesStore = database.createObjectStore(STORES.verses, {
        keyPath: ["bibleId", "id"]
      });
      ensureIndex(versesStore, "byBibleId", "bibleId", { unique: false });
      ensureIndex(versesStore, "byBibleAndChapter", ["bibleId", "chapterId"], {
        unique: false
      });
    }

    let jobsStore;
    if (!database.objectStoreNames.contains(STORES.downloadJobs)) {
      jobsStore = database.createObjectStore(STORES.downloadJobs, {
        keyPath: "bibleId"
      });
      ensureIndex(jobsStore, "byStatus", "status", { unique: false });
      ensureIndex(jobsStore, "byUpdatedAt", "updatedAt", { unique: false });
    }
  }

  function open() {
    if (!("indexedDB" in window)) {
      return Promise.reject(
        new Error("IndexedDB is not available in this browser.")
      );
    }

    if (databasePromise) {
      return databasePromise;
    }

    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        upgradeDatabase(request.result);
      };

      request.onsuccess = () => {
        const database = request.result;

        database.onversionchange = () => {
          database.close();
          databasePromise = null;
        };

        resolve(database);
      };

      request.onerror = () => {
        databasePromise = null;
        reject(
          request.error ||
            new Error("Could not open the offline Bible database.")
        );
      };

      request.onblocked = () => {
        console.warn(
          "BibleOfflineDB upgrade is blocked by another open application tab."
        );
      };
    });

    return databasePromise;
  }

  async function getRecord(storeName, key) {
    const database = await open();
    const transaction = database.transaction(storeName, "readonly");
    return requestToPromise(transaction.objectStore(storeName).get(key));
  }

  async function putRecord(storeName, record) {
    const database = await open();
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(record);
    await transactionToPromise(transaction);
    return record;
  }

  async function putRecords(storeName, records) {
    const safeRecords = Array.isArray(records) ? records : [];

    if (!safeRecords.length) {
      return [];
    }

    const database = await open();
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);

    safeRecords.forEach((record) => store.put(record));
    await transactionToPromise(transaction);

    return safeRecords;
  }

  async function getAllFromIndex(storeName, indexName, query) {
    const database = await open();
    const transaction = database.transaction(storeName, "readonly");
    const index = transaction.objectStore(storeName).index(indexName);
    return requestToPromise(index.getAll(query));
  }

  async function getAllRecords(storeName) {
    const database = await open();
    const transaction = database.transaction(storeName, "readonly");
    return requestToPromise(transaction.objectStore(storeName).getAll());
  }

  async function countFromIndex(storeName, indexName, query) {
    const database = await open();
    const transaction = database.transaction(storeName, "readonly");
    const index = transaction.objectStore(storeName).index(indexName);
    return requestToPromise(index.count(query));
  }

  function isReadyAndFreshBible(record) {
    if (!record || record.status !== "ready") {
      return false;
    }

    if (!record.refreshDueAt) {
      return true;
    }

    const refreshDueAt = Date.parse(record.refreshDueAt);

    return !Number.isFinite(refreshDueAt) || refreshDueAt > Date.now();
  }

  function sortByOrder(items) {
    return [...items].sort((a, b) => {
      const orderA = Number.isFinite(Number(a?.order))
        ? Number(a.order)
        : Number.MAX_SAFE_INTEGER;
      const orderB = Number.isFinite(Number(b?.order))
        ? Number(b.order)
        : Number.MAX_SAFE_INTEGER;

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      return String(a?.id || "").localeCompare(String(b?.id || ""));
    });
  }

  async function getBible(bibleId) {
    if (!bibleId) return null;
    return (await getRecord(STORES.bibles, bibleId)) || null;
  }

  async function getReadyBible(bibleId) {
    const bible = await getBible(bibleId);
    return isReadyAndFreshBible(bible) ? bible : null;
  }

  async function isBibleReady(bibleId) {
    return Boolean(await getReadyBible(bibleId));
  }

  async function getReadyBibles() {
    const records = await getAllFromIndex(
      STORES.bibles,
      "byStatus",
      IDBKeyRange.only("ready")
    );

    return records
      .filter(isReadyAndFreshBible)
      .sort((a, b) =>
        String(a?.abbreviation || a?.name || a?.id || "").localeCompare(
          String(b?.abbreviation || b?.name || b?.id || "")
        )
      );
  }

  async function getBooks(bibleId) {
    if (!bibleId) return [];

    const records = await getAllFromIndex(
      STORES.books,
      "byBibleId",
      IDBKeyRange.only(bibleId)
    );

    return sortByOrder(records);
  }

  async function getChapters(bibleId, bookId) {
    if (!bibleId || !bookId) return [];

    const records = await getAllFromIndex(
      STORES.chapters,
      "byBibleAndBook",
      IDBKeyRange.only([bibleId, bookId])
    );

    return sortByOrder(records);
  }

  async function getChapter(bibleId, chapterId) {
    if (!bibleId || !chapterId) return null;

    return (
      (await getRecord(STORES.chapters, [bibleId, chapterId])) ||
      null
    );
  }

  async function getVersesForChapter(bibleId, chapterId) {
    if (!bibleId || !chapterId) return [];

    return getAllFromIndex(
      STORES.verses,
      "byBibleAndChapter",
      IDBKeyRange.only([bibleId, chapterId])
    );
  }

  async function getDownloadJob(bibleId) {
    if (!bibleId) return null;
    return (await getRecord(STORES.downloadJobs, bibleId)) || null;
  }

  async function getDownloadJobs(status = "") {
    if (status) {
      return getAllFromIndex(
        STORES.downloadJobs,
        "byStatus",
        IDBKeyRange.only(status)
      );
    }

    return getAllRecords(STORES.downloadJobs);
  }

  async function getBibleRecordCounts(bibleId) {
    if (!bibleId) {
      return { books: 0, chapters: 0, verses: 0 };
    }

    const query = IDBKeyRange.only(bibleId);

    const [books, chapters, verses] = await Promise.all([
      countFromIndex(STORES.books, "byBibleId", query),
      countFromIndex(STORES.chapters, "byBibleId", query),
      countFromIndex(STORES.verses, "byBibleId", query)
    ]);

    return { books, chapters, verses };
  }

  async function putBible(record) {
    if (!record?.id) {
      throw new Error("Bible record requires an id.");
    }

    return putRecord(STORES.bibles, {
      ...record,
      updatedAt: record.updatedAt || new Date().toISOString()
    });
  }

  async function putBooks(bibleId, books) {
    if (!bibleId) {
      throw new Error("Bible id is required when storing books.");
    }

    const records = (Array.isArray(books) ? books : []).map((book, index) => ({
      ...book,
      bibleId,
      order: Number.isFinite(Number(book?.order)) ? Number(book.order) : index
    }));

    return putRecords(STORES.books, records);
  }

  async function putChapters(bibleId, chapters) {
    if (!bibleId) {
      throw new Error("Bible id is required when storing chapters.");
    }

    const records = (Array.isArray(chapters) ? chapters : []).map(
      (chapter, index) => ({
        ...chapter,
        bibleId,
        order: Number.isFinite(Number(chapter?.order))
          ? Number(chapter.order)
          : index
      })
    );

    return putRecords(STORES.chapters, records);
  }

  async function putVerses(bibleId, verses) {
    if (!bibleId) {
      throw new Error("Bible id is required when storing verses.");
    }

    const records = (Array.isArray(verses) ? verses : []).map((verse) => ({
      ...verse,
      bibleId
    }));

    return putRecords(STORES.verses, records);
  }

  async function putDownloadJob(record) {
    if (!record?.bibleId) {
      throw new Error("Download job requires a bibleId.");
    }

    return putRecord(STORES.downloadJobs, {
      ...record,
      updatedAt: record.updatedAt || new Date().toISOString()
    });
  }

  async function deleteDownloadJob(bibleId) {
    if (!bibleId) return;

    const database = await open();
    const transaction = database.transaction(STORES.downloadJobs, "readwrite");
    transaction.objectStore(STORES.downloadJobs).delete(bibleId);
    await transactionToPromise(transaction);
  }

  async function deleteRecordsForBible(storeName, indexName, bibleId) {
    const database = await open();
    const transaction = database.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.openKeyCursor(IDBKeyRange.only(bibleId));

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;

      store.delete(cursor.primaryKey);
      cursor.continue();
    };

    await transactionToPromise(transaction);
  }

  async function deleteBibleData(bibleId) {
    if (!bibleId) return;

    await deleteRecordsForBible(STORES.verses, "byBibleId", bibleId);
    await deleteRecordsForBible(STORES.chapters, "byBibleId", bibleId);
    await deleteRecordsForBible(STORES.books, "byBibleId", bibleId);

    const database = await open();
    const transaction = database.transaction(
      [STORES.bibles, STORES.downloadJobs],
      "readwrite"
    );

    transaction.objectStore(STORES.bibles).delete(bibleId);
    transaction.objectStore(STORES.downloadJobs).delete(bibleId);

    await transactionToPromise(transaction);
  }

  async function clearAll() {
    const database = await open();
    const storeNames = Object.values(STORES);
    const transaction = database.transaction(storeNames, "readwrite");

    storeNames.forEach((storeName) => {
      transaction.objectStore(storeName).clear();
    });

    await transactionToPromise(transaction);
  }

  return Object.freeze({
    DB_NAME,
    DB_VERSION,
    STORES,
    open,
    getBible,
    getReadyBible,
    getReadyBibles,
    isBibleReady,
    getBooks,
    getChapters,
    getChapter,
    getVersesForChapter,
    getDownloadJob,
    getDownloadJobs,
    getBibleRecordCounts,
    putBible,
    putBooks,
    putChapters,
    putVerses,
    putDownloadJob,
    deleteDownloadJob,
    deleteBibleData,
    clearAll
  });
})();
