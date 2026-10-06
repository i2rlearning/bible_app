"use strict";

/*
 * Project file: js/user-data.js
 *
 * Purpose:
 * Provides the local user/device data layer for authenticated personal content.
 *
 * What this file does:
 * - Creates one persistent deviceId for this browser/device installation.
 * - Records a Clerk user only after the user is verified by Clerk or /api/me.
 * - Keeps personal records isolated by Clerk userId in UserOfflineDB.
 * - Mirrors successful My Notes and mini-editor server data into IndexedDB.
 * - Saves Study Desk drafts locally before an explicit server save.
 * - Queues My Notes and mini-editor changes when an already-authenticated page
 *   loses connectivity.
 * - Retries queued changes through an idempotent mutation endpoint when authenticated connectivity returns.
 * - Uses server version checks so stale local work cannot silently overwrite a
 *   newer server copy.
 * - Records an explicit logout request locally when remote sign-out cannot be
 *   completed immediately.
 * - Prevents a pending logout from re-trusting an old Clerk session or sending
 *   queued private changes until remote sign-out succeeds.
 *
 * Security rules:
 * - deviceId is not authentication.
 * - A userId stored in IndexedDB is not authentication.
 * - A live Clerk session or a successful protected /api/me response is required
 *   before private data is treated as authenticated.
 * - An explicit logout request takes priority over a restored Clerk session.
 *
 * Dependencies:
 * - js/user-offline-db.js must be loaded before this file is used.
 */

