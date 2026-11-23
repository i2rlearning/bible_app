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
  const DB_VERSION = 5;

  const STORES = Object.freeze({
    meta: "meta",
    profiles: "profiles",
    quillNotes: "quillNotes",
    studyDrafts: "studyDrafts",
    studies: "studies",
    studyCategories: "studyCategories",
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

        if (!db.objectStoreNames.contains(STORES.studyCategories)) {
          const categories = db.createObjectStore(
            STORES.studyCategories,
            { keyPath: "localKey" }
          );
          categories.createIndex(
            "by_user",
            "userId",
            { unique: false }
          );
          categories.createIndex(
            "by_user_category",
            ["userId", "categoryId"],
            { unique: true }
          );
          categories.createIndex(
            "by_user_updated",
            ["userId", "localUpdatedAt"],
            { unique: false }
          );
          categories.createIndex(
            "by_user_sync",
            ["userId", "syncStatus"],
            { unique: false }
          );
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

  function buildStudyCategoryLocalKey(userId, categoryId) {
    return `${userId}::study_category::${categoryId}`;
  }

  async function getStudyCategory(userId, categoryId) {
    if (!userId || !categoryId) return null;

    /*
     * Category records already use a deterministic primary key made from the
     * user ID and Category ID. Reading by that primary key avoids depending
     * on a secondary compound index for an exact single-record lookup.
     */
    return get(
      STORES.studyCategories,
      buildStudyCategoryLocalKey(
        String(userId),
        String(categoryId)
      )
    );
  }

  async function putStudyCategory(category) {
    if (!category?.userId || !category?.categoryId) {
      throw new Error(
        "Cannot store a Study Category without userId and categoryId."
      );
    }

    const record = {
      ...category,
      localKey:
        category.localKey ||
        buildStudyCategoryLocalKey(
          category.userId,
          category.categoryId
        )
    };

    return put(
      STORES.studyCategories,
      record
    );
  }

  async function deleteStudyCategory(userId, categoryId) {
    if (!userId || !categoryId) return;

    return remove(
      STORES.studyCategories,
      buildStudyCategoryLocalKey(
        userId,
        categoryId
      )
    );
  }

  async function listStudyCategories(userId) {
    if (!userId) return [];

    const db = await open();
    const transaction = db.transaction(
      STORES.studyCategories,
      "readonly"
    );
    const index = transaction
      .objectStore(STORES.studyCategories)
      .index("by_user");
    const results = await requestToPromise(
      index.getAll(userId)
    );
    await transactionToPromise(transaction);

    return (results || []).sort(
      (a, b) =>
        Number(a.category?.sortOrder ?? 0) -
          Number(b.category?.sortOrder ?? 0) ||
        String(a.category?.name || "").localeCompare(
          String(b.category?.name || "")
        )
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

  function createStudyConflictError(code, message, studyId) {
    const error = new Error(message);
    error.code = code;
    error.studyId = String(studyId || "");
    return error;
  }

  function requireStudyScope(userId, studyId) {
    const normalizedUserId = String(userId || "");
    const normalizedStudyId = String(studyId || "");

    if (!normalizedUserId || !normalizedStudyId) {
      throw createStudyConflictError(
        "STUDY_SCOPE_INVALID",
        "A Study operation requires a user and Study ID.",
        normalizedStudyId
      );
    }

    return { userId: normalizedUserId, studyId: normalizedStudyId };
  }

  function isStudyConflict(record, outboxItems) {
    return (
      record?.syncStatus === "conflict" ||
      (outboxItems || []).some((item) => item.status === "conflict")
    );
  }

  function buildStudyMutationPayload(study = {}) {
    return {
      title: String(study.title || ""),
      categoryId: study.categoryId || study.category?.id || null,
      speaker: String(study.speaker || ""),
      location: String(study.location || ""),
      studyDate: study.studyDate || null,
      mainScripture: String(study.mainScripture || ""),
      tagIds: Array.isArray(study.tags)
        ? study.tags.map((tag) => String(tag?.id || "")).filter(Boolean)
        : [],
      linkedScriptures: Array.isArray(study.linkedScriptures)
        ? study.linkedScriptures
        : [],
      contentHtml: String(study.contentHtml || ""),
      previewText: String(study.previewText || "")
    };
  }

  function getStudyTransactionStores(includeDrafts = false) {
    return includeDrafts
      ? [STORES.studies, STORES.studyDrafts, STORES.outbox]
      : [STORES.studies, STORES.outbox];
  }

  function getStudyTransactionRequests(transaction, userId, studyId, includeDraft = false) {
    const studies = transaction.objectStore(STORES.studies);
    const outbox = transaction.objectStore(STORES.outbox);
    const requests = {
      record: studies.index("by_user_study").get([userId, studyId]),
      outboxItems: outbox.index("by_user_entity").getAll([userId, "study", studyId])
    };

    if (includeDraft) {
      requests.draft = transaction
        .objectStore(STORES.studyDrafts)
        .index("by_user_draft")
        .get([userId, `study:${studyId}`]);
    }

    return requests;
  }

  async function readStudyConflictBundle(userId, studyId) {
    const scope = requireStudyScope(userId, studyId);
    const db = await open();
    const transaction = db.transaction(getStudyTransactionStores(true), "readonly");
    const requests = getStudyTransactionRequests(
      transaction,
      scope.userId,
      scope.studyId,
      true
    );
    const [record, outboxItems, draft] = await Promise.all([
      requestToPromise(requests.record),
      requestToPromise(requests.outboxItems),
      requestToPromise(requests.draft)
    ]);
    await transactionToPromise(transaction);

    const items = (outboxItems || []).sort(
      (a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0)
    );

    return {
      userId: scope.userId,
      studyId: scope.studyId,
      record: record || null,
      outboxItems: items,
      protectedDraft:
        draft?.purpose === "study-conflict-protected" &&
        String(draft.studyId || "") === scope.studyId
          ? draft
          : null,
      hasConflict: isStudyConflict(record, items)
    };
  }

  async function listStudyConflictSummaries(userId) {
    const normalizedUserId = String(userId || "");
    if (!normalizedUserId) return [];

    const db = await open();
    const transaction = db.transaction([STORES.studies, STORES.outbox], "readonly");
    const studiesRequest = transaction
      .objectStore(STORES.studies)
      .index("by_user")
      .getAll(normalizedUserId);
    const conflictsRequest = transaction
      .objectStore(STORES.outbox)
      .index("by_user_status")
      .getAll([normalizedUserId, "conflict"]);
    const [records, mutations] = await Promise.all([
      requestToPromise(studiesRequest),
      requestToPromise(conflictsRequest)
    ]);
    await transactionToPromise(transaction);

    const recordsByStudyId = new Map(
      (records || []).map((record) => [String(record.studyId || ""), record])
    );
    const summaries = new Map();

    (records || [])
      .filter((record) => record?.syncStatus === "conflict")
      .forEach((record) => {
        const studyId = String(record.studyId || "");
        if (studyId) {
          summaries.set(studyId, {
            userId: normalizedUserId,
            studyId,
            record,
            conflictMutations: []
          });
        }
      });

    (mutations || [])
      .filter((mutation) => mutation?.entityType === "study")
      .forEach((mutation) => {
        const studyId = String(mutation.entityKey || "");
        if (!studyId) return;
        const summary = summaries.get(studyId) || {
          userId: normalizedUserId,
          studyId,
          record: recordsByStudyId.get(studyId) || null,
          conflictMutations: []
        };
        summary.conflictMutations.push(mutation);
        summaries.set(studyId, summary);
      });

    return Array.from(summaries.values()).sort(
      (a, b) =>
        Number(b.record?.localUpdatedAt || b.conflictMutations[0]?.updatedAt || 0) -
        Number(a.record?.localUpdatedAt || a.conflictMutations[0]?.updatedAt || 0)
    );
  }

  async function markStudyMutationConflictAtomically(input = {}) {
    const scope = requireStudyScope(input.userId, input.studyId || input.mutation?.entityKey);
    const mutationId = String(input.mutationId || input.mutation?.mutationId || "");
    if (!mutationId) {
      throw createStudyConflictError("STUDY_MUTATION_INVALID", "A mutation ID is required.", scope.studyId);
    }

    const db = await open();
    const transaction = db.transaction(getStudyTransactionStores(), "readwrite");
    const requests = getStudyTransactionRequests(transaction, scope.userId, scope.studyId);
    const [record, outboxItems] = await Promise.all([
      requestToPromise(requests.record),
      requestToPromise(requests.outboxItems)
    ]);
    const mutation = (outboxItems || []).find(
      (item) => String(item.mutationId || "") === mutationId
    );

    if (!mutation || mutation.userId !== scope.userId || mutation.entityType !== "study" ||
      String(mutation.entityKey || "") !== scope.studyId) {
      transaction.abort();
      throw createStudyConflictError("STUDY_MUTATION_NOT_FOUND", "The Study mutation is no longer available.", scope.studyId);
    }

    const timestamp = Number(input.updatedAt) || Date.now();
    transaction.objectStore(STORES.outbox).put({
      ...mutation,
      status: "conflict",
      updatedAt: timestamp,
      lastError: String(input.message || "A newer server version exists.")
    });

    let updatedRecord = null;
    if (record) {
      updatedRecord = {
        ...record,
        localKey:
          record.localKey ||
          buildStudyLocalKey(scope.userId, scope.studyId),
        syncStatus: "conflict",
        conflictRemote: input.latestStudy ? input.latestStudy : null,
        localUpdatedAt: timestamp
      };
      transaction.objectStore(STORES.studies).put(updatedRecord);
    }

    await transactionToPromise(transaction);
    return { record: updatedRecord, mutationId, outboxConflictOnly: !updatedRecord };
  }

  async function saveStudyConflictProtectedDraftAtomically(input = {}) {
    const scope = requireStudyScope(input.userId, input.studyId);
    const draftKey = String(input.draftKey || `study:${scope.studyId}`);
    if (draftKey !== `study:${scope.studyId}`) {
      throw createStudyConflictError("STUDY_DRAFT_INVALID", "A matching Study draft key is required.", scope.studyId);
    }

    const db = await open();
    const transaction = db.transaction(getStudyTransactionStores(true), "readwrite");
    const requests = getStudyTransactionRequests(transaction, scope.userId, scope.studyId, true);
    const [record, outboxItems, existingDraft] = await Promise.all([
      requestToPromise(requests.record),
      requestToPromise(requests.outboxItems),
      requestToPromise(requests.draft)
    ]);

    /* A verified server-authoritative case may exist without a local Study
     * row (for example after a remote deletion). The caller may opt in only
     * after validating the owner and Study identity against that server case.
     */
    if (!isStudyConflict(record, outboxItems || []) && input.allowDurableServerConflict !== true) {
      transaction.abort();
      throw createStudyConflictError("STUDY_CONFLICT_STALE", "This Study no longer has an unresolved synchronization conflict.", scope.studyId);
    }

    const expectedDraftId = String(input.expectedDraftId || "");
    const expectedDraftRevision = input.expectedDraftRevision;
    const protectedDraftId = String(input.protectedDraftId || "");
    const conflictCaseId = String(input.conflictCaseId || "");

    if (existingDraft) {
      if (
        !expectedDraftId ||
        String(existingDraft.protectedDraftId || "") !== expectedDraftId ||
        !Number.isInteger(Number(expectedDraftRevision)) ||
        Number(existingDraft.draftRevision) !== Number(expectedDraftRevision) ||
        String(existingDraft.conflictCaseId || "") !== conflictCaseId
      ) {
        transaction.abort();
        throw createStudyConflictError(
          "STUDY_PROTECTED_DRAFT_STALE",
          "This protected draft changed on this device. Reopen it before updating it.",
          scope.studyId
        );
      }
    } else if (!protectedDraftId) {
      transaction.abort();
      throw createStudyConflictError(
        "STUDY_PROTECTED_DRAFT_INVALID",
        "A protected draft identity is required.",
        scope.studyId
      );
    }

    const timestamp = Number(input.updatedAt) || Date.now();
    const draft = {
      ...(existingDraft || {}),
      userId: scope.userId,
      deviceId: String(input.deviceId || existingDraft?.deviceId || ""),
      draftKey,
      studyId: scope.studyId,
      localKey: buildStudyDraftLocalKey(scope.userId, draftKey),
      protectedDraftId: existingDraft?.protectedDraftId || protectedDraftId,
      draftRevision: Number(existingDraft?.draftRevision || 0) + 1,
      conflictCaseId,
      baseVersion: Number.isInteger(Number(input.conflictBaseVersion))
        ? Number(input.conflictBaseVersion)
        : null,
      data: input.data || {},
      purpose: "study-conflict-protected",
      conflictBaseVersion: Number.isInteger(Number(input.conflictBaseVersion))
        ? Number(input.conflictBaseVersion)
        : null,
      protectedAt: timestamp,
      createdAt: Number(existingDraft?.createdAt) || timestamp,
      localUpdatedAt: timestamp,
      syncStatus: "local-draft"
    };
    transaction.objectStore(STORES.studyDrafts).put(draft);
    await transactionToPromise(transaction);
    return draft;
  }

  async function saveStudyNewerVersionProtectedDraftAtomically(input = {}) {
    const scope = requireStudyScope(input.userId, input.studyId);
    const draftKey = `study-newer-version:${scope.studyId}`;
    if (String(input.draftKey || draftKey) !== draftKey) {
      throw createStudyConflictError("STUDY_DRAFT_INVALID", "A matching newer-version draft key is required.", scope.studyId);
    }
    const db = await open();
    const transaction = db.transaction(STORES.studyDrafts, "readwrite");
    const store = transaction.objectStore(STORES.studyDrafts);
    const existing = await requestToPromise(
      store.index("by_user_draft").get([scope.userId, draftKey])
    );
    const expectedDraftId = String(input.expectedDraftId || "");
    if (existing && (
      !expectedDraftId ||
      String(existing.protectedDraftId || "") !== expectedDraftId ||
      Number(existing.draftRevision) !== Number(input.expectedDraftRevision)
    )) {
      transaction.abort();
      throw createStudyConflictError("STUDY_NEWER_VERSION_DRAFT_STALE", "This local-only draft changed in another tab. It was not replaced.", scope.studyId);
    }
    const protectedDraftId = String(existing?.protectedDraftId || input.protectedDraftId || "");
    if (!protectedDraftId) {
      transaction.abort();
      throw createStudyConflictError("STUDY_NEWER_VERSION_DRAFT_INVALID", "A local-only draft identity is required.", scope.studyId);
    }
    const timestamp = Number(input.updatedAt) || Date.now();
    const draft = {
      ...(existing || {}),
      userId: scope.userId,
      deviceId: String(input.deviceId || existing?.deviceId || ""),
      draftKey,
      studyId: scope.studyId,
      localKey: buildStudyDraftLocalKey(scope.userId, draftKey),
      protectedDraftId,
      draftRevision: Number(existing?.draftRevision || 0) + 1,
      baseVersion: Number.isInteger(Number(input.baseVersion)) ? Number(input.baseVersion) : null,
      data: input.data || {},
      purpose: "study-newer-version-protected",
      protectedAt: timestamp,
      createdAt: Number(existing?.createdAt) || timestamp,
      localUpdatedAt: timestamp,
      syncStatus: "local-draft"
    };
    store.put(draft);
    await transactionToPromise(transaction);
    return draft;
  }

  async function discardOrdinaryStudyDraftAtomically(userId, draftKey) {
    const normalizedUserId = String(userId || "");
    const normalizedDraftKey = String(draftKey || "");
    if (!normalizedUserId || !normalizedDraftKey) return false;

    const db = await open();
    const transaction = db.transaction(STORES.studyDrafts, "readwrite");
    const store = transaction.objectStore(STORES.studyDrafts);
    const existing = await requestToPromise(
      store.index("by_user_draft").get([normalizedUserId, normalizedDraftKey])
    );

    if (existing?.purpose === "study-conflict-protected") {
      transaction.abort();
      throw createStudyConflictError(
        "STUDY_PROTECTED_DRAFT_CANNOT_DISCARD",
        "A protected Study conflict draft cannot be discarded by ordinary navigation.",
        existing.studyId
      );
    }

    if (existing) {
      store.delete(existing.localKey);
    }
    await transactionToPromise(transaction);
    return Boolean(existing);
  }

  async function queueStudyMutationIfNoConflictAtomically(input = {}) {
    const scope = requireStudyScope(input.userId, input.studyId || input.record?.studyId);
    const operation = String(input.operation || "update");
    const suppliedRecord = input.record;
    if (!suppliedRecord || String(suppliedRecord.studyId || "") !== scope.studyId) {
      throw createStudyConflictError("STUDY_RECORD_INVALID", "A matching Study record is required.", scope.studyId);
    }

    const db = await open();
    const transaction = db.transaction(getStudyTransactionStores(), "readwrite");
    const requests = getStudyTransactionRequests(transaction, scope.userId, scope.studyId);
    const [current, outboxItems] = await Promise.all([
      requestToPromise(requests.record),
      requestToPromise(requests.outboxItems)
    ]);

    if (!current) {
      transaction.abort();
      throw createStudyConflictError("STUDY_NOT_FOUND", "This Study is not available in the local cache.", scope.studyId);
    }
    if (isStudyConflict(current, outboxItems || [])) {
      transaction.abort();
      throw createStudyConflictError(
        operation === "delete" ? "STUDY_DELETE_CONFLICT_OPEN" : "STUDY_CONFLICT_OPEN",
        "This Study has an unresolved synchronization conflict that must be resolved first.",
        scope.studyId
      );
    }

    const timestamp = Number(input.updatedAt) || Date.now();
    const record = {
      ...suppliedRecord,
      userId: scope.userId,
      studyId: scope.studyId,
      localKey: buildStudyLocalKey(scope.userId, scope.studyId),
      localUpdatedAt: timestamp
    };
    const existingMutation = (outboxItems || []).find((item) => item.status === "pending");
    const mutation = {
      ...(existingMutation || {}),
      ...(input.mutation || {}),
      mutationId: existingMutation?.mutationId || input.mutation?.mutationId,
      userId: scope.userId,
      entityType: "study",
      entityKey: scope.studyId,
      operation,
      status: "pending",
      createdAt: Number(existingMutation?.createdAt) || timestamp,
      updatedAt: timestamp,
      lastError: ""
    };
    if (!mutation.mutationId) {
      transaction.abort();
      throw createStudyConflictError("STUDY_MUTATION_INVALID", "A mutation ID is required.", scope.studyId);
    }

    transaction.objectStore(STORES.studies).put(record);
    transaction.objectStore(STORES.outbox).put(mutation);
    await transactionToPromise(transaction);
    return { record, mutation };
  }

  async function resolveStudyConflictAtomically(input = {}) {
    const scope = requireStudyScope(input.userId, input.studyId);
    const resolution = String(input.resolution || "");
    const db = await open();
    const transaction = db.transaction(getStudyTransactionStores(true), "readwrite");
    const requests = getStudyTransactionRequests(transaction, scope.userId, scope.studyId, true);
    const [current, outboxItems, protectedDraft] = await Promise.all([
      requestToPromise(requests.record),
      requestToPromise(requests.outboxItems),
      requestToPromise(requests.draft)
    ]);

    if (!current || !isStudyConflict(current, outboxItems || [])) {
      transaction.abort();
      throw createStudyConflictError("STUDY_CONFLICT_NOT_FOUND", "This Study does not currently have a synchronization conflict.", scope.studyId);
    }
    if (protectedDraft?.purpose === "study-conflict-protected") {
      transaction.abort();
      throw createStudyConflictError("STUDY_PROTECTED_DRAFT_PENDING", "A newer protected Study draft must be handled before this conflict can be resolved.", scope.studyId);
    }

    const remote = current.conflictRemote || null;
    const remoteVersion = Number(remote?.version) || 0;
    if (!remote?.id || String(remote.id) !== scope.studyId || remoteVersion < 1) {
      transaction.abort();
      throw createStudyConflictError("STUDY_CONFLICT_REMOTE_UNAVAILABLE", "The newer synchronized Study version is not available.", scope.studyId);
    }
    if (resolution === "keep-delete" && current.deleted !== true) {
      transaction.abort();
      throw createStudyConflictError("STUDY_DELETE_CONFLICT_NOT_FOUND", "This Study does not currently have a delete conflict.", scope.studyId);
    }

    const timestamp = Number(input.updatedAt) || Date.now();
    const studies = transaction.objectStore(STORES.studies);
    const outbox = transaction.objectStore(STORES.outbox);
    (outboxItems || []).forEach((item) => outbox.delete(item.mutationId));

    let record;
    let mutation = null;
    if (resolution === "use-synced") {
      record = {
        ...current,
        userId: scope.userId,
        studyId: scope.studyId,
        study: remote,
        baseStudy: remote,
        baseVersion: remoteVersion,
        serverVersion: remoteVersion,
        serverUpdatedAt: remote.updatedAt || null,
        localUpdatedAt: timestamp,
        syncStatus: "clean",
        conflictRemote: null,
        deleted: false
      };
    } else if (resolution === "keep-device" || resolution === "keep-delete") {
      const deleted = resolution === "keep-delete";
      const localStudy = deleted ? remote : current.study;
      if (!localStudy?.id || String(localStudy.id) !== scope.studyId) {
        transaction.abort();
        throw createStudyConflictError("STUDY_LOCAL_VERSION_UNAVAILABLE", "The local Study version is not available.", scope.studyId);
      }
      const rebasedStudy = {
        ...localStudy,
        id: scope.studyId,
        version: remoteVersion,
        updatedAt: new Date().toISOString()
      };
      record = {
        ...current,
        userId: scope.userId,
        studyId: scope.studyId,
        study: rebasedStudy,
        baseStudy: remote,
        baseVersion: remoteVersion,
        serverVersion: remoteVersion,
        serverUpdatedAt: remote.updatedAt || null,
        localUpdatedAt: timestamp,
        syncStatus: "pending",
        conflictRemote: null,
        deleted
      };
      mutation = {
        ...(input.mutation || {}),
        mutationId: input.mutation?.mutationId,
        userId: scope.userId,
        entityType: "study",
        entityKey: scope.studyId,
        operation: deleted ? "delete" : "update",
        baseVersion: remoteVersion,
        deviceId: String(input.deviceId || input.mutation?.deviceId || ""),
        payload: input.mutation?.payload || buildStudyMutationPayload(rebasedStudy),
        status: "pending",
        createdAt: timestamp,
        updatedAt: timestamp,
        lastError: ""
      };
      if (!mutation.mutationId) {
        transaction.abort();
        throw createStudyConflictError("STUDY_MUTATION_INVALID", "A mutation ID is required.", scope.studyId);
      }
    } else {
      transaction.abort();
      throw createStudyConflictError("STUDY_RESOLUTION_INVALID", "This Study conflict resolution is not supported.", scope.studyId);
    }

    studies.put({ ...record, localKey: buildStudyLocalKey(scope.userId, scope.studyId) });
    if (mutation) outbox.put(mutation);
    await transactionToPromise(transaction);
    return { record, mutation, remote };
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
    getStudyCategory,
    putStudyCategory,
    deleteStudyCategory,
    listStudyCategories,
    getMiniEditorPage,
    getMiniEditorPageByBibleChapter,
    putMiniEditorPage,
    deleteMiniEditorPage,
    getOutboxMutation,
    putOutboxMutation,
    deleteOutboxMutation,
    listOutboxForEntity,
    listOutbox,
    readStudyConflictBundle,
    listStudyConflictSummaries,
    markStudyMutationConflictAtomically,
    saveStudyConflictProtectedDraftAtomically,
    saveStudyNewerVersionProtectedDraftAtomically,
    discardOrdinaryStudyDraftAtomically,
    queueStudyMutationIfNoConflictAtomically,
    resolveStudyConflictAtomically,
    resetSendingMutations,
    buildQuillLocalKey,
    buildStudyDraftLocalKey,
    buildStudyLocalKey,
    buildStudyCategoryLocalKey,
    buildMiniEditorLocalKey
  });
})();
