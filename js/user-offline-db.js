"use strict";

/*
 * Project file: js/user-offline-db.js
 *
 * Purpose:
 * Provides the IndexedDB foundation for Phase 4 user-specific offline data.
 * This database is separate from BibleOfflineDB, which stores downloaded Bible text.
 *
 * What this file does:
 * - Creates and opens the UserOfflineDB IndexedDB database.
 * - Keeps records partitioned by Clerk user ID.
 * - Provides stores for user profiles, Quill/My Notes, Study Desk local drafts,
 *   mini-editor page state, and a durable synchronization outbox.
 * - Provides small helper functions for reading and writing those stores.
 * - Study Desk drafts are local-only in this step. They are not restored or synced yet.
 * - Does not change authentication, navigation, synchronization, or server data by itself.
 */

window.UserOfflineDB = (() => {
  const DB_NAME = "UserOfflineDB";
  const DB_VERSION = 4;

  const STORES = Object.freeze({
    meta: "meta",
    profiles: "profiles",
    quillNotes: "quillNotes",
    studyDrafts: "studyDrafts",
    studies: "studies",
    miniEditorPages: "miniEditorPages",
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
      transaction.onabort = () => reject(
        transaction.error || new Error("IndexedDB transaction aborted")
      );
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

        if (!db.objectStoreNames.contains(STORES.studyDrafts)) {
          const drafts = db.createObjectStore(STORES.studyDrafts, { keyPath: "localKey" });
          drafts.createIndex("by_user", "userId", { unique: false });
          drafts.createIndex("by_user_draft", ["userId", "draftKey"], { unique: true });
          drafts.createIndex("by_user_study", ["userId", "studyId"], { unique: false });
          drafts.createIndex("by_user_updated", ["userId", "localUpdatedAt"], { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.studies)) {
          const studies = db.createObjectStore(STORES.studies, { keyPath: "localKey" });
          studies.createIndex("by_user", "userId", { unique: false });
          studies.createIndex("by_user_study", ["userId", "studyId"], { unique: true });
          studies.createIndex("by_user_updated", ["userId", "localUpdatedAt"], { unique: false });
          studies.createIndex("by_user_sync", ["userId", "syncStatus"], { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.miniEditorPages)) {
          const pages = db.createObjectStore(STORES.miniEditorPages, { keyPath: "localKey" });
          pages.createIndex("by_user", "userId", { unique: false });
          pages.createIndex("by_user_page", ["userId", "pageKey"], { unique: true });
          pages.createIndex(
            "by_user_bible_chapter",
            ["userId", "bibleVersionID", "bibleChapterID"],
            { unique: false }
          );
          pages.createIndex("by_user_sync", ["userId", "syncStatus"], { unique: false });
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

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
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

  function buildStudyDraftLocalKey(userId, draftKey) {
    return `${userId}::study_draft::${draftKey}`;
  }

  async function getStudyDraft(userId, draftKey) {
    if (!userId || !draftKey) return null;

    const db = await open();
    const transaction = db.transaction(STORES.studyDrafts, "readonly");
    const index = transaction.objectStore(STORES.studyDrafts).index("by_user_draft");
    const result = await requestToPromise(index.get([userId, draftKey]));
    await transactionToPromise(transaction);
    return result || null;
  }

  async function putStudyDraft(draft) {
    if (!draft?.userId || !draft?.draftKey) {
      throw new Error("Cannot store a Study Desk draft without userId and draftKey.");
    }

    const record = {
      ...draft,
      localKey: draft.localKey || buildStudyDraftLocalKey(draft.userId, draft.draftKey)
    };

    return put(STORES.studyDrafts, record);
  }

  async function deleteStudyDraft(userId, draftKey) {
    if (!userId || !draftKey) return;
    return remove(STORES.studyDrafts, buildStudyDraftLocalKey(userId, draftKey));
  }

  async function listStudyDrafts(userId) {
    if (!userId) return [];

    const db = await open();
    const transaction = db.transaction(STORES.studyDrafts, "readonly");
    const index = transaction.objectStore(STORES.studyDrafts).index("by_user");
    const results = await requestToPromise(index.getAll(userId));
    await transactionToPromise(transaction);

    return (results || []).sort(
      (a, b) => Number(b.localUpdatedAt || 0) - Number(a.localUpdatedAt || 0)
    );
  }

  function buildStudyLocalKey(userId, studyId) {
    return `${userId}::study::${studyId}`;
  }

  async function getStudy(userId, studyId) {
    if (!userId || !studyId) return null;

    const db = await open();
    const transaction = db.transaction(STORES.studies, "readonly");
    const index = transaction.objectStore(STORES.studies).index("by_user_study");
    const result = await requestToPromise(index.get([userId, studyId]));
    await transactionToPromise(transaction);
    return result || null;
  }

  async function putStudy(study) {
    if (!study?.userId || !study?.studyId) {
      throw new Error("Cannot store a Study without userId and studyId.");
    }

    const record = {
      ...study,
      localKey: study.localKey || buildStudyLocalKey(study.userId, study.studyId)
    };

    return put(STORES.studies, record);
  }

  async function deleteStudy(userId, studyId) {
    if (!userId || !studyId) return;
    return remove(STORES.studies, buildStudyLocalKey(userId, studyId));
  }

  async function listStudies(userId) {
    if (!userId) return [];

    const db = await open();
    const transaction = db.transaction(STORES.studies, "readonly");
    const index = transaction.objectStore(STORES.studies).index("by_user");
    const results = await requestToPromise(index.getAll(userId));
    await transactionToPromise(transaction);

    return (results || []).sort(
      (a, b) => Number(b.localUpdatedAt || 0) - Number(a.localUpdatedAt || 0)
    );
  }

  function buildMiniEditorLocalKey(userId, pageKey) {
    return `${userId}::mini_editor_page::${pageKey}`;
  }

  async function getMiniEditorPage(userId, pageKey) {
    if (!userId || !pageKey) return null;

    const db = await open();
    const transaction = db.transaction(STORES.miniEditorPages, "readonly");
    const index = transaction.objectStore(STORES.miniEditorPages).index("by_user_page");
    const result = await requestToPromise(index.get([userId, pageKey]));
    await transactionToPromise(transaction);
    return result || null;
  }

  async function getMiniEditorPageByBibleChapter(userId, bibleVersionID, bibleChapterID) {
    if (!userId || !bibleVersionID || !bibleChapterID) return null;

    const db = await open();
    const transaction = db.transaction(STORES.miniEditorPages, "readonly");
    const index = transaction.objectStore(STORES.miniEditorPages).index("by_user_bible_chapter");
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

  async function putMiniEditorPage(page) {
    if (!page?.userId || !page?.pageKey) {
      throw new Error("Cannot store mini-editor state without userId and pageKey.");
    }

    const record = {
      ...page,
      localKey: page.localKey || buildMiniEditorLocalKey(page.userId, page.pageKey)
    };

    return put(STORES.miniEditorPages, record);
  }

  async function deleteMiniEditorPage(userId, pageKey) {
    if (!userId || !pageKey) return;
    return remove(STORES.miniEditorPages, buildMiniEditorLocalKey(userId, pageKey));
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
    getStudyDraft,
    putStudyDraft,
    deleteStudyDraft,
    listStudyDrafts,
    getStudy,
    putStudy,
    deleteStudy,
    listStudies,
    getMiniEditorPage,
    getMiniEditorPageByBibleChapter,
    putMiniEditorPage,
    deleteMiniEditorPage,
    getOutboxMutation,
    putOutboxMutation,
    deleteOutboxMutation,
    listOutboxForEntity,
    listOutbox,
    resetSendingMutations,
    buildQuillLocalKey,
    buildStudyDraftLocalKey,
    buildStudyLocalKey,
    buildMiniEditorLocalKey
  });
})();