window.UserData = (() => {
  const ENTITY_QUILL_NOTE = "quill_note";
  const ENTITY_MINI_EDITOR_PAGE = "mini_editor_page";
  const ENTITY_STUDY = "study";
  const DEVICE_ID_STORAGE_KEY = "BibleAppDeviceId";
  const LAST_VERIFIED_USER_META_KEY = "phase4LastVerifiedUserId";
  const PENDING_REMOTE_LOGOUT_META_KEY = "pendingRemoteLogoutUserId";
  const SYNC_CURSOR_META_PREFIX = "syncCursor";

  let flushPromise = null;
  let flushTimer = null;
  let catchUpPromise = null;
  let catchUpTimer = null;

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

  function cloneLocalValue(value) {
    if (typeof window.structuredClone === "function") {
      return window.structuredClone(value);
    }

    return JSON.parse(JSON.stringify(value));
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

    const existing = await db.getProfile(verifiedUserId);

    if (existing?.pendingRemoteLogout === true) {
      const lastVerified = await db.getMeta(
        LAST_VERIFIED_USER_META_KEY
      );

      if (String(lastVerified?.value || "") === verifiedUserId) {
        await db.setMeta(LAST_VERIFIED_USER_META_KEY, "");
      }

      return null;
    }

    const deviceId = getDeviceId();
    const timestamp = now();

    const profile = {
      ...(existing || {}),
      userId: verifiedUserId,
      deviceId,
      createdAt: Number(existing?.createdAt) || timestamp,
      lastVerifiedAt: timestamp,
      pendingRemoteLogout: false,
      logoutRequestedAt: null,
      updatedAt: timestamp
    };

    await db.putProfile(profile);
    await db.setMeta(
      LAST_VERIFIED_USER_META_KEY,
      verifiedUserId
    );

    return profile;
  }

  async function rememberCurrentAuthenticatedUser() {
    const userId = getLiveAuthenticatedUserId();

    if (!userId) {
      return null;
    }

    return rememberVerifiedAuthenticatedUser(userId);
  }

  function wait(delayMs) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, Math.max(0, Number(delayMs) || 0));
    });
  }

  async function serverConfirmsAuthenticatedUser(expectedUserId) {
    const normalizedUserId = String(expectedUserId || "");

    if (!normalizedUserId || !canTryServer()) {
      return false;
    }

    try {
      /*
       * Browser connectivity can recover slightly before Clerk's server-side
       * session is ready again. Confirm the protected API session before
       * sending queued private mutations so they are never mistaken for an
       * unauthenticated navigation request.
       */
      const statusResponse = await fetch("/api/auth-status", {
        method: "GET",
        credentials: "include",
        cache: "no-store"
      });

      if (!statusResponse.ok) {
        return false;
      }

      const status = await readJsonSafely(statusResponse);

      if (status?.signedIn !== true) {
        return false;
      }

      const meResponse = await fetch("/api/me", {
        method: "GET",
        credentials: "include",
        cache: "no-store"
      });

      if (!meResponse.ok || meResponse.redirected) {
        return false;
      }

      const me = await readJsonSafely(meResponse);

      return (
        String(me?.user?.id || "") === normalizedUserId
      );
    } catch (_error) {
      return false;
    }
  }

  async function waitForServerAuthenticatedUser(expectedUserId) {
    const retryDelays = [0, 300, 600, 900, 1200, 1600];

    for (const delayMs of retryDelays) {
      if (delayMs > 0) {
        await wait(delayMs);
      }

      if (!canTryServer()) {
        return false;
      }

      if (
        await serverConfirmsAuthenticatedUser(
          expectedUserId
        )
      ) {
        return true;
      }
    }

    return false;
  }


  async function markLogoutPending(userId = "") {
    const db = requireUserOfflineDB();
    const requestedUserId = String(
      userId ||
      getLiveAuthenticatedUserId() ||
      await getLastVerifiedUserId() ||
      ""
    );

    if (!requestedUserId) {
      return null;
    }

    const existing = await db.getProfile(requestedUserId);
    const timestamp = now();

    const profile = {
      ...(existing || {}),
      userId: requestedUserId,
      deviceId: existing?.deviceId || getDeviceId(),
      createdAt: Number(existing?.createdAt) || timestamp,
      pendingRemoteLogout: true,
      logoutRequestedAt: timestamp,
      updatedAt: timestamp
    };

    await db.putProfile(profile);
    await db.setMeta(
      PENDING_REMOTE_LOGOUT_META_KEY,
      requestedUserId
    );

    const lastVerified = await db.getMeta(
      LAST_VERIFIED_USER_META_KEY
    );

    if (
      String(lastVerified?.value || "") ===
      requestedUserId
    ) {
      await db.setMeta(
        LAST_VERIFIED_USER_META_KEY,
        ""
      );
    }

    return profile;
  }

  async function getPendingRemoteLogoutUserId() {
    const db = requireUserOfflineDB();
    const record = await db.getMeta(
      PENDING_REMOTE_LOGOUT_META_KEY
    );

    return String(record?.value || "");
  }

  async function hasPendingRemoteLogout(userId = "") {
    const db = requireUserOfflineDB();
    const requestedUserId = String(
      userId ||
      await getPendingRemoteLogoutUserId() ||
      ""
    );

    if (!requestedUserId) {
      return false;
    }

    const profile = await db.getProfile(
      requestedUserId
    );

    return profile?.pendingRemoteLogout === true;
  }

  async function clearPendingRemoteLogout(userId = "") {
    const db = requireUserOfflineDB();
    const requestedUserId = String(
      userId ||
      await getPendingRemoteLogoutUserId() ||
      ""
    );

    if (!requestedUserId) {
      return;
    }

    const existing = await db.getProfile(
      requestedUserId
    );

    if (existing) {
      await db.putProfile({
        ...existing,
        pendingRemoteLogout: false,
        logoutRequestedAt: null,
        updatedAt: now()
      });
    }

    const pending = await db.getMeta(
      PENDING_REMOTE_LOGOUT_META_KEY
    );

    if (
      String(pending?.value || "") ===
      requestedUserId
    ) {
      await db.setMeta(
        PENDING_REMOTE_LOGOUT_META_KEY,
        ""
      );
    }
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

    // An older unsynchronized local record may still exist because browser
    // storage is intentionally preserved during code rollbacks and updates.
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


  async function cacheStudyFromServer(userId, serverStudy) {
    const db = requireUserOfflineDB();
    const verifiedUserId = String(userId || "");
    const studyId = String(serverStudy?.id || "");

    if (!verifiedUserId) {
      throw new Error(
        "Cannot cache a Study without a verified userId."
      );
    }

    if (!studyId) {
      return null;
    }

    const existing =
      await db.getStudy(
        verifiedUserId,
        studyId
      );

    const protectedLocalStatuses = new Set([
      "pending",
      "sending",
      "conflict"
    ]);

    /*
     * Once Study editing becomes local-first, an online refresh must never
     * destroy a local Study that has not finished synchronizing.
     */
    if (
      existing &&
      protectedLocalStatuses.has(
        existing.syncStatus
      )
    ) {
      return existing;
    }

    const normalizedStudy =
      cloneLocalValue(serverStudy);

    const version =
      Number(normalizedStudy.version) || 0;

    const record = {
      ...(existing || {}),
      userId: verifiedUserId,
      deviceId: getDeviceId(),
      studyId,
      study: cloneLocalValue(
        normalizedStudy
      ),
      baseStudy: cloneLocalValue(
        normalizedStudy
      ),
      baseVersion: version,
      serverVersion: version,
      serverUpdatedAt:
        normalizedStudy.updatedAt ||
        null,
      localUpdatedAt: now(),
      syncStatus: "clean",
      conflictRemote: null,
      deleted: false
    };

    await db.putStudy(record);
    return record;
  }

  async function cacheStudiesFromServer(
    userId,
    serverStudies
  ) {
    const studies =
      Array.isArray(serverStudies)
        ? serverStudies
        : [];

    const cached = [];

    for (const study of studies) {
      const record =
        await cacheStudyFromServer(
          userId,
          study
        );

      if (record) {
        cached.push(record);
      }
    }

    return cached;
  }

  async function getCachedStudy(
    userId,
    studyId
  ) {
    const db = requireUserOfflineDB();
    const verifiedUserId =
      String(userId || "");
    const verifiedStudyId =
      String(studyId || "");

    if (
      !verifiedUserId ||
      !verifiedStudyId
    ) {
      return null;
    }

    return db.getStudy(
      verifiedUserId,
      verifiedStudyId
    );
  }

  async function listCachedStudies(
    userId
  ) {
    const db = requireUserOfflineDB();
    const verifiedUserId =
      String(userId || "");

    if (!verifiedUserId) {
      return [];
    }

    return db.listStudies(
      verifiedUserId
    );
  }

  async function refreshStudyCacheFromServer() {
    const userId =
      getLiveAuthenticatedUserId();

    if (!userId) {
      throw new Error(
        "A live authenticated user is required to refresh Studies."
      );
    }

    if (!canTryServer()) {
      return {
        ok: false,
        reason: "offline",
        count: 0
      };
    }

    const serverUserConfirmed =
      await waitForServerAuthenticatedUser(
        userId
      );

    if (!serverUserConfirmed) {
      return {
        ok: false,
        reason: "auth_not_ready",
        count: 0
      };
    }

    const response = await fetch(
      "/api/studies",
      {
        method: "GET",
        credentials: "include",
        cache: "no-store"
      }
    );

    if (response.redirected) {
      return {
        ok: false,
        reason: "auth_not_ready",
        count: 0
      };
    }

    const body =
      await readJsonSafely(response);

    if (!response.ok) {
      throw new Error(
        body?.message ||
        "Failed to load Studies."
      );
    }

    const studies =
      Array.isArray(body?.studies)
        ? body.studies
        : [];

    const cached =
      await cacheStudiesFromServer(
        userId,
        studies
      );

    return {
      ok: true,
      count: cached.length,
      studies: cached
    };
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


  function getConnectivityState() {
    return window.AppShell?.getState?.() || {
      browserOnline: navigator.onLine !== false,
      appReachable: null,
      connectionIssue: navigator.onLine === false
    };
  }

  function canTryServer() {
    const state = getConnectivityState();

    return (
      navigator.onLine !== false &&
      state.browserOnline !== false &&
      state.appReachable !== false &&
      state.connectionIssue !== true
    );
  }

  async function readJsonSafely(response) {
    try {
      return await response.json();
    } catch (_error) {
      return {};
    }
  }

  function dispatchUserDataEvent(type, detail = {}) {
    window.dispatchEvent(
      new CustomEvent(type, { detail })
    );
  }

  async function markMutationPending(mutation, error) {
    const db = requireUserOfflineDB();

    await db.putOutboxMutation({
      ...mutation,
      status: "pending",
      updatedAt: now(),
      attemptCount: Number(mutation.attemptCount) || 0,
      lastError: String(
        error?.message ||
        error ||
        "Synchronization failed"
      )
    });
  }

  async function markConflict(mutation, result) {
    const db = requireUserOfflineDB();
    const latest =
      mutation.entityType === ENTITY_QUILL_NOTE
        ? (result?.latestNote || null)
        : (result?.latestPage || null);

    await db.putOutboxMutation({
      ...mutation,
      status: "conflict",
      updatedAt: now(),
      lastError: String(
        result?.message ||
        "A newer server version exists."
      )
    });

    if (mutation.entityType === ENTITY_QUILL_NOTE) {
      const current = await db.getQuillNote(
        mutation.userId,
        mutation.entityKey
      );

      if (current) {
        await db.putQuillNote({
          ...current,
          syncStatus: "conflict",
          conflictRemote: latest,
          localUpdatedAt: now()
        });
      }
    } else if (
      mutation.entityType === ENTITY_MINI_EDITOR_PAGE
    ) {
      const current = await db.getMiniEditorPage(
        mutation.userId,
        mutation.entityKey
      );

      if (current) {
        await db.putMiniEditorPage({
          ...current,
          syncStatus: "conflict",
          conflictRemote: latest,
          localUpdatedAt: now()
        });
      }
    }

    dispatchUserDataEvent("user-data-conflict", {
      userId: mutation.userId,
      entityType: mutation.entityType,
      entityKey: mutation.entityKey,
      latestNote:
        mutation.entityType === ENTITY_QUILL_NOTE
          ? latest
          : null,
      latestPage:
        mutation.entityType === ENTITY_MINI_EDITOR_PAGE
          ? latest
          : null
    });
  }

  async function applyQuillSyncSuccess(mutation, result) {
    const db = requireUserOfflineDB();

    if (mutation.operation === "delete") {
      await db.deleteQuillNote(
        mutation.userId,
        mutation.entityKey
      );
      await db.deleteOutboxMutation(mutation.mutationId);

      dispatchUserDataEvent("user-data-synced", {
        userId: mutation.userId,
        entityType: ENTITY_QUILL_NOTE,
        entityKey: mutation.entityKey,
        deleted: true,
        version: null
      });

      return;
    }

    const serverNote = result?.note || null;
    const mapped = mapServerQuillNote(
      serverNote,
      mutation.payload || {}
    );

    if (!mapped?.pageKey) {
      throw new Error(
        "The server did not return the synchronized My Notes record."
      );
    }

    const current = await db.getQuillNote(
      mutation.userId,
      mutation.entityKey
    );

    await db.putQuillNote({
      ...(current || {}),
      userId: mutation.userId,
      deviceId: getDeviceId(),
      pageKey: mapped.pageKey,
      bibleVersionID: mapped.bibleVersionID,
      bibleChapterID: mapped.bibleChapterID,
      pageUrl: mapped.pageUrl,
      bibleName:
        current?.bibleName ||
        mutation.payload?.bibleName ||
        mapped.bibleName ||
        "",
      bookChapterLabel:
        current?.bookChapterLabel ||
        mutation.payload?.bookChapterLabel ||
        mapped.bookChapterLabel ||
        "",
      quillDelta: mapped.quillDelta,
      plainText: mapped.plainText,
      serverVersion: mapped.serverVersion,
      serverUpdatedAt: mapped.serverUpdatedAt,
      localUpdatedAt: now(),
      syncStatus: "clean",
      conflictRemote: null,
      deleted: false
    });

    await db.deleteOutboxMutation(mutation.mutationId);

    dispatchUserDataEvent("user-data-synced", {
      userId: mutation.userId,
      entityType: ENTITY_QUILL_NOTE,
      entityKey: mapped.pageKey,
      version: mapped.serverVersion,
      note: serverNote
    });
  }

  async function applyMiniEditorSyncSuccess(
    mutation,
    result
  ) {
    const db = requireUserOfflineDB();

    if (mutation.operation === "delete") {
      await db.deleteMiniEditorPage(
        mutation.userId,
        mutation.entityKey
      );
      await db.deleteOutboxMutation(mutation.mutationId);

      dispatchUserDataEvent("user-data-synced", {
        userId: mutation.userId,
        entityType: ENTITY_MINI_EDITOR_PAGE,
        entityKey: mutation.entityKey,
        deleted: true,
        version: null
      });

      return;
    }

    const serverPage = result?.page || null;
    const mapped = mapServerMiniEditorPage(
      serverPage,
      mutation.payload || {}
    );

    if (!mapped?.pageKey) {
      throw new Error(
        "The server did not return the synchronized mini-editor record."
      );
    }

    const current = await db.getMiniEditorPage(
      mutation.userId,
      mutation.entityKey
    );

    await db.putMiniEditorPage({
      ...(current || {}),
      userId: mutation.userId,
      deviceId: getDeviceId(),
      pageKey: mapped.pageKey,
      bibleVersionID: mapped.bibleVersionID,
      bibleChapterID: mapped.bibleChapterID,
      pageUrl: mapped.pageUrl,
      bibleName:
        mapped.bibleName ||
        current?.bibleName ||
        mutation.payload?.bibleName ||
        "",
      bookChapterLabel:
        mapped.bookChapterLabel ||
        current?.bookChapterLabel ||
        mutation.payload?.bookChapterLabel ||
        "",
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
    });

    await db.deleteOutboxMutation(mutation.mutationId);

    dispatchUserDataEvent("user-data-synced", {
      userId: mutation.userId,
      entityType: ENTITY_MINI_EDITOR_PAGE,
      entityKey: mapped.pageKey,
      version: mapped.serverVersion,
      page: serverPage
    });
  }

  async function sendOutboxMutation(mutation) {
    if (
      mutation.entityType !== ENTITY_QUILL_NOTE &&
      mutation.entityType !== ENTITY_MINI_EDITOR_PAGE
    ) {
      throw new Error(
        `Unsupported outbox entity type: ${mutation.entityType}`
      );
    }

    const response = await fetch("/api/sync/mutations", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        deviceId: getDeviceId(),
        mutations: [
          {
            mutationId: mutation.mutationId,
            entityType: mutation.entityType,
            entityKey: mutation.entityKey,
            operation: mutation.operation,
            baseVersion:
              Number(mutation.baseVersion) || 0,
            payload:
              mutation.operation === "delete"
                ? null
                : (mutation.payload || null)
          }
        ]
      })
    });

    if (response.redirected) {
      return {
        response: { status: 401, ok: false },
        result: {
          code: "SYNC_AUTH_NOT_READY",
          message:
            "The authenticated server session is not ready yet."
        }
      };
    }

    const envelope = await readJsonSafely(response);

    if (!response.ok) {
      return { response, result: envelope };
    }

    const syncResult = Array.isArray(envelope?.results)
      ? envelope.results[0]
      : null;

    if (!syncResult) {
      return {
        response: { status: 502, ok: false },
        result: {
          code: "SYNC_RESULT_MISSING",
          message:
            "The synchronization response did not include a mutation result."
        }
      };
    }

    if (syncResult.status === "conflict") {
      return {
        response: { status: 409, ok: false },
        result: syncResult
      };
    }

    if (syncResult.status === "error") {
      return {
        response: { status: 400, ok: false },
        result: syncResult
      };
    }

    if (syncResult.status !== "ok") {
      return {
        response: { status: 502, ok: false },
        result: {
          code: "SYNC_RESULT_INVALID",
          message:
            "The synchronization response returned an unknown mutation status."
        }
      };
    }

    return {
      response: { status: 200, ok: true },
      result: syncResult.result || {}
    };
  }

  async function flushOutbox() {
    if (flushPromise) {
      return flushPromise;
    }

    flushPromise = (async () => {
      const db = requireUserOfflineDB();
      const liveUserId = getLiveAuthenticatedUserId();

      if (
        liveUserId &&
        await hasPendingRemoteLogout(liveUserId)
      ) {
        return {
          attempted: 0,
          synced: 0,
          conflicts: 0,
          pending: (
            await db.listOutbox(
              liveUserId,
              ["pending", "sending"]
            )
          ).length
        };
      }

      if (!liveUserId || !canTryServer()) {
        return {
          attempted: 0,
          synced: 0,
          conflicts: 0,
          pending: liveUserId
            ? (await db.listOutbox(
                liveUserId,
                ["pending", "sending"]
              )).length
            : 0
        };
      }

      const serverUserConfirmed =
        await waitForServerAuthenticatedUser(liveUserId);

      if (!serverUserConfirmed) {
        return {
          attempted: 0,
          synced: 0,
          conflicts: 0,
          pending: (
            await db.listOutbox(
              liveUserId,
              ["pending", "sending"]
            )
          ).length
        };
      }

      await rememberVerifiedAuthenticatedUser(liveUserId);
      await db.resetSendingMutations(liveUserId);

      const pending = await db.listOutbox(
        liveUserId,
        ["pending"]
      );

      let synced = 0;
      let conflicts = 0;

      for (const originalMutation of pending) {
        if (!canTryServer()) {
          break;
        }

        const mutation = {
          ...originalMutation,
          status: "sending",
          attemptCount:
            (Number(originalMutation.attemptCount) || 0) + 1,
          updatedAt: now(),
          lastError: ""
        };

        await db.putOutboxMutation(mutation);

        try {
          const { response, result } =
            await sendOutboxMutation(mutation);

          if (response.status === 409) {
            await markConflict(mutation, result);
            conflicts += 1;
            continue;
          }

          if (!response.ok) {
            throw new Error(
              result?.message ||
              `Synchronization failed with HTTP ${response.status}.`
            );
          }

          if (mutation.entityType === ENTITY_QUILL_NOTE) {
            await applyQuillSyncSuccess(
              mutation,
              result
            );
          } else {
            await applyMiniEditorSyncSuccess(
              mutation,
              result
            );
          }

          synced += 1;
        } catch (error) {
          await markMutationPending(mutation, error);

          if (!canTryServer()) {
            break;
          }
        }
      }

      const remaining = await db.listOutbox(
        liveUserId,
        ["pending", "sending"]
      );

      return {
        attempted: pending.length,
        synced,
        conflicts,
        pending: remaining.length
      };
    })();

    try {
      return await flushPromise;
    } finally {
      flushPromise = null;
    }
  }

  function scheduleFlush(delayMs = 250) {
    if (flushTimer) {
      clearTimeout(flushTimer);
    }

    flushTimer = setTimeout(() => {
      flushTimer = null;

      flushOutbox().catch((error) => {
        console.warn(
          "Could not synchronize pending offline changes:",
          error
        );
      });
    }, Math.max(0, Number(delayMs) || 0));
  }

  async function runAutomaticCatchUp() {
    if (catchUpPromise) {
      return catchUpPromise;
    }

    if (
      !getLiveAuthenticatedUserId() ||
      !canTryServer()
    ) {
      return null;
    }

    catchUpPromise = (async () => {
      try {
        return await catchUpSyncChanges();
      } catch (error) {
        console.warn(
          "Could not catch up synchronized changes:",
          error
        );
        return null;
      }
    })();

    try {
      return await catchUpPromise;
    } finally {
      catchUpPromise = null;
    }
  }

  function scheduleCatchUp(delayMs = 700) {
    if (catchUpTimer) {
      clearTimeout(catchUpTimer);
    }

    catchUpTimer = setTimeout(() => {
      catchUpTimer = null;
      runAutomaticCatchUp();
    }, Math.max(0, Number(delayMs) || 0));
  }

  window.addEventListener("online", () => {
    scheduleFlush(250);
    scheduleCatchUp(900);
  });

  window.addEventListener(
    "app-connectivity-changed",
    (event) => {
      const state = event.detail || {};

      if (
        state.browserOnline !== false &&
        state.appReachable === true &&
        state.connectionIssue !== true
      ) {
        scheduleFlush(250);
        scheduleCatchUp(650);
      }
    }
  );

  window.addEventListener(
    "auth-state-changed",
    (event) => {
      if (event.detail?.signedIn) {
        scheduleFlush(350);
        scheduleCatchUp(700);
      }
    }
  );

  window.addEventListener(
    "load",
    () => {
      scheduleFlush(800);
      scheduleCatchUp(1200);
    },
    { once: true }
  );


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

  function getSyncCursorMetaKey(userId) {
    return `${SYNC_CURSOR_META_PREFIX}:${String(userId || "")}:${getDeviceId()}`;
  }

  function normalizeSyncCursor(value) {
    const cursor = String(
      value === null || value === undefined
        ? "0"
        : value
    ).trim();

    if (!/^\d+$/.test(cursor)) {
      throw new Error(
        "syncCursor must be a non-negative change sequence."
      );
    }

    return cursor;
  }

  async function getSyncCursor() {
    const db = requireUserOfflineDB();
    const userId = getLiveAuthenticatedUserId();

    if (!userId) {
      return "0";
    }

    const record = await db.getMeta(
      getSyncCursorMetaKey(userId)
    );

    if (
      record?.value === null ||
      record?.value === undefined ||
      record?.value === ""
    ) {
      return "0";
    }

    try {
      return normalizeSyncCursor(record.value);
    } catch (_error) {
      return "0";
    }
  }

  async function setSyncCursor(nextSequence) {
    const db = requireUserOfflineDB();
    const userId = getLiveAuthenticatedUserId();

    if (!userId) {
      throw new Error(
        "A live authenticated user is required to update syncCursor."
      );
    }

    const nextCursor =
      normalizeSyncCursor(nextSequence);
    const currentCursor =
      await getSyncCursor();

    /*
     * A device cursor is monotonic. Rewinding it can cause already-processed
     * remote changes to be replayed and can obscure synchronization bugs.
     */
    if (
      BigInt(nextCursor) <
      BigInt(currentCursor)
    ) {
      throw new Error(
        `syncCursor cannot move backward from ${currentCursor} to ${nextCursor}.`
      );
    }

    await db.setMeta(
      getSyncCursorMetaKey(userId),
      nextCursor
    );

    return nextCursor;
  }

  async function hasUnsyncedLocalEntityWork(
    userId,
    entityType,
    entityKey
  ) {
    const db = requireUserOfflineDB();
    const outboxItems =
      await db.listOutboxForEntity(
        userId,
        entityType,
        entityKey
      );

    if (
      outboxItems.some((item) =>
        ["pending", "sending", "conflict"].includes(
          item.status
        )
      )
    ) {
      return true;
    }

    const local =
      entityType === ENTITY_QUILL_NOTE
        ? await db.getQuillNote(userId, entityKey)
        : await db.getMiniEditorPage(
            userId,
            entityKey
          );

    return Boolean(
      local &&
      ["pending", "sending", "conflict"].includes(
        local.syncStatus
      )
    );
  }

  async function fetchCurrentSyncEntity(
    entityType,
    entityKey
  ) {
    const route =
      entityType === ENTITY_QUILL_NOTE
        ? "/api/quill-notes"
        : "/api/mini-editor-page";

    const params = new URLSearchParams({
      pageKey: entityKey
    });

    const response = await fetch(
      `${route}?${params.toString()}`,
      {
        method: "GET",
        credentials: "include",
        cache: "no-store"
      }
    );

    if (response.redirected) {
      throw new Error(
        "The authenticated server session is not ready."
      );
    }

    const body = await readJsonSafely(response);

    if (!response.ok) {
      throw new Error(
        body?.message ||
        `Could not load synchronized entity (${response.status}).`
      );
    }

    return entityType === ENTITY_QUILL_NOTE
      ? (body?.note || null)
      : (body?.page || null);
  }

  async function applyRemoteSyncEntity(
    userId,
    change
  ) {
    const db = requireUserOfflineDB();
    const entityType = String(
      change?.entityType || ""
    );
    const entityKey = String(
      change?.entityKey || ""
    );

    if (
      ![
        ENTITY_QUILL_NOTE,
        ENTITY_MINI_EDITOR_PAGE
      ].includes(entityType)
    ) {
      return {
        applied: false,
        blocked: true,
        reason: "unsupported_entity"
      };
    }

    if (
      await hasUnsyncedLocalEntityWork(
        userId,
        entityType,
        entityKey
      )
    ) {
      return {
        applied: false,
        blocked: true,
        reason: "local_unsynced_work"
      };
    }

    if (change?.operation === "delete") {
      if (entityType === ENTITY_QUILL_NOTE) {
        await db.deleteQuillNote(
          userId,
          entityKey
        );
      } else {
        await db.deleteMiniEditorPage(
          userId,
          entityKey
        );
      }

      dispatchUserDataEvent(
        "user-data-remote-change",
        {
          userId,
          entityType,
          entityKey,
          operation: "delete",
          deleted: true,
          version: null,
          changeSequence:
            String(
              change?.changeSequence || ""
            )
        }
      );

      return {
        applied: true,
        deleted: true
      };
    }

    const serverEntity =
      await fetchCurrentSyncEntity(
        entityType,
        entityKey
      );

    /*
     * A later delete may already have removed an entity even when this page of
     * history contains an earlier create/update row. The current server state
     * is authoritative for catch-up, so absence is applied as a delete.
     */
    if (!serverEntity) {
      if (
        await hasUnsyncedLocalEntityWork(
          userId,
          entityType,
          entityKey
        )
      ) {
        return {
          applied: false,
          blocked: true,
          reason: "local_unsynced_work"
        };
      }

      if (entityType === ENTITY_QUILL_NOTE) {
        await db.deleteQuillNote(
          userId,
          entityKey
        );
      } else {
        await db.deleteMiniEditorPage(
          userId,
          entityKey
        );
      }

      dispatchUserDataEvent(
        "user-data-remote-change",
        {
          userId,
          entityType,
          entityKey,
          operation: "delete",
          deleted: true,
          version: null,
          changeSequence:
            String(
              change?.changeSequence || ""
            )
        }
      );

      return {
        applied: true,
        deleted: true
      };
    }

    let cached;

    if (entityType === ENTITY_QUILL_NOTE) {
      const existing =
        await db.getQuillNote(
          userId,
          entityKey
        );

      cached =
        await cacheQuillNoteFromServer(
          userId,
          serverEntity,
          existing || { pageKey: entityKey }
        );
    } else {
      const existing =
        await db.getMiniEditorPage(
          userId,
          entityKey
        );

      cached =
        await cacheMiniEditorPageFromServer(
          userId,
          serverEntity,
          existing || { pageKey: entityKey }
        );
    }

    dispatchUserDataEvent(
      "user-data-remote-change",
      {
        userId,
        entityType,
        entityKey,
        operation:
          String(change?.operation || "update"),
        deleted: false,
        version:
          Number(cached?.serverVersion) || 0,
        changeSequence:
          String(
            change?.changeSequence || ""
          )
      }
    );

    return {
      applied: true,
      deleted: false,
      version:
        Number(cached?.serverVersion) || 0
    };
  }

  async function fetchSyncChangePage(
    after,
    limit
  ) {
    const params = new URLSearchParams({
      after: normalizeSyncCursor(after),
      limit: String(limit)
    });

    const response = await fetch(
      `/api/sync/changes?${params.toString()}`,
      {
        method: "GET",
        credentials: "include",
        cache: "no-store"
      }
    );

    if (response.redirected) {
      throw new Error(
        "The authenticated server session is not ready."
      );
    }

    const body = await readJsonSafely(response);

    if (!response.ok || body?.ok !== true) {
      throw new Error(
        body?.message ||
        `Could not load synchronization changes (${response.status}).`
      );
    }

    return body;
  }

  async function catchUpSyncChanges(
    options = {}
  ) {
    const userId =
      getLiveAuthenticatedUserId();

    if (!userId) {
      throw new Error(
        "A live authenticated user is required for synchronization catch-up."
      );
    }

    if (!canTryServer()) {
      return {
        ok: false,
        reason: "offline",
        startCursor: await getSyncCursor(),
        endCursor: await getSyncCursor(),
        changesRead: 0,
        entitiesApplied: 0,
        pages: 0
      };
    }

    const serverUserConfirmed =
      await waitForServerAuthenticatedUser(
        userId
      );

    if (!serverUserConfirmed) {
      return {
        ok: false,
        reason: "auth_not_ready",
        startCursor: await getSyncCursor(),
        endCursor: await getSyncCursor(),
        changesRead: 0,
        entitiesApplied: 0,
        pages: 0
      };
    }

    /*
     * Local mutations always get first opportunity to reach the server. This
     * prevents a remote catch-up from replacing a device's pending local work.
     */
    await flushOutbox();

    const limit = Math.min(
      100,
      Math.max(
        1,
        Number(options.limit) || 100
      )
    );
    const maxPages = Math.min(
      100,
      Math.max(
        1,
        Number(options.maxPages) || 20
      )
    );

    const startCursor =
      await getSyncCursor();
    let cursor = startCursor;
    let latestSequence = startCursor;
    let changesRead = 0;
    let entitiesApplied = 0;
    let pages = 0;

    while (pages < maxPages) {
      const page =
        await fetchSyncChangePage(
          cursor,
          limit
        );

      pages += 1;
      latestSequence =
        normalizeSyncCursor(
          page.latestSequence ?? cursor
        );

      const changes = Array.isArray(
        page.changes
      )
        ? page.changes
        : [];

      changesRead += changes.length;

      if (changes.length === 0) {
        break;
      }

      /*
       * The change log records every accepted mutation, while IndexedDB needs
       * only the current server state. Repeated changes for one entity inside
       * this page are coalesced to the newest row before reading that entity.
       */
      const newestByEntity = new Map();

      for (const change of changes) {
        const entityType = String(
          change?.entityType || ""
        );
        const entityKey = String(
          change?.entityKey || ""
        );

        newestByEntity.set(
          `${entityType}\u0000${entityKey}`,
          change
        );
      }

      for (
        const change of newestByEntity.values()
      ) {
        const result =
          await applyRemoteSyncEntity(
            userId,
            change
          );

        if (!result.applied) {
          return {
            ok: false,
            reason:
              result.reason ||
              "remote_change_blocked",
            startCursor,
            endCursor: cursor,
            latestSequence,
            changesRead,
            entitiesApplied,
            pages,
            blockedChange: {
              changeSequence:
                String(
                  change?.changeSequence ||
                  ""
                ),
              entityType:
                String(
                  change?.entityType || ""
                ),
              entityKey:
                String(
                  change?.entityKey || ""
                )
            }
          };
        }

        entitiesApplied += 1;
      }

      const nextCursor =
        normalizeSyncCursor(
          page.nextCursor ?? cursor
        );

      if (
        BigInt(nextCursor) <
        BigInt(cursor)
      ) {
        throw new Error(
          "The server returned a synchronization cursor that moved backward."
        );
      }

      /*
       * Advance only after every entity represented by this page was safely
       * applied. If any apply fails, this page is replayed on the next attempt.
       */
      cursor =
        await setSyncCursor(
          nextCursor
        );

      if (!page.hasMore) {
        break;
      }
    }

    return {
      ok: true,
      startCursor,
      endCursor: cursor,
      latestSequence,
      changesRead,
      entitiesApplied,
      pages,
      caughtUp:
        BigInt(cursor) >=
        BigInt(latestSequence)
    };
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
    const value = String(record?.value || "");

    /*
     * Ignore and remove an invalid metadata value rather than treating arbitrary
     * text as a verified Clerk user ID.
     */
    if (
      value &&
      value === PENDING_REMOTE_LOGOUT_META_KEY
    ) {
      await db.setMeta(
        LAST_VERIFIED_USER_META_KEY,
        ""
      );
      return "";
    }

    return value;
  }

  async function getIdentitySnapshot() {
    const liveUserId = getLiveAuthenticatedUserId();
    const lastVerifiedUserId = await getLastVerifiedUserId();
    const pendingRemoteLogoutUserId =
      await getPendingRemoteLogoutUserId();

    const profileUserId =
      liveUserId ||
      pendingRemoteLogoutUserId ||
      lastVerifiedUserId;

    const profile = profileUserId
      ? await getStoredProfile(profileUserId)
      : null;

    return {
      deviceId: getDeviceId(),
      liveUserId,
      lastVerifiedUserId,
      pendingRemoteLogoutUserId,
      profile
    };
  }

  return Object.freeze({
    ENTITY_QUILL_NOTE,
    ENTITY_MINI_EDITOR_PAGE,
    ENTITY_STUDY,
    DEVICE_ID_STORAGE_KEY,
    LAST_VERIFIED_USER_META_KEY,
    getDeviceId,
    getLiveAuthenticatedUserId,
    rememberVerifiedAuthenticatedUser,
    rememberCurrentAuthenticatedUser,
    markLogoutPending,
    getPendingRemoteLogoutUserId,
    hasPendingRemoteLogout,
    clearPendingRemoteLogout,
    cacheQuillNoteFromServer,
    deleteCachedQuillNote,
    getCachedQuillNote,
    cacheMiniEditorPageFromServer,
    deleteCachedMiniEditorPage,
    getCachedMiniEditorPage,
    cacheStudyFromServer,
    cacheStudiesFromServer,
    refreshStudyCacheFromServer,
    getCachedStudy,
    listCachedStudies,
    queueQuillNoteForSync,
    queueQuillDeleteForSync,
    queueMiniEditorPageForSync,
    queueMiniEditorDeleteForSync,
    listPendingOutboxForUser,
    flushOutbox,
    scheduleFlush,
    saveStudyDraft,
    getStudyDraft,
    listStudyDrafts,
    deleteStudyDraft,
    getSyncCursor,
    setSyncCursor,
    catchUpSyncChanges,
    getStoredProfile,
    getLastVerifiedUserId,
    getIdentitySnapshot
  });
})();
