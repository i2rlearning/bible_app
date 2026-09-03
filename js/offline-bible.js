// /js/offline-bible.js - Complete IndexedDB storage for Bible text

const DB_NAME = 'BibleAppOfflineDB';
const DB_VERSION = 1;
const STORE_NAME = 'bibleVersions';
const BOOKS_STORE = 'bibleBooks';
const CHAPTERS_STORE = 'bibleChapters';

let dbPromise;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create stores if they don't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'bibleId' });
        }
        if (!db.objectStoreNames.contains(BOOKS_STORE)) {
          const booksStore = db.createObjectStore(BOOKS_STORE, { keyPath: 'id' });
          booksStore.createIndex('bibleId', 'bibleId', { unique: false });
        }
        if (!db.objectStoreNames.contains(CHAPTERS_STORE)) {
          const chaptersStore = db.createObjectStore(CHAPTERS_STORE, { keyPath: 'id' });
          chaptersStore.createIndex('bookId', 'bookId', { unique: false });
          chaptersStore.createIndex('bibleId', 'bibleId', { unique: false });
        }
      };
    });
  }
  return dbPromise;
}

// ========== Bible Version Management ==========

async function storeBibleVersion(bibleId, versionData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.put({
      bibleId: bibleId,
      data: versionData,
      timestamp: Date.now()
    });
    
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

async function getBibleVersion(bibleId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.get(bibleId);
    
    request.onsuccess = () => {
      resolve(request.result ? request.result.data : null);
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteBibleVersion(bibleId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.delete(bibleId);
    
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

async function listDownloadedVersions() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    
    request.onsuccess = () => {
      resolve(request.result.map(item => ({
        bibleId: item.bibleId,
        timestamp: item.timestamp
      })));
    };
    request.onerror = () => reject(request.error);
  });
}

async function isVersionDownloaded(bibleId) {
  const versions = await listDownloadedVersions();
  return versions.some(v => v.bibleId === bibleId);
}

// ========== Book & Chapter Storage ==========

async function storeBook(bookData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BOOKS_STORE, 'readwrite');
    const store = transaction.objectStore(BOOKS_STORE);
    
    const request = store.put(bookData);
    
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

async function storeChapter(chapterData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CHAPTERS_STORE, 'readwrite');
    const store = transaction.objectStore(CHAPTERS_STORE);
    
    const request = store.put(chapterData);
    
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

async function getChapter(bibleId, bookId, chapterId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CHAPTERS_STORE, 'readonly');
    const store = transaction.objectStore(CHAPTERS_STORE);
    const index = store.index('bookId');
    
    const request = index.getAll(IDBKeyRange.only(`${bibleId}::${bookId}::${chapterId}`));
    
    request.onsuccess = () => {
      resolve(request.result[0] || null);
    };
    request.onerror = () => reject(request.error);
  });
}

async function getBookChapters(bibleId, bookId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CHAPTERS_STORE, 'readonly');
    const store = transaction.objectStore(CHAPTERS_STORE);
    const index = store.index('bookId');
    
    const bookKey = `${bibleId}::${bookId}`;
    const request = index.getAll(IDBKeyRange.bound(bookKey, `${bookKey}::\uFFFF`));
    
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

// ========== Initialize ==========

// Initialize database on load
if (typeof window !== 'undefined') {
  openDB().catch(console.error);
}

// Export for use in other modules
window.OfflineBible = {
  storeBibleVersion,
  getBibleVersion,
  deleteBibleVersion,
  listDownloadedVersions,
  isVersionDownloaded,
  storeBook,
  storeChapter,
  getChapter,
  getBookChapters
};
