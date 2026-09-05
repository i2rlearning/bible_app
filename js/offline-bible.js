/**
 * OFFLINE BIBLE DATABASE WRAPPER
 *
 * Stores downloaded Bible metadata in IndexedDB and provides the database
 * operations used by the offline manager. Bible text storage and local search
 * will build on this database in later work.
 */

"use strict";

const DB_NAME = "BibleAppOfflineDB";
const DB_VERSION = 1;
const STORE_NAME = "bibleVersions";
const BOOKS_STORE = "bibleBooks";
const CHAPTERS_STORE = "bibleChapters";

let dbPromise;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "bibleId" });
        }

        if (!db.objectStoreNames.contains(BOOKS_STORE)) {
          const booksStore = db.createObjectStore(BOOKS_STORE, { keyPath: "id" });
          booksStore.createIndex("bibleId", "bibleId", { unique: false });
        }

        if (!db.objectStoreNames.contains(CHAPTERS_STORE)) {
          const chaptersStore = db.createObjectStore(CHAPTERS_STORE, { keyPath: "id" });
          chaptersStore.createIndex("bookId", "bookId", { unique: false });
          chaptersStore.createIndex("bibleId", "bibleId", { unique: false });
        }
      };
    });
  }

  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeBibleVersion(bibleId, versionData) {
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put({
    bibleId,
    data: versionData,
    timestamp: Date.now()
  });
  await transactionComplete(transaction);
  return true;
}

async function getBibleVersion(bibleId) {
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const result = await requestToPromise(transaction.objectStore(STORE_NAME).get(bibleId));
  return result ? result.data : null;
}

async function deleteBibleVersion(bibleId) {
  const db = await openDB();
  const transaction = db.transaction(
    [STORE_NAME, BOOKS_STORE, CHAPTERS_STORE],
    "readwrite"
  );
  const completion = transactionComplete(transaction);

  transaction.objectStore(STORE_NAME).delete(bibleId);

  const booksStore = transaction.objectStore(BOOKS_STORE);
  const chaptersStore = transaction.objectStore(CHAPTERS_STORE);

  const books = await requestToPromise(
    booksStore.index("bibleId").getAll(IDBKeyRange.only(bibleId))
  );

  for (const book of books) {
    booksStore.delete(book.id);
  }

  const chapters = await requestToPromise(
    chaptersStore.index("bibleId").getAll(IDBKeyRange.only(bibleId))
  );

  for (const chapter of chapters) {
    chaptersStore.delete(chapter.id);
  }

  await completion;
  return true;
}

async function listDownloadedVersions() {
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const result = await requestToPromise(transaction.objectStore(STORE_NAME).getAll());

  return result.map((item) => ({
    bibleId: item.bibleId,
    timestamp: item.timestamp
  }));
}

async function isVersionDownloaded(bibleId) {
  const versions = await listDownloadedVersions();
  return versions.some((version) => String(version.bibleId) === String(bibleId));
}

async function clearAllOfflineData() {
  const db = await openDB();
  const transaction = db.transaction(
    [STORE_NAME, BOOKS_STORE, CHAPTERS_STORE],
    "readwrite"
  );

  transaction.objectStore(STORE_NAME).clear();
  transaction.objectStore(BOOKS_STORE).clear();
  transaction.objectStore(CHAPTERS_STORE).clear();

  await transactionComplete(transaction);
  return true;
}

async function storeBook(bookData) {
  const db = await openDB();
  const transaction = db.transaction(BOOKS_STORE, "readwrite");
  transaction.objectStore(BOOKS_STORE).put(bookData);
  await transactionComplete(transaction);
  return true;
}

async function storeChapter(chapterData) {
  const db = await openDB();
  const transaction = db.transaction(CHAPTERS_STORE, "readwrite");
  transaction.objectStore(CHAPTERS_STORE).put(chapterData);
  await transactionComplete(transaction);
  return true;
}

async function getChapter(bibleId, bookId, chapterId) {
  const db = await openDB();
  const transaction = db.transaction(CHAPTERS_STORE, "readonly");
  const store = transaction.objectStore(CHAPTERS_STORE);
  const result = await requestToPromise(
    store.get(`${bibleId}::${bookId}::${chapterId}`)
  );
  return result || null;
}

async function getBookChapters(bibleId, bookId) {
  const db = await openDB();
  const transaction = db.transaction(CHAPTERS_STORE, "readonly");
  const index = transaction.objectStore(CHAPTERS_STORE).index("bookId");
  const bookKey = `${bibleId}::${bookId}`;
  const result = await requestToPromise(
    index.getAll(IDBKeyRange.bound(bookKey, `${bookKey}::\uFFFF`))
  );
  return result;
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted."));
  });
}

if (typeof window !== "undefined") {
  openDB().catch(console.error);
}

window.OfflineBible = {
  storeBibleVersion,
  getBibleVersion,
  deleteBibleVersion,
  listDownloadedVersions,
  isVersionDownloaded,
  clearAllOfflineData,
  storeBook,
  storeChapter,
  getChapter,
  getBookChapters
};
