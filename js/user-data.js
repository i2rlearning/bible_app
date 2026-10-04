"use strict";

/*
 * Project file: js/user-data.js
 *
 * Purpose:
 * Provides the Phase 4 user/device identity foundation for personal data.
 * This file does not yet save Study Desk notes, Quill content, annotations,
 * mini-editor data, or synchronization mutations.
 *
 * What this file does:
 * - Creates one persistent deviceId for this browser/device installation.
 * - Reads the currently authenticated Clerk user from the live Clerk session.
 * - Stores a local profile keyed strictly by Clerk userId in UserOfflineDB.
 * - Records which Clerk user was most recently verified online on this device.
 * - Provides read-only identity helpers that later Phase 4 steps can reuse.
 *
 * Important security rule:
 * - deviceId is NOT authentication.
 * - A userId stored in IndexedDB is NOT authentication.
 * - Only the live Clerk session is treated as proof that a user is signed in.
 * - Offline trust and offline private-data access are intentionally NOT enabled
 *   in this step. Those protections will be added before offline personal data
 *   is allowed to use the stored identity.
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

  async function rememberCurrentAuthenticatedUser() {
    const db = requireUserOfflineDB();
    const userId = getLiveAuthenticatedUserId();

    if (!userId) {
      return null;
    }

    const deviceId = getDeviceId();
    const existing = await db.getProfile(userId);
    const timestamp = now();

    const profile = {
      userId,
      deviceId,
      createdAt: Number(existing?.createdAt) || timestamp,
      lastVerifiedAt: timestamp,
      updatedAt: timestamp
    };

    await db.putProfile(profile);
    await db.setMeta(LAST_VERIFIED_USER_META_KEY, userId);

    return profile;
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
    rememberCurrentAuthenticatedUser,
    getStoredProfile,
    getLastVerifiedUserId,
    getIdentitySnapshot
  });
})();
