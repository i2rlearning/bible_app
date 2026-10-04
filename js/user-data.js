"use strict";

/*
 * Project file: js/user-data.js
 *
 * Purpose:
 * Provides the Phase 4 user/device identity layer, the local mirror for
 * authenticated My Notes (Quill), and local-only Study Desk draft autosave.
 *
 * What this file does:
 * - Creates one persistent deviceId for this browser/device installation.
 * - Reads the currently authenticated Clerk user from the live Clerk session.
 * - Accepts a user ID verified by the protected /api/me endpoint.
 * - Stores a local profile keyed strictly by Clerk userId in UserOfflineDB.
 * - Records which Clerk user was most recently verified online on this device.
 * - Mirrors successful server Quill-note loads/saves into UserOfflineDB.
 * - Removes the local Quill mirror only after an explicit successful server delete.
 * - Mirrors successful server mini-editor loads/saves into UserOfflineDB.
 * - Queues authenticated My Notes and mini-editor changes in the durable outbox
 *   when the already-verified editor session is offline.
 * - Removes a clean local mini-editor mirror after an explicit successful server delete.
 * - Preserves older pending/conflict mini-editor records instead of overwriting them.
 * - Preserves any older pending/conflict local record instead of overwriting it.
 * - Saves authenticated Study Desk drafts locally with the current deviceId.
 * - Keeps Study Desk draft autosave local-only in this step; it does not sync drafts.
 * - Deletes a Study Desk local draft after the user explicitly discards it or after
 *   the existing server Save succeeds.
 *
 * Important security rule:
 * - deviceId is NOT authentication.
 * - A userId stored in IndexedDB is NOT authentication.
 * - A live Clerk session or a successful protected /api/me response is required
 *   before this step writes private user data into the local mirror.
 * - Full offline trust after reload/navigation is intentionally NOT enabled yet.
 * - Step 6 allows only an editor session that was already verified online on the
 *   current page to queue private edits while connectivity is lost.
 * - Automatic reconnect synchronization is intentionally deferred to Step 7.
 *
 * Dependencies:
 * - js/user-offline-db.js must be loaded before this file is used.
 */

