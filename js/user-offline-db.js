"use strict";

/*
 * UserOfflineDB
 *
 * Stores user-specific offline data in IndexedDB, separated by Clerk user ID.
 * Provides durable local storage for My Notes and the sync outbox so edits
 * can survive navigation, browser refreshes, and temporary loss of connectivity.
 */

window.UserOfflineDB = (() => {
  const DB_NAME = "UserOfflineDB";
  const DB_VERSION = 1;

  const STORES = Object.freeze({
    meta: "meta",
    profiles: "profiles",
    quillNotes: "quillNotes",
    outbox: "outbox"
  });

  let dbPromise = null;

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function transactionToPromise(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    });
  }

  function open() {
    if (dbPromise) {
      return dbPromise;
    }

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORES.meta)) {
          db.createObjectStore(STORES.meta, { keyPath: "key" });
        }

        if (!db.objectStoreNames.contains(STORES.profiles)) {
          const profiles = db.createObjectStore(STORES.profiles, { keyPath: "userId" });
          profiles.createIndex("by_last_verified", "lastVerifiedAt", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.quillNotes)) {
          const notes = db.createObjectStore(STORES.quillNotes, { keyPath: "localKey" });
          notes.createIndex("by_user", "userId", { unique: false });
          notes.createIndex("by_user_page", ["userId", "pageKey"], { unique: true });
          notes.createIndex(
            "by_user_bible_chapter",
            ["userId", "bibleVersionID", "bibleChapterID"],
            { unique: false }
          );
          notes.createIndex("by_user_sync", ["userId", "syncStatus"], { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.outbox)) {
          const outbox = db.createObjectStore(STORES.outbox, { keyPath: "mutationId" });
          outbox.createIndex("by_user_status", ["userId", "status"], { unique: false });
          outbox.createIndex(
            "by_user_entity",
            ["userId", "entityType", "entityKey"],
            { unique: false }
          );
          outbox.createIndex("by_user_created", ["userId", "createdAt"], { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = null;
        reject(request.error);
      };
      request.onblocked = () => {
        console.warn("UserOfflineDB upgrade is blocked by another open tab.");
      };
    });

    return dbPromise;
  }

  async function get(storeName, key) {
    const db = await open();
    const transaction = db.transaction(storeName, "readonly");
    const result = await requestToPromise(transaction.objectStore(storeName).get(key));
    await transactionToPromise(transaction);
    return result || null;
  }

  async function put(storeName, value) {
    const db = await open();
    const transaction = db.transaction(storeName, "readwrite");
    await requestToPromise(transaction.objectStore(storeName).put(value));
    await transactionToPromise(transaction);
    return value;
  }

  async function remove(storeName, key) {
    const db = await open();
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(key);
    await transactionToPromise(transaction);
  }

  async function getMeta(key) {
    return get(STORES.meta, key);
  }

  async function setMeta(key, value) {
    return put(STORES.meta, {
      key,
      value,
      updatedAt: Date.now()
    });
  }

  async function getProfile(userId) {
    if (!userId) return null;
    return get(STORES.profiles, userId);
  }

  async function putProfile(profile) {
    if (!profile?.userId) {
      throw new Error("Cannot store a user profile without userId.");
    }

    return put(STORES.profiles, profile);
  }

  function buildQuillLocalKey(userId, pageKey) {
    return `${userId}::quill_note::${pageKey}`;
  }

  async function getQuillNote(userId, pageKey) {
    if (!userId || !pageKey) return null;

    const db = await open();
    const transaction = db.transaction(STORES.quillNotes, "readonly");
    const index = transaction.objectStore(STORES.quillNotes).index("by_user_page");
    const result = await requestToPromise(index.get([userId, pageKey]));
    await transactionToPromise(transaction);
    return result || null;
  }

  async function getQuillNoteByBibleChapter(userId, bibleVersionID, bibleChapterID) {
    if (!userId || !bibleVersionID || !bibleChapterID) return null;

    const db = await open();
    const transaction = db.transaction(STORES.quillNotes, "readonly");
    const index = transaction.objectStore(STORES.quillNotes).index("by_user_bible_chapter");
    const results = await requestToPromise(
      index.getAll([userId, bibleVersionID, bibleChapterID])
    );
    await transactionToPromise(transaction);

    if (!Array.isArray(results) || results.length === 0) {
      return null;
    }

    results.sort((a, b) => Number(b.localUpdatedAt || 0) - Number(a.localUpdatedAt || 0));
    return results[0] || null;
  }

  async function putQuillNote(note) {
    if (!note?.userId || !note?.pageKey) {
      throw new Error("Cannot store Quill notes without userId and pageKey.");
    }

    const record = {
      ...note,
      localKey: note.localKey || buildQuillLocalKey(note.userId, note.pageKey)
    };

    return put(STORES.quillNotes, record);
  }

  async function deleteQuillNote(userId, pageKey) {
    if (!userId || !pageKey) return;
    return remove(STORES.quillNotes, buildQuillLocalKey(userId, pageKey));
  }

  async function getOutboxMutation(mutationId) {
    if (!mutationId) return null;
    return get(STORES.outbox, mutationId);
  }

  async function putOutboxMutation(mutation) {
    if (!mutation?.mutationId) {
      throw new Error("Cannot store an outbox mutation without mutationId.");
    }
    return put(STORES.outbox, mutation);
  }

  async function deleteOutboxMutation(mutationId) {
    if (!mutationId) return;
    return remove(STORES.outbox, mutationId);
  }

  async function listOutboxForEntity(userId, entityType, entityKey) {
    const db = await open();
    const transaction = db.transaction(STORES.outbox, "readonly");
    const index = transaction.objectStore(STORES.outbox).index("by_user_entity");
    const results = await requestToPromise(index.getAll([userId, entityType, entityKey]));
    await transactionToPromise(transaction);

    return (results || []).sort(
      (a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0)
    );
  }

  async function listOutbox(userId, statuses = ["pending", "sending"]) {
    if (!userId) return [];

    const db = await open();
    const transaction = db.transaction(STORES.outbox, "readonly");
    const store = transaction.objectStore(STORES.outbox);
    const results = await requestToPromise(store.getAll());
    await transactionToPromise(transaction);

    const allowed = new Set(statuses || []);

    return (results || [])
      .filter((item) => item.userId === userId && allowed.has(item.status))
      .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  }

  async function resetSendingMutations(userId) {
    const items = await listOutbox(userId, ["sending"]);

    for (const item of items) {
      await putOutboxMutation({
        ...item,
        status: "pending",
        updatedAt: Date.now()
      });
    }
  }

  return Object.freeze({
    DB_NAME,
    DB_VERSION,
    STORES,
    open,
    getMeta,
    setMeta,
    getProfile,
    putProfile,
    getQuillNote,
    getQuillNoteByBibleChapter,
    putQuillNote,
    deleteQuillNote,
    getOutboxMutation,
    putOutboxMutation,
    deleteOutboxMutation,
    listOutboxForEntity,
    listOutbox,
    resetSendingMutations,
    buildQuillLocalKey
  });
})();
