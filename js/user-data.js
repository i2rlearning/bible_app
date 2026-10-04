"use strict";

/*
 * Project file: js/user-data.js
 *
 * Purpose:
 * Provides the Phase 4 user/device identity layer and the first local mirror for
 * authenticated My Notes (Quill) data from the Scripture page.
 *
 * What this file does:
 * - Creates one persistent deviceId for this browser/device installation.
 * - Reads the currently authenticated Clerk user from the live Clerk session.
 * - Accepts a user ID verified by the protected /api/me endpoint.
 * - Stores a local profile keyed strictly by Clerk userId in UserOfflineDB.
 * - Records which Clerk user was most recently verified online on this device.
 * - Mirrors successful server Quill-note loads/saves into UserOfflineDB.
 * - Removes the local Quill mirror only after an explicit successful server delete.
 * - Preserves any older pending/conflict local record instead of overwriting it.
 *
 * Important security rule:
 * - deviceId is NOT authentication.
 * - A userId stored in IndexedDB is NOT authentication.
 * - A live Clerk session or a successful protected /api/me response is required
 *   before this step writes private user data into the local mirror.
 * - Offline trust and offline private-data access are intentionally NOT enabled
 *   in this step. The local mirror is not yet used as an offline source of truth.
 *
 * Dependencies:
 * - js/user-offline-db.js must be loaded before this file is used.
 */

window.UserData = (() => {
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
    DEVICE_ID_STORAGE_KEY,
    LAST_VERIFIED_USER_META_KEY,
    getDeviceId,
    getLiveAuthenticatedUserId,
    rememberVerifiedAuthenticatedUser,
    rememberCurrentAuthenticatedUser,
    cacheQuillNoteFromServer,
    deleteCachedQuillNote,
    getCachedQuillNote,
    getStoredProfile,
    getLastVerifiedUserId,
    getIdentitySnapshot
  });
})();