window.UserData = (() => {
  const ENTITY_QUILL_NOTE = "quill_note";
  const ENTITY_MINI_EDITOR_PAGE = "mini_editor_page";
  const DEVICE_ID_STORAGE_KEY = "BibleAppDeviceId";
  const LAST_VERIFIED_USER_META_KEY = "phase4LastVerifiedUserId";

  function now() {
    return Date.now();
  }

  function newUuid() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      const value = character === "x" ? random : ((random & 0x3) | 0x8);
      return value.toString(16);
    });
  }

  function requireUserOfflineDB() {
    if (!window.UserOfflineDB) {
      throw new Error(
        "UserOfflineDB is not available. Load js/user-offline-db.js before js/user-data.js."
      );
    }

    return window.UserOfflineDB;
  }

  function getClerkObject() {
    return window.Clerk || window.clerk || null;
  }

  function getDeviceId() {
    try {
      let deviceId = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);

      if (!deviceId) {
        deviceId = newUuid();
        window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
      }

      return deviceId;
    } catch (_error) {
      // Fallback is intentionally page-memory only if localStorage is unavailable.
      if (!window.__BibleAppDeviceId) {
        window.__BibleAppDeviceId = newUuid();
      }

      return window.__BibleAppDeviceId;
    }
  }

  function getLiveAuthenticatedUserId() {
    const clerkObj = getClerkObject();
    const userId = clerkObj?.user?.id;

    return userId ? String(userId) : "";
  }

  async function rememberVerifiedAuthenticatedUser(userId) {
    const db = requireUserOfflineDB();
    const verifiedUserId = String(userId || "");

    if (!verifiedUserId) {
      return null;
    }

    const deviceId = getDeviceId();
    const existing = await db.getProfile(verifiedUserId);
    const timestamp = now();

    const profile = {
      userId: verifiedUserId,
      deviceId,
      createdAt: Number(existing?.createdAt) || timestamp,
      lastVerifiedAt: timestamp,
      updatedAt: timestamp
    };

    await db.putProfile(profile);
    await db.setMeta(LAST_VERIFIED_USER_META_KEY, verifiedUserId);

    return profile;
  }

  async function rememberCurrentAuthenticatedUser() {
    const userId = getLiveAuthenticatedUserId();

    if (!userId) {
      return null;
    }

    return rememberVerifiedAuthenticatedUser(userId);
  }

  function mapServerQuillNote(serverNote, fallbackIdentity = {}) {
    if (!serverNote) {
      return null;
    }

    return {
      pageKey: String(
        serverNote.page_key ||
        serverNote.pageKey ||
        fallbackIdentity.pageKey ||
        ""
      ),
      bibleVersionID: String(
        serverNote.bible_version_id ||
        serverNote.bibleVersionID ||
        fallbackIdentity.bibleVersionID ||
        ""
      ),
      bibleChapterID: String(
        serverNote.bible_chapter_id ||
        serverNote.bibleChapterID ||
        fallbackIdentity.bibleChapterID ||
        ""
      ),
      pageUrl: String(
        serverNote.page_url ||
        serverNote.pageUrl ||
        fallbackIdentity.pageUrl ||
        ""
      ),
      bibleName: String(
        serverNote.bible_name ||
        serverNote.bibleName ||
        fallbackIdentity.bibleName ||
        ""
      ),
      bookChapterLabel: String(
        serverNote.book_chapter_label ||
        serverNote.bookChapterLabel ||
        fallbackIdentity.bookChapterLabel ||
        ""
      ),
      quillDelta:
        serverNote.quill_delta_json ||
        serverNote.quillDelta ||
        null,
      plainText: String(
        serverNote.quill_plain_text ||
        serverNote.plainText ||
        ""
      ),
      serverVersion: Number(serverNote.version || serverNote.serverVersion) || 0,
      serverUpdatedAt:
        serverNote.updated_at ||
        serverNote.updatedAt ||
        null
    };
  }

  async function cacheQuillNoteFromServer(userId, serverNote, fallbackIdentity = {}) {
    const db = requireUserOfflineDB();
    const verifiedUserId = String(userId || "");

    if (!verifiedUserId) {
      throw new Error("Cannot cache Quill notes without a verified userId.");
    }

    const mapped = mapServerQuillNote(serverNote, fallbackIdentity);

    if (!mapped?.pageKey) {
      return null;
    }

    const existing = await db.getQuillNote(verifiedUserId, mapped.pageKey);
    const protectedLocalStatuses = new Set(["pending", "sending", "conflict"]);

    // A leftover unsynchronized record from an earlier Phase 4 attempt may still
    // exist because the Phase 3 rollback intentionally did not clear IndexedDB.
    // Never destroy that local work merely because an online server copy loaded.
    if (existing && protectedLocalStatuses.has(existing.syncStatus)) {
      return existing;
    }

    const record = {
      ...(existing || {}),
      userId: verifiedUserId,
      pageKey: mapped.pageKey,
      bibleVersionID: mapped.bibleVersionID,
      bibleChapterID: mapped.bibleChapterID,
      pageUrl: mapped.pageUrl,
      bibleName: mapped.bibleName,
      bookChapterLabel: mapped.bookChapterLabel,
      quillDelta: mapped.quillDelta,
      plainText: mapped.plainText,
      serverVersion: mapped.serverVersion,
      serverUpdatedAt: mapped.serverUpdatedAt,
      localUpdatedAt: now(),
      syncStatus: "clean",
      conflictRemote: null,
      deleted: false
    };

    await db.putQuillNote(record);
    return record;
  }

  async function deleteCachedQuillNote(userId, identity = {}) {
    const db = requireUserOfflineDB();
    const verifiedUserId = String(userId || "");

    if (!verifiedUserId) {
      return;
    }

    const pageKey = String(identity.pageKey || "");
    let chapterMatch = null;

    if (identity.bibleVersionID && identity.bibleChapterID) {
      chapterMatch = await db.getQuillNoteByBibleChapter(
        verifiedUserId,
        String(identity.bibleVersionID),
        String(identity.bibleChapterID)
      );
    }

    if (pageKey) {
      await db.deleteQuillNote(verifiedUserId, pageKey);
    }

    if (chapterMatch?.pageKey && chapterMatch.pageKey !== pageKey) {
      await db.deleteQuillNote(verifiedUserId, chapterMatch.pageKey);
    }
  }

  async function getCachedQuillNote(userId, identity = {}) {
    const db = requireUserOfflineDB();
    const verifiedUserId = String(userId || "");

    if (!verifiedUserId) {
      return null;
    }

    if (identity.pageKey) {
      const byPage = await db.getQuillNote(verifiedUserId, String(identity.pageKey));
      if (byPage) {
        return byPage;
      }
    }

    if (identity.bibleVersionID && identity.bibleChapterID) {
      return db.getQuillNoteByBibleChapter(
        verifiedUserId,
        String(identity.bibleVersionID),
        String(identity.bibleChapterID)
      );
    }

    return null;
  }


  function mapServerMiniEditorPage(serverPage, fallbackIdentity = {}) {
    if (!serverPage) {
      return null;
    }

    let miniEditorJson =
      serverPage.mini_editor_json ??
      serverPage.miniEditorJson ??
      null;

    if (typeof miniEditorJson === "string") {
      try {
        miniEditorJson = JSON.parse(miniEditorJson);
      } catch (_error) {
        // Keep the original value if an older server record is not JSON-parsable.
      }
    }

    return {
      pageKey: String(
        serverPage.page_key ||
        serverPage.pageKey ||
        fallbackIdentity.pageKey ||
        ""
      ),
      bibleVersionID: String(
        serverPage.bible_version_id ||
        serverPage.bibleVersionID ||
        fallbackIdentity.bibleVersionID ||
        ""
      ),
      bibleChapterID: String(
        serverPage.bible_chapter_id ||
        serverPage.bibleChapterID ||
        fallbackIdentity.bibleChapterID ||
        ""
      ),
      pageUrl: String(
        serverPage.page_url ||
        serverPage.pageUrl ||
        fallbackIdentity.pageUrl ||
        ""
      ),
      bibleName: String(
        serverPage.bible_name ||
        serverPage.bibleName ||
        fallbackIdentity.bibleName ||
        ""
      ),
      bookChapterLabel: String(
        serverPage.book_chapter_label ||
        serverPage.bookChapterLabel ||
        fallbackIdentity.bookChapterLabel ||
        ""
      ),
      miniEditorJson,
      hasHighlights: Boolean(
        serverPage.has_highlights ??
        serverPage.hasHighlights
      ),
      hasDrawings: Boolean(
        serverPage.has_drawings ??
        serverPage.hasDrawings
      ),
      hasTextFormats: Boolean(
        serverPage.has_text_formats ??
        serverPage.hasTextFormats
      ),
      serverVersion: Number(
        serverPage.version ||
        serverPage.serverVersion
      ) || 0,
      serverUpdatedAt:
        serverPage.updated_at ||
        serverPage.updatedAt ||
        null
    };
  }

  async function cacheMiniEditorPageFromServer(
    userId,
    serverPage,
    fallbackIdentity = {}
  ) {
    const db = requireUserOfflineDB();
    const verifiedUserId = String(userId || "");

    if (!verifiedUserId) {
      throw new Error("Cannot cache mini-editor state without a verified userId.");
    }

    const mapped = mapServerMiniEditorPage(serverPage, fallbackIdentity);

    if (!mapped?.pageKey) {
      return null;
    }

    const existing = await db.getMiniEditorPage(
      verifiedUserId,
      mapped.pageKey
    );

    const protectedLocalStatuses = new Set([
      "pending",
      "sending",
      "conflict"
    ]);

    // Do not destroy unsynchronized work that may remain from an earlier run.
    if (existing && protectedLocalStatuses.has(existing.syncStatus)) {
      return existing;
    }

    const record = {
      ...(existing || {}),
      userId: verifiedUserId,
      deviceId: getDeviceId(),
      pageKey: mapped.pageKey,
      bibleVersionID: mapped.bibleVersionID,
      bibleChapterID: mapped.bibleChapterID,
      pageUrl: mapped.pageUrl,
      bibleName: mapped.bibleName,
      bookChapterLabel: mapped.bookChapterLabel,
      miniEditorJson: mapped.miniEditorJson,
      hasHighlights: mapped.hasHighlights,
      hasDrawings: mapped.hasDrawings,
      hasTextFormats: mapped.hasTextFormats,
      serverVersion: mapped.serverVersion,
      serverUpdatedAt: mapped.serverUpdatedAt,
      localUpdatedAt: now(),
      syncStatus: "clean",
      conflictRemote: null,
      deleted: false
    };

    await db.putMiniEditorPage(record);
    return record;
  }

  async function deleteCachedMiniEditorPage(userId, identity = {}) {
    const db = requireUserOfflineDB();
    const verifiedUserId = String(userId || "");

    if (!verifiedUserId) {
      return;
    }

    const pageKey = String(identity.pageKey || "");
    let pageMatch = null;

    if (pageKey) {
      pageMatch = await db.getMiniEditorPage(verifiedUserId, pageKey);
    }

    if (
      !pageMatch &&
      identity.bibleVersionID &&
      identity.bibleChapterID
    ) {
      pageMatch = await db.getMiniEditorPageByBibleChapter(
        verifiedUserId,
        String(identity.bibleVersionID),
        String(identity.bibleChapterID)
      );
    }

    const protectedLocalStatuses = new Set([
      "pending",
      "sending",
      "conflict"
    ]);

    // A successful server delete removes only a clean mirror. If an older
    // unsynchronized local record exists, leave it intact for later recovery.
    if (
      pageMatch &&
      protectedLocalStatuses.has(pageMatch.syncStatus)
    ) {
      return;
    }

    if (pageKey) {
      await db.deleteMiniEditorPage(verifiedUserId, pageKey);
    }

    if (
      pageMatch?.pageKey &&
      pageMatch.pageKey !== pageKey
    ) {
      await db.deleteMiniEditorPage(
        verifiedUserId,
        pageMatch.pageKey
      );
    }
  }

  async function getCachedMiniEditorPage(userId, identity = {}) {
    const db = requireUserOfflineDB();
    const verifiedUserId = String(userId || "");

    if (!verifiedUserId) {
      return null;
    }

    if (identity.pageKey) {
      const byPage = await db.getMiniEditorPage(
        verifiedUserId,
        String(identity.pageKey)
      );

      if (byPage) {
        return byPage;
      }
    }

    if (identity.bibleVersionID && identity.bibleChapterID) {
      return db.getMiniEditorPageByBibleChapter(
        verifiedUserId,
        String(identity.bibleVersionID),
        String(identity.bibleChapterID)
      );
    }

    return null;
  }


  async function requirePreviouslyVerifiedLocalUser(userId) {
    const db = requireUserOfflineDB();
    const verifiedUserId = String(userId || "");
    const profile = verifiedUserId
      ? await db.getProfile(verifiedUserId)
      : null;

    if (!profile?.lastVerifiedAt) {
      throw new Error(
        "Offline private edits require a user that was verified online on this device."
      );
    }

    return profile;
  }

  async function getReusablePendingMutation(userId, entityType, entityKey) {
    const db = requireUserOfflineDB();
    const items = await db.listOutboxForEntity(
      String(userId || ""),
      String(entityType || ""),
      String(entityKey || "")
    );

    return items.find((item) => item.status === "pending") || null;
  }

  async function removePendingMutationsForEntity(userId, entityType, entityKey) {
    const db = requireUserOfflineDB();
    const items = await db.listOutboxForEntity(
      String(userId || ""),
      String(entityType || ""),
      String(entityKey || "")
    );

    for (const item of items) {
      if (item.status === "pending") {
        await db.deleteOutboxMutation(item.mutationId);
      }
    }
  }

  async function putQuillOutboxMutation(userId, noteRecord, operation) {
    const db = requireUserOfflineDB();
    const entityKey = String(noteRecord.pageKey || "");
    const existing = await getReusablePendingMutation(
      userId,
      ENTITY_QUILL_NOTE,
      entityKey
    );
    const timestamp = now();

    const mutation = {
      ...(existing || {}),
      mutationId: existing?.mutationId || newUuid(),
      userId: String(userId),
      deviceId: getDeviceId(),
      entityType: ENTITY_QUILL_NOTE,
      entityKey,
      operation,
      baseVersion: Number(noteRecord.serverVersion) || 0,
      payload: operation === "delete"
        ? null
        : {
            bibleVersionID: noteRecord.bibleVersionID,
            bibleChapterID: noteRecord.bibleChapterID,
            pageKey: noteRecord.pageKey,
            pageUrl: noteRecord.pageUrl || "",
            bibleName: noteRecord.bibleName || "",
            bookChapterLabel: noteRecord.bookChapterLabel || "",
            quillDelta: noteRecord.quillDelta,
            plainText: noteRecord.plainText || ""
          },
      status: "pending",
      createdAt: Number(existing?.createdAt) || timestamp,
      updatedAt: timestamp,
      attemptCount: Number(existing?.attemptCount) || 0,
      lastError: ""
    };

    await db.putOutboxMutation(mutation);
    return mutation;
  }

  async function queueQuillNoteForSync(userId, input = {}) {
    const db = requireUserOfflineDB();
    const verifiedUserId = String(userId || "");
    const pageKey = String(input.pageKey || "");

    if (!verifiedUserId || !pageKey) {
      throw new Error("A verified userId and pageKey are required to queue My Notes.");
    }

    await requirePreviouslyVerifiedLocalUser(verifiedUserId);

    let existing = await db.getQuillNote(verifiedUserId, pageKey);

    if (
      !existing &&
      input.bibleVersionID &&
      input.bibleChapterID
    ) {
      existing = await db.getQuillNoteByBibleChapter(
        verifiedUserId,
        String(input.bibleVersionID),
        String(input.bibleChapterID)
      );
    }

    const record = {
      ...(existing || {}),
      userId: verifiedUserId,
      deviceId: getDeviceId(),
      pageKey: existing?.pageKey || pageKey,
      bibleVersionID: String(input.bibleVersionID || existing?.bibleVersionID || ""),
      bibleChapterID: String(input.bibleChapterID || existing?.bibleChapterID || ""),
      pageUrl: String(input.pageUrl || existing?.pageUrl || ""),
      bibleName: String(input.bibleName || existing?.bibleName || ""),
      bookChapterLabel: String(input.bookChapterLabel || existing?.bookChapterLabel || ""),
      quillDelta: input.quillDelta,
      plainText: String(input.plainText || ""),
      serverVersion:
        Number(existing?.serverVersion) ||
        Number(input.serverVersion) ||
        0,
      serverUpdatedAt: existing?.serverUpdatedAt || null,
      localUpdatedAt: now(),
      syncStatus: "pending",
      conflictRemote: null,
      deleted: false
    };

    await db.putQuillNote(record);

    const operation = record.serverVersion > 0 ? "update" : "create";
    const mutation = await putQuillOutboxMutation(
      verifiedUserId,
      record,
      operation
    );

    return {
      userId: verifiedUserId,
      note: record,
      mutationId: mutation.mutationId,
      syncStatus: "pending"
    };
  }

  async function queueQuillDeleteForSync(userId, input = {}) {
    const db = requireUserOfflineDB();
    const verifiedUserId = String(userId || "");
    const requestedPageKey = String(input.pageKey || "");

    if (!verifiedUserId || !requestedPageKey) {
      throw new Error("A verified userId and pageKey are required to queue a My Notes delete.");
    }

    await requirePreviouslyVerifiedLocalUser(verifiedUserId);

    let existing = await db.getQuillNote(
      verifiedUserId,
      requestedPageKey
    );

    if (
      !existing &&
      input.bibleVersionID &&
      input.bibleChapterID
    ) {
      existing = await db.getQuillNoteByBibleChapter(
        verifiedUserId,
        String(input.bibleVersionID),
        String(input.bibleChapterID)
      );
    }

    const entityKey = existing?.pageKey || requestedPageKey;
    const serverVersion =
      Number(existing?.serverVersion) ||
      Number(input.serverVersion) ||
      0;

    if (serverVersion <= 0) {
      await removePendingMutationsForEntity(
        verifiedUserId,
        ENTITY_QUILL_NOTE,
        entityKey
      );

      await db.deleteQuillNote(verifiedUserId, entityKey);

      return {
        userId: verifiedUserId,
        note: null,
        mutationId: "",
        syncStatus: "clean",
        queued: false
      };
    }

    const tombstone = {
      ...(existing || {}),
      userId: verifiedUserId,
      deviceId: getDeviceId(),
      pageKey: entityKey,
      bibleVersionID: String(input.bibleVersionID || existing?.bibleVersionID || ""),
      bibleChapterID: String(input.bibleChapterID || existing?.bibleChapterID || ""),
      pageUrl: String(input.pageUrl || existing?.pageUrl || ""),
      bibleName: String(input.bibleName || existing?.bibleName || ""),
      bookChapterLabel: String(input.bookChapterLabel || existing?.bookChapterLabel || ""),
      quillDelta: null,
      plainText: "",
      serverVersion,
      serverUpdatedAt: existing?.serverUpdatedAt || null,
      localUpdatedAt: now(),
      syncStatus: "pending",
      conflictRemote: null,
      deleted: true
    };

    await db.putQuillNote(tombstone);

    const mutation = await putQuillOutboxMutation(
      verifiedUserId,
      tombstone,
      "delete"
    );

    return {
      userId: verifiedUserId,
      note: null,
      mutationId: mutation.mutationId,
      syncStatus: "pending",
      queued: true
    };
  }

  async function putMiniEditorOutboxMutation(userId, pageRecord, operation) {
    const db = requireUserOfflineDB();
    const entityKey = String(pageRecord.pageKey || "");
    const existing = await getReusablePendingMutation(
      userId,
      ENTITY_MINI_EDITOR_PAGE,
      entityKey
    );
    const timestamp = now();

    const mutation = {
      ...(existing || {}),
      mutationId: existing?.mutationId || newUuid(),
      userId: String(userId),
      deviceId: getDeviceId(),
      entityType: ENTITY_MINI_EDITOR_PAGE,
      entityKey,
      operation,
      baseVersion: Number(pageRecord.serverVersion) || 0,
      payload: operation === "delete"
        ? null
        : {
            bibleVersionID: pageRecord.bibleVersionID,
            bibleChapterID: pageRecord.bibleChapterID,
            pageKey: pageRecord.pageKey,
            pageUrl: pageRecord.pageUrl || "",
            bibleName: pageRecord.bibleName || "",
            bookChapterLabel: pageRecord.bookChapterLabel || "",
            miniEditorJson: pageRecord.miniEditorJson,
            hasHighlights: Boolean(pageRecord.hasHighlights),
            hasDrawings: Boolean(pageRecord.hasDrawings),
            hasTextFormats: Boolean(pageRecord.hasTextFormats)
          },
      status: "pending",
      createdAt: Number(existing?.createdAt) || timestamp,
      updatedAt: timestamp,
      attemptCount: Number(existing?.attemptCount) || 0,
      lastError: ""
    };

    await db.putOutboxMutation(mutation);
    return mutation;
  }

  async function queueMiniEditorPageForSync(userId, input = {}) {
    const db = requireUserOfflineDB();
    const verifiedUserId = String(userId || "");
    const pageKey = String(input.pageKey || "");

    if (!verifiedUserId || !pageKey) {
      throw new Error("A verified userId and pageKey are required to queue annotations.");
    }

    await requirePreviouslyVerifiedLocalUser(verifiedUserId);

    let existing = await db.getMiniEditorPage(
      verifiedUserId,
      pageKey
    );

    if (
      !existing &&
      input.bibleVersionID &&
      input.bibleChapterID
    ) {
      existing = await db.getMiniEditorPageByBibleChapter(
        verifiedUserId,
        String(input.bibleVersionID),
        String(input.bibleChapterID)
      );
    }

    const record = {
      ...(existing || {}),
      userId: verifiedUserId,
      deviceId: getDeviceId(),
      pageKey: existing?.pageKey || pageKey,
      bibleVersionID: String(input.bibleVersionID || existing?.bibleVersionID || ""),
      bibleChapterID: String(input.bibleChapterID || existing?.bibleChapterID || ""),
      pageUrl: String(input.pageUrl || existing?.pageUrl || ""),
      bibleName: String(input.bibleName || existing?.bibleName || ""),
      bookChapterLabel: String(input.bookChapterLabel || existing?.bookChapterLabel || ""),
      miniEditorJson: input.miniEditorJson,
      hasHighlights: Boolean(input.hasHighlights),
      hasDrawings: Boolean(input.hasDrawings),
      hasTextFormats: Boolean(input.hasTextFormats),
      serverVersion:
        Number(existing?.serverVersion) ||
        Number(input.serverVersion) ||
        0,
      serverUpdatedAt: existing?.serverUpdatedAt || null,
      localUpdatedAt: now(),
      syncStatus: "pending",
      conflictRemote: null,
      deleted: false
    };

    await db.putMiniEditorPage(record);

    const operation = record.serverVersion > 0 ? "update" : "create";
    const mutation = await putMiniEditorOutboxMutation(
      verifiedUserId,
      record,
      operation
    );

    return {
      userId: verifiedUserId,
      page: record,
      mutationId: mutation.mutationId,
      syncStatus: "pending"
    };
  }

  async function queueMiniEditorDeleteForSync(userId, input = {}) {
    const db = requireUserOfflineDB();
    const verifiedUserId = String(userId || "");
    const requestedPageKey = String(input.pageKey || "");

    if (!verifiedUserId || !requestedPageKey) {
      throw new Error("A verified userId and pageKey are required to queue an annotation delete.");
    }

    await requirePreviouslyVerifiedLocalUser(verifiedUserId);

    let existing = await db.getMiniEditorPage(
      verifiedUserId,
      requestedPageKey
    );

    if (
      !existing &&
      input.bibleVersionID &&
      input.bibleChapterID
    ) {
      existing = await db.getMiniEditorPageByBibleChapter(
        verifiedUserId,
        String(input.bibleVersionID),
        String(input.bibleChapterID)
      );
    }

    const entityKey = existing?.pageKey || requestedPageKey;
    const serverVersion =
      Number(existing?.serverVersion) ||
      Number(input.serverVersion) ||
      0;

    if (serverVersion <= 0) {
      await removePendingMutationsForEntity(
        verifiedUserId,
        ENTITY_MINI_EDITOR_PAGE,
        entityKey
      );

      await db.deleteMiniEditorPage(verifiedUserId, entityKey);

      return {
        userId: verifiedUserId,
        page: null,
        mutationId: "",
        syncStatus: "clean",
        queued: false
      };
    }

    const tombstone = {
      ...(existing || {}),
      userId: verifiedUserId,
      deviceId: getDeviceId(),
      pageKey: entityKey,
      bibleVersionID: String(input.bibleVersionID || existing?.bibleVersionID || ""),
      bibleChapterID: String(input.bibleChapterID || existing?.bibleChapterID || ""),
      pageUrl: String(input.pageUrl || existing?.pageUrl || ""),
      bibleName: String(input.bibleName || existing?.bibleName || ""),
      bookChapterLabel: String(input.bookChapterLabel || existing?.bookChapterLabel || ""),
      miniEditorJson: null,
      hasHighlights: false,
      hasDrawings: false,
      hasTextFormats: false,
      serverVersion,
      serverUpdatedAt: existing?.serverUpdatedAt || null,
      localUpdatedAt: now(),
      syncStatus: "pending",
      conflictRemote: null,
      deleted: true
    };

    await db.putMiniEditorPage(tombstone);

    const mutation = await putMiniEditorOutboxMutation(
      verifiedUserId,
      tombstone,
      "delete"
    );

    return {
      userId: verifiedUserId,
      page: null,
      mutationId: mutation.mutationId,
      syncStatus: "pending",
      queued: true
    };
  }

  async function listPendingOutboxForUser(userId) {
    const db = requireUserOfflineDB();
    const verifiedUserId = String(userId || "");

    if (!verifiedUserId) {
      return [];
    }

    return db.listOutbox(verifiedUserId, ["pending"]);
  }


  async function saveStudyDraft(input = {}) {
    const db = requireUserOfflineDB();
    const userId = getLiveAuthenticatedUserId();

    if (!userId) {
      throw new Error("A live authenticated user is required to save a Study Desk draft.");
    }

    const draftKey = String(input.draftKey || "");
    if (!draftKey) {
      throw new Error("A Study Desk draftKey is required.");
    }

    await rememberVerifiedAuthenticatedUser(userId);

    const existing = await db.getStudyDraft(userId, draftKey);
    const timestamp = now();

    const record = {
      ...(existing || {}),
      userId,
      deviceId: getDeviceId(),
      draftKey,
      studyId: input.studyId ? String(input.studyId) : "",
      baseVersion:
        input.baseVersion !== null &&
        input.baseVersion !== undefined &&
        Number.isInteger(Number(input.baseVersion))
          ? Number(input.baseVersion)
          : null,
      data: input.data || {},
      createdAt: Number(existing?.createdAt) || timestamp,
      localUpdatedAt: timestamp,
      syncStatus: "local-draft"
    };

    await db.putStudyDraft(record);
    return record;
  }

  async function getStudyDraft(draftKey) {
    const db = requireUserOfflineDB();
    const userId = getLiveAuthenticatedUserId();

    if (!userId || !draftKey) {
      return null;
    }

    return db.getStudyDraft(userId, String(draftKey));
  }

  async function listStudyDrafts() {
    const db = requireUserOfflineDB();
    const userId = getLiveAuthenticatedUserId();

    if (!userId) {
      return [];
    }

    return db.listStudyDrafts(userId);
  }

  async function deleteStudyDraft(draftKey) {
    const db = requireUserOfflineDB();
    const userId = getLiveAuthenticatedUserId();

    if (!userId || !draftKey) {
      return;
    }

    await db.deleteStudyDraft(userId, String(draftKey));
  }

  async function getStoredProfile(userId) {
    if (!userId) {
      return null;
    }

    const db = requireUserOfflineDB();
    return db.getProfile(String(userId));
  }

  async function getLastVerifiedUserId() {
    const db = requireUserOfflineDB();
    const record = await db.getMeta(LAST_VERIFIED_USER_META_KEY);

    return String(record?.value || "");
  }

  async function getIdentitySnapshot() {
    const liveUserId = getLiveAuthenticatedUserId();
    const lastVerifiedUserId = await getLastVerifiedUserId();
    const profile = liveUserId
      ? await getStoredProfile(liveUserId)
      : null;

    return {
      deviceId: getDeviceId(),
      liveUserId,
      lastVerifiedUserId,
      profile
    };
  }

  return Object.freeze({
    ENTITY_QUILL_NOTE,
    ENTITY_MINI_EDITOR_PAGE,
    DEVICE_ID_STORAGE_KEY,
    LAST_VERIFIED_USER_META_KEY,
    getDeviceId,
    getLiveAuthenticatedUserId,
    rememberVerifiedAuthenticatedUser,
    rememberCurrentAuthenticatedUser,
    cacheQuillNoteFromServer,
    deleteCachedQuillNote,
    getCachedQuillNote,
    cacheMiniEditorPageFromServer,
    deleteCachedMiniEditorPage,
    getCachedMiniEditorPage,
    queueQuillNoteForSync,
    queueQuillDeleteForSync,
    queueMiniEditorPageForSync,
    queueMiniEditorDeleteForSync,
    listPendingOutboxForUser,
    saveStudyDraft,
    getStudyDraft,
    listStudyDrafts,
    deleteStudyDraft,
    getStoredProfile,
    getLastVerifiedUserId,
    getIdentitySnapshot
  });
})();
