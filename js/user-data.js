"use strict";

/*
 * UserData
 *
 * Shared local-first data service for personal user content.
 * Coordinates My Notes and Bible-page annotation saves, device identity,
 * pending mutations, and synchronization with the Railway/Aiven backend.
 */

window.UserData = (() => {
  const ENTITY_QUILL_NOTE = "quill_note";
  const ENTITY_MINI_EDITOR_PAGE = "mini_editor_page";
  const ACTIVE_USER_META_KEY = "activeUserId";
  const DEVICE_ID_STORAGE_KEY = "BibleAppDeviceId";

  let currentUserId = "";
  let flushPromise = null;
  let flushTimer = null;

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

  function getDeviceId() {
    try {
      let deviceId = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);

      if (!deviceId) {
        deviceId = newUuid();
        window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
      }

      return deviceId;
    } catch (_error) {
      if (!window.__BibleAppDeviceId) {
        window.__BibleAppDeviceId = newUuid();
      }
      return window.__BibleAppDeviceId;
    }
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
    return navigator.onLine !== false && state.appReachable !== false;
  }

  async function rememberAuthenticatedUser(userId) {
    if (!userId) return null;

    const normalizedUserId = String(userId);
    const existing =
      await window.UserOfflineDB.getProfile(normalizedUserId);

    /*
     * A pending explicit logout always wins over a restored browser session.
     * Seeing the old Clerk session again must never re-enable trusted local
     * access before the remote logout has actually completed.
     */
    if (existing?.pendingRemoteLogout === true) {
      currentUserId = "";

      const activeMeta =
        await window.UserOfflineDB.getMeta(ACTIVE_USER_META_KEY);

      if (activeMeta?.value === normalizedUserId) {
        await window.UserOfflineDB.setMeta(ACTIVE_USER_META_KEY, "");
      }

      if (existing.offlineAccessAllowed !== false) {
        await window.UserOfflineDB.putProfile({
          ...existing,
          userId: normalizedUserId,
          offlineAccessAllowed: false,
          updatedAt: now()
        });
      }

      return {
        ...existing,
        userId: normalizedUserId,
        offlineAccessAllowed: false
      };
    }

    currentUserId = normalizedUserId;

    const profile = {
      ...(existing || {}),
      userId: currentUserId,
      offlineAccessAllowed: true,
      lastVerifiedAt: now(),
      pendingRemoteLogout: false,
      updatedAt: now()
    };

    await window.UserOfflineDB.putProfile(profile);
    await window.UserOfflineDB.setMeta(ACTIVE_USER_META_KEY, currentUserId);
    await window.UserOfflineDB.resetSendingMutations(currentUserId);

    return profile;
  }

  async function getTrustedOfflineUser() {
    const activeMeta = await window.UserOfflineDB.getMeta(ACTIVE_USER_META_KEY);
    const userId = String(activeMeta?.value || currentUserId || "");

    if (!userId) return null;

    const profile = await window.UserOfflineDB.getProfile(userId);

    if (!profile?.offlineAccessAllowed) {
      return null;
    }

    currentUserId = userId;
    return profile;
  }

  async function getActiveUserId() {
    if (currentUserId) return currentUserId;
    const profile = await getTrustedOfflineUser();
    return profile?.userId || "";
  }

  async function disableOfflineAccess(options = {}) {
    const userId = options.userId || (await getActiveUserId());

    if (!userId) return;

    const existing = await window.UserOfflineDB.getProfile(userId);

    await window.UserOfflineDB.putProfile({
      ...(existing || {}),
      userId,
      offlineAccessAllowed: false,
      pendingRemoteLogout: options.pendingRemoteLogout === true,
      updatedAt: now()
    });

    const activeMeta = await window.UserOfflineDB.getMeta(ACTIVE_USER_META_KEY);
    if (activeMeta?.value === userId) {
      await window.UserOfflineDB.setMeta(ACTIVE_USER_META_KEY, "");
    }

    if (currentUserId === userId) {
      currentUserId = "";
    }
  }

  async function clearPendingRemoteLogout(userId) {
    if (!userId) return;
    const existing = await window.UserOfflineDB.getProfile(userId);
    if (!existing) return;

    await window.UserOfflineDB.putProfile({
      ...existing,
      pendingRemoteLogout: false,
      updatedAt: now()
    });
  }

  async function hasPendingRemoteLogout(userId) {
    if (!userId) return false;
    const profile = await window.UserOfflineDB.getProfile(userId);
    return profile?.pendingRemoteLogout === true;
  }

  function mapServerNote(serverNote) {
    if (!serverNote) return null;

    return {
      pageKey: serverNote.page_key || serverNote.pageKey || "",
      bibleVersionID: serverNote.bible_version_id || serverNote.bibleVersionID || "",
      bibleChapterID: serverNote.bible_chapter_id || serverNote.bibleChapterID || "",
      pageUrl: serverNote.page_url || serverNote.pageUrl || "",
      bibleName: serverNote.bible_name || serverNote.bibleName || "",
      bookChapterLabel: serverNote.book_chapter_label || serverNote.bookChapterLabel || "",
      quillDelta: serverNote.quill_delta_json || serverNote.quillDelta || null,
      plainText: serverNote.quill_plain_text || serverNote.plainText || "",
      serverVersion: Number(serverNote.version) || 0,
      serverUpdatedAt: serverNote.updated_at || serverNote.updatedAt || null
    };
  }

  async function storeCleanServerNote(userId, serverNote, fallbackIdentity = {}) {
    const mapped = mapServerNote(serverNote);

    if (!mapped) {
      return null;
    }

    const pageKey = mapped.pageKey || fallbackIdentity.pageKey;

    const record = {
      userId,
      pageKey,
      bibleVersionID: mapped.bibleVersionID || fallbackIdentity.bibleVersionID || "",
      bibleChapterID: mapped.bibleChapterID || fallbackIdentity.bibleChapterID || "",
      pageUrl: mapped.pageUrl || fallbackIdentity.pageUrl || "",
      bibleName: mapped.bibleName || fallbackIdentity.bibleName || "",
      bookChapterLabel: mapped.bookChapterLabel || fallbackIdentity.bookChapterLabel || "",
      quillDelta: mapped.quillDelta,
      plainText: mapped.plainText,
      serverVersion: mapped.serverVersion,
      serverUpdatedAt: mapped.serverUpdatedAt,
      localUpdatedAt: now(),
      syncStatus: "clean",
      conflictRemote: null,
      deleted: false
    };

    await window.UserOfflineDB.putQuillNote(record);
    return record;
  }

  async function loadQuillNote(identity) {
    const userId = await getActiveUserId();
    if (!userId) {
      return { userId: "", note: null, source: "none" };
    }

    let local = await window.UserOfflineDB.getQuillNote(userId, identity.pageKey);

    if (!local && identity.bibleVersionID && identity.bibleChapterID) {
      local = await window.UserOfflineDB.getQuillNoteByBibleChapter(
        userId,
        identity.bibleVersionID,
        identity.bibleChapterID
      );
    }

    if (local?.syncStatus === "pending" || local?.syncStatus === "conflict") {
      if (canTryServer()) {
        scheduleFlush(0);
      }
      return { userId, note: local.deleted ? null : local, source: "local" };
    }

    if (!canTryServer()) {
      return { userId, note: local?.deleted ? null : local, source: "local" };
    }

    try {
      const params = new URLSearchParams({
        pageKey: identity.pageKey,
        bibleVersionID: identity.bibleVersionID || "",
        bibleChapterID: identity.bibleChapterID || ""
      });

      const response = await fetch(`/api/quill-notes?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store"
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to load notes");
      }

      if (!result.note) {
        if (local && local.syncStatus === "clean") {
          await window.UserOfflineDB.deleteQuillNote(userId, local.pageKey);
        }
        return { userId, note: null, source: "server" };
      }

      const stored = await storeCleanServerNote(userId, result.note, identity);
      return { userId, note: stored, source: "server" };
    } catch (error) {
      console.warn("Using local My Notes because the server could not be reached:", error);
      return { userId, note: local?.deleted ? null : local, source: "local" };
    }
  }

  function mapServerMiniEditorPage(serverPage) {
    if (!serverPage) return null;

    let miniEditorJson = serverPage.mini_editor_json ?? serverPage.miniEditorJson ?? null;
    if (typeof miniEditorJson === "string") {
      try {
        miniEditorJson = JSON.parse(miniEditorJson);
      } catch (_error) {
        miniEditorJson = null;
      }
    }

    return {
      pageKey: serverPage.page_key || serverPage.pageKey || "",
      bibleVersionID: serverPage.bible_version_id || serverPage.bibleVersionID || "",
      bibleChapterID: serverPage.bible_chapter_id || serverPage.bibleChapterID || "",
      pageUrl: serverPage.page_url || serverPage.pageUrl || "",
      bibleName: serverPage.bible_name || serverPage.bibleName || "",
      bookChapterLabel: serverPage.book_chapter_label || serverPage.bookChapterLabel || "",
      miniEditorJson,
      hasHighlights: Boolean(serverPage.has_highlights ?? serverPage.hasHighlights),
      hasDrawings: Boolean(serverPage.has_drawings ?? serverPage.hasDrawings),
      hasTextFormats: Boolean(serverPage.has_text_formats ?? serverPage.hasTextFormats),
      serverVersion: Number(serverPage.version) || 0,
      serverUpdatedAt: serverPage.updated_at || serverPage.updatedAt || null
    };
  }

  async function storeCleanServerMiniEditorPage(userId, serverPage, fallbackIdentity = {}) {
    const mapped = mapServerMiniEditorPage(serverPage);
    if (!mapped) return null;

    const pageKey = mapped.pageKey || fallbackIdentity.pageKey;
    const record = {
      userId,
      pageKey,
      bibleVersionID: mapped.bibleVersionID || fallbackIdentity.bibleVersionID || "",
      bibleChapterID: mapped.bibleChapterID || fallbackIdentity.bibleChapterID || "",
      pageUrl: mapped.pageUrl || fallbackIdentity.pageUrl || "",
      bibleName: mapped.bibleName || fallbackIdentity.bibleName || "",
      bookChapterLabel: mapped.bookChapterLabel || fallbackIdentity.bookChapterLabel || "",
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

    await window.UserOfflineDB.putMiniEditorPage(record);
    return record;
  }

  async function loadMiniEditorPage(identity) {
    const userId = await getActiveUserId();
    if (!userId) {
      return { userId: "", page: null, source: "none" };
    }

    let local = await window.UserOfflineDB.getMiniEditorPage(userId, identity.pageKey);

    if (!local && identity.bibleVersionID && identity.bibleChapterID) {
      local = await window.UserOfflineDB.getMiniEditorPageByBibleChapter(
        userId,
        identity.bibleVersionID,
        identity.bibleChapterID
      );
    }

    if (local?.syncStatus === "pending" || local?.syncStatus === "conflict") {
      if (canTryServer()) scheduleFlush(0);
      return { userId, page: local.deleted ? null : local, source: "local" };
    }

    if (!canTryServer()) {
      return { userId, page: local?.deleted ? null : local, source: "local" };
    }

    try {
      const params = new URLSearchParams({
        pageKey: identity.pageKey,
        bibleVersionID: identity.bibleVersionID || "",
        bibleChapterID: identity.bibleChapterID || ""
      });

      const response = await fetch(`/api/mini-editor-page?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store"
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Failed to load mini-editor page");
      }

      if (!result.page) {
        if (local && local.syncStatus === "clean") {
          await window.UserOfflineDB.deleteMiniEditorPage(userId, local.pageKey);
        }
        return { userId, page: null, source: "server" };
      }

      const stored = await storeCleanServerMiniEditorPage(userId, result.page, identity);
      return { userId, page: stored, source: "server" };
    } catch (error) {
      console.warn("Using local annotations because the server could not be reached:", error);
      return { userId, page: local?.deleted ? null : local, source: "local" };
    }
  }

  async function getReusablePendingMutation(userId, entityType, entityKey) {
    const items = await window.UserOfflineDB.listOutboxForEntity(
      userId,
      entityType,
      entityKey
    );

    return items.find((item) => item.status === "pending") || null;
  }

  async function putQuillMutation(userId, noteRecord, operation) {
    const entityKey = noteRecord.pageKey;
    const existing = await getReusablePendingMutation(userId, ENTITY_QUILL_NOTE, entityKey);
    const timestamp = now();

    const mutation = {
      ...(existing || {}),
      mutationId: existing?.mutationId || newUuid(),
      userId,
      deviceId: getDeviceId(),
      entityType: ENTITY_QUILL_NOTE,
      entityKey,
      operation,
      baseVersion: Number(noteRecord.serverVersion) || 0,
      payload: operation === "delete" ? null : {
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
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      attemptCount: Number(existing?.attemptCount) || 0,
      lastError: ""
    };

    await window.UserOfflineDB.putOutboxMutation(mutation);
    return mutation;
  }

  async function saveQuillNote(input) {
    const userId = await getActiveUserId();
    if (!userId) {
      throw new Error("No trusted user is available for My Notes.");
    }

    const pageKey = input.pageKey;
    let existing = await window.UserOfflineDB.getQuillNote(userId, pageKey);

    if (!existing && input.bibleVersionID && input.bibleChapterID) {
      existing = await window.UserOfflineDB.getQuillNoteByBibleChapter(
        userId,
        input.bibleVersionID,
        input.bibleChapterID
      );
    }

    const record = {
      ...(existing || {}),
      userId,
      pageKey: existing?.pageKey || pageKey,
      bibleVersionID: input.bibleVersionID,
      bibleChapterID: input.bibleChapterID,
      pageUrl: input.pageUrl || "",
      bibleName: input.bibleName || existing?.bibleName || "",
      bookChapterLabel: input.bookChapterLabel || existing?.bookChapterLabel || "",
      quillDelta: input.quillDelta,
      plainText: input.plainText || "",
      serverVersion: Number(existing?.serverVersion) || Number(input.serverVersion) || 0,
      serverUpdatedAt: existing?.serverUpdatedAt || null,
      localUpdatedAt: now(),
      syncStatus: "pending",
      conflictRemote: null,
      deleted: false
    };

    await window.UserOfflineDB.putQuillNote(record);

    const operation = record.serverVersion > 0 ? "update" : "create";
    const mutation = await putQuillMutation(userId, record, operation);

    dispatch("user-data-local-save", {
      userId,
      entityType: ENTITY_QUILL_NOTE,
      entityKey: record.pageKey,
      mutationId: mutation.mutationId,
      note: record
    });

    scheduleFlush(0);

    return {
      userId,
      note: record,
      mutationId: mutation.mutationId,
      syncStatus: "pending"
    };
  }

  async function deleteQuillNote(input) {
    const userId = await getActiveUserId();
    if (!userId) {
      throw new Error("No trusted user is available for My Notes.");
    }

    const existing =
      (await window.UserOfflineDB.getQuillNote(userId, input.pageKey)) ||
      (input.bibleVersionID && input.bibleChapterID
        ? await window.UserOfflineDB.getQuillNoteByBibleChapter(
            userId,
            input.bibleVersionID,
            input.bibleChapterID
          )
        : null);

    if (!existing) {
      return { userId, note: null, syncStatus: "clean" };
    }

    const entityKey = existing.pageKey;
    const pending = await window.UserOfflineDB.listOutboxForEntity(
      userId,
      ENTITY_QUILL_NOTE,
      entityKey
    );
    const hasSending = pending.some((item) => item.status === "sending");

    if (Number(existing.serverVersion || 0) === 0 && !hasSending) {
      for (const item of pending) {
        await window.UserOfflineDB.deleteOutboxMutation(item.mutationId);
      }
      await window.UserOfflineDB.deleteQuillNote(userId, entityKey);

      dispatch("user-data-local-save", {
        userId,
        entityType: ENTITY_QUILL_NOTE,
        entityKey,
        deleted: true
      });

      return { userId, note: null, syncStatus: "clean" };
    }

    const tombstone = {
      ...existing,
      plainText: "",
      quillDelta: null,
      deleted: true,
      localUpdatedAt: now(),
      syncStatus: "pending",
      conflictRemote: null
    };

    await window.UserOfflineDB.putQuillNote(tombstone);
    const mutation = await putQuillMutation(userId, tombstone, "delete");

    dispatch("user-data-local-save", {
      userId,
      entityType: ENTITY_QUILL_NOTE,
      entityKey,
      mutationId: mutation.mutationId,
      deleted: true
    });

    scheduleFlush(0);

    return {
      userId,
      note: null,
      mutationId: mutation.mutationId,
      syncStatus: "pending"
    };
  }

  async function putMiniEditorMutation(userId, pageRecord, operation) {
    const entityKey = pageRecord.pageKey;
    const existing = await getReusablePendingMutation(
      userId,
      ENTITY_MINI_EDITOR_PAGE,
      entityKey
    );
    const timestamp = now();

    const mutation = {
      ...(existing || {}),
      mutationId: existing?.mutationId || newUuid(),
      userId,
      deviceId: getDeviceId(),
      entityType: ENTITY_MINI_EDITOR_PAGE,
      entityKey,
      operation,
      baseVersion: Number(pageRecord.serverVersion) || 0,
      payload: operation === "delete" ? null : {
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
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      attemptCount: Number(existing?.attemptCount) || 0,
      lastError: ""
    };

    await window.UserOfflineDB.putOutboxMutation(mutation);
    return mutation;
  }

  async function saveMiniEditorPage(input) {
    const userId = await getActiveUserId();
    if (!userId) {
      throw new Error("No trusted user is available for annotations.");
    }

    let existing = await window.UserOfflineDB.getMiniEditorPage(userId, input.pageKey);
    if (!existing && input.bibleVersionID && input.bibleChapterID) {
      existing = await window.UserOfflineDB.getMiniEditorPageByBibleChapter(
        userId,
        input.bibleVersionID,
        input.bibleChapterID
      );
    }

    const record = {
      ...(existing || {}),
      userId,
      pageKey: existing?.pageKey || input.pageKey,
      bibleVersionID: input.bibleVersionID,
      bibleChapterID: input.bibleChapterID,
      pageUrl: input.pageUrl || "",
      bibleName: input.bibleName || existing?.bibleName || "",
      bookChapterLabel: input.bookChapterLabel || existing?.bookChapterLabel || "",
      miniEditorJson: input.miniEditorJson,
      hasHighlights: Boolean(input.hasHighlights),
      hasDrawings: Boolean(input.hasDrawings),
      hasTextFormats: Boolean(input.hasTextFormats),
      serverVersion: Number(existing?.serverVersion) || Number(input.serverVersion) || 0,
      serverUpdatedAt: existing?.serverUpdatedAt || null,
      localUpdatedAt: now(),
      syncStatus: "pending",
      conflictRemote: null,
      deleted: false
    };

    await window.UserOfflineDB.putMiniEditorPage(record);
    const operation = record.serverVersion > 0 ? "update" : "create";
    const mutation = await putMiniEditorMutation(userId, record, operation);

    dispatch("user-data-local-save", {
      userId,
      entityType: ENTITY_MINI_EDITOR_PAGE,
      entityKey: record.pageKey,
      mutationId: mutation.mutationId,
      page: record
    });

    scheduleFlush(0);

    return {
      userId,
      page: record,
      mutationId: mutation.mutationId,
      syncStatus: "pending"
    };
  }

  async function deleteMiniEditorPage(input) {
    const userId = await getActiveUserId();
    if (!userId) {
      throw new Error("No trusted user is available for annotations.");
    }

    const existing =
      (await window.UserOfflineDB.getMiniEditorPage(userId, input.pageKey)) ||
      (input.bibleVersionID && input.bibleChapterID
        ? await window.UserOfflineDB.getMiniEditorPageByBibleChapter(
            userId,
            input.bibleVersionID,
            input.bibleChapterID
          )
        : null);

    if (!existing) {
      return { userId, page: null, syncStatus: "clean", changed: false };
    }

    const entityKey = existing.pageKey;
    const pending = await window.UserOfflineDB.listOutboxForEntity(
      userId,
      ENTITY_MINI_EDITOR_PAGE,
      entityKey
    );
    const hasSending = pending.some((item) => item.status === "sending");

    if (Number(existing.serverVersion || 0) === 0 && !hasSending) {
      for (const item of pending) {
        await window.UserOfflineDB.deleteOutboxMutation(item.mutationId);
      }
      await window.UserOfflineDB.deleteMiniEditorPage(userId, entityKey);
      dispatch("user-data-local-save", {
        userId,
        entityType: ENTITY_MINI_EDITOR_PAGE,
        entityKey,
        deleted: true
      });
      return { userId, page: null, syncStatus: "clean", changed: true };
    }

    const tombstone = {
      ...existing,
      miniEditorJson: null,
      hasHighlights: false,
      hasDrawings: false,
      hasTextFormats: false,
      deleted: true,
      localUpdatedAt: now(),
      syncStatus: "pending",
      conflictRemote: null
    };

    await window.UserOfflineDB.putMiniEditorPage(tombstone);
    const mutation = await putMiniEditorMutation(userId, tombstone, "delete");

    dispatch("user-data-local-save", {
      userId,
      entityType: ENTITY_MINI_EDITOR_PAGE,
      entityKey,
      mutationId: mutation.mutationId,
      deleted: true
    });

    scheduleFlush(0);
    return {
      userId,
      page: null,
      mutationId: mutation.mutationId,
      syncStatus: "pending",
      changed: true
    };
  }

  async function updatePendingBaseVersions(userId, entityType, entityKey, newVersion) {
    const items = await window.UserOfflineDB.listOutboxForEntity(
      userId,
      entityType,
      entityKey
    );

    for (const item of items) {
      if (item.status !== "pending") continue;

      await window.UserOfflineDB.putOutboxMutation({
        ...item,
        baseVersion: Number(newVersion) || 0,
        operation: Number(newVersion) > 0 && item.operation === "create" ? "update" : item.operation,
        updatedAt: now()
      });
    }
  }

  async function applySyncSuccess(mutation, result) {
    if (mutation.entityType === ENTITY_MINI_EDITOR_PAGE) {
      const pageResult = result?.result?.page || null;

      if (mutation.operation === "delete") {
        await window.UserOfflineDB.deleteMiniEditorPage(mutation.userId, mutation.entityKey);
        await window.UserOfflineDB.deleteOutboxMutation(mutation.mutationId);
        dispatch("user-data-synced", {
          userId: mutation.userId,
          entityType: mutation.entityType,
          entityKey: mutation.entityKey,
          deleted: true,
          version: null
        });
        return;
      }

      if (pageResult) {
        const current = await window.UserOfflineDB.getMiniEditorPage(
          mutation.userId,
          mutation.entityKey
        );
        const mapped = mapServerMiniEditorPage(pageResult);
        const hasNewerLocalWork = Boolean(
          current &&
          Number(current.localUpdatedAt || 0) >
            Number(mutation.updatedAt || mutation.createdAt || 0)
        );

        if (hasNewerLocalWork) {
          await window.UserOfflineDB.putMiniEditorPage({
            ...current,
            serverVersion: mapped.serverVersion,
            serverUpdatedAt: mapped.serverUpdatedAt,
            syncStatus: "pending",
            conflictRemote: null
          });
        } else {
          await storeCleanServerMiniEditorPage(mutation.userId, pageResult, current || {});
        }

        await updatePendingBaseVersions(
          mutation.userId,
          ENTITY_MINI_EDITOR_PAGE,
          mutation.entityKey,
          mapped.serverVersion
        );
      }

      await window.UserOfflineDB.deleteOutboxMutation(mutation.mutationId);
      dispatch("user-data-synced", {
        userId: mutation.userId,
        entityType: mutation.entityType,
        entityKey: mutation.entityKey,
        version: Number(pageResult?.version) || Number(result?.resultVersion) || 0,
        page: pageResult
      });
      return;
    }

    const noteResult = result?.result?.note || null;

    if (mutation.operation === "delete") {
      await window.UserOfflineDB.deleteQuillNote(mutation.userId, mutation.entityKey);
      await window.UserOfflineDB.deleteOutboxMutation(mutation.mutationId);

      dispatch("user-data-synced", {
        userId: mutation.userId,
        entityType: mutation.entityType,
        entityKey: mutation.entityKey,
        deleted: true,
        version: null
      });
      return;
    }

    if (noteResult) {
      const current = await window.UserOfflineDB.getQuillNote(
        mutation.userId,
        mutation.entityKey
      );
      const mapped = mapServerNote(noteResult);
      const hasNewerLocalWork = Boolean(
        current && Number(current.localUpdatedAt || 0) > Number(mutation.updatedAt || mutation.createdAt || 0)
      );

      if (hasNewerLocalWork) {
        await window.UserOfflineDB.putQuillNote({
          ...current,
          serverVersion: mapped.serverVersion,
          serverUpdatedAt: mapped.serverUpdatedAt,
          syncStatus: "pending",
          conflictRemote: null
        });
      } else {
        await storeCleanServerNote(mutation.userId, noteResult, current || {});
      }

      await updatePendingBaseVersions(
        mutation.userId,
        ENTITY_QUILL_NOTE,
        mutation.entityKey,
        mapped.serverVersion
      );
    }

    await window.UserOfflineDB.deleteOutboxMutation(mutation.mutationId);

    dispatch("user-data-synced", {
      userId: mutation.userId,
      entityType: mutation.entityType,
      entityKey: mutation.entityKey,
      version: Number(noteResult?.version) || Number(result?.resultVersion) || 0,
      note: noteResult
    });
  }

  async function applySyncConflict(mutation, result) {
    if (mutation.entityType === ENTITY_MINI_EDITOR_PAGE) {
      const current = await window.UserOfflineDB.getMiniEditorPage(
        mutation.userId,
        mutation.entityKey
      );
      const latest = result?.latestPage || null;

      if (current) {
        await window.UserOfflineDB.putMiniEditorPage({
          ...current,
          syncStatus: "conflict",
          conflictRemote: latest,
          localUpdatedAt: now()
        });
      }

      await window.UserOfflineDB.putOutboxMutation({
        ...mutation,
        status: "conflict",
        updatedAt: now(),
        lastError: result?.message || "A newer annotation version exists on another device."
      });

      dispatch("user-data-conflict", {
        userId: mutation.userId,
        entityType: mutation.entityType,
        entityKey: mutation.entityKey,
        mutationId: mutation.mutationId,
        latestPage: latest
      });
      return;
    }

    const current = await window.UserOfflineDB.getQuillNote(
      mutation.userId,
      mutation.entityKey
    );

    const latest = result?.latestNote || null;

    if (current) {
      await window.UserOfflineDB.putQuillNote({
        ...current,
        syncStatus: "conflict",
        conflictRemote: latest,
        localUpdatedAt: now()
      });
    }

    await window.UserOfflineDB.putOutboxMutation({
      ...mutation,
      status: "conflict",
      updatedAt: now(),
      lastError: result?.message || "A newer version exists on another device."
    });

    dispatch("user-data-conflict", {
      userId: mutation.userId,
      entityType: mutation.entityType,
      entityKey: mutation.entityKey,
      mutationId: mutation.mutationId,
      latestNote: latest
    });
  }

  async function sendMutation(mutation) {
    const response = await fetch("/api/sync/mutations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        deviceId: getDeviceId(),
        mutations: [mutation]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.message || "Failed to synchronize local changes.");
      error.status = response.status;
      throw error;
    }

    return data?.results?.[0] || null;
  }

  async function confirmOnlineUser(expectedUserId) {
    const response = await fetch("/api/me", {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });

    if (!response.ok) {
      return false;
    }

    const result = await response.json();
    const userId = String(result?.user?.id || "");

    if (!userId || userId !== expectedUserId) {
      return false;
    }

    await rememberAuthenticatedUser(userId);
    return true;
  }

  async function flushOutbox() {
    if (flushPromise) {
      return flushPromise;
    }

    flushPromise = (async () => {
      const userId = await getActiveUserId();
      if (!userId || !canTryServer()) return { synced: 0 };

      let authenticated = false;
      try {
        authenticated = await confirmOnlineUser(userId);
      } catch (_error) {
        return { synced: 0 };
      }

      if (!authenticated) {
        return { synced: 0 };
      }

      await window.UserOfflineDB.resetSendingMutations(userId);

      let synced = 0;

      while (canTryServer()) {
        const pending = await window.UserOfflineDB.listOutbox(userId, ["pending"]);
        const mutation = pending[0];

        if (!mutation) break;

        const sending = {
          ...mutation,
          status: "sending",
          attemptCount: Number(mutation.attemptCount || 0) + 1,
          lastAttemptAt: now(),
          updatedAt: now()
        };

        await window.UserOfflineDB.putOutboxMutation(sending);

        try {
          const result = await sendMutation(sending);

          if (!result) {
            throw new Error("The sync response did not include a mutation result.");
          }

          if (result.status === "conflict") {
            await applySyncConflict(sending, result);
            continue;
          }

          if (result.status === "ok") {
            await applySyncSuccess(sending, result);
            synced += 1;
            continue;
          }

          await window.UserOfflineDB.putOutboxMutation({
            ...sending,
            status: "pending",
            updatedAt: now(),
            lastError: result.message || "Synchronization could not be completed."
          });
          break;
        } catch (error) {
          await window.UserOfflineDB.putOutboxMutation({
            ...sending,
            status: "pending",
            updatedAt: now(),
            lastError: error.message || "Synchronization could not be completed."
          });
          break;
        }
      }

      return { synced };
    })().finally(() => {
      flushPromise = null;
    });

    return flushPromise;
  }

  function scheduleFlush(delayMs = 100) {
    window.clearTimeout(flushTimer);
    flushTimer = window.setTimeout(() => {
      flushTimer = null;
      flushOutbox().catch((error) => {
        console.warn("User data synchronization paused:", error);
      });
    }, Math.max(0, Number(delayMs) || 0));
  }

  async function useRemoteQuillConflict(pageKey) {
    const userId = await getActiveUserId();
    if (!userId || !pageKey) return null;

    const current = await window.UserOfflineDB.getQuillNote(userId, pageKey);
    const remote = current?.conflictRemote || null;

    if (!current || !remote) {
      return null;
    }

    const items = await window.UserOfflineDB.listOutboxForEntity(
      userId,
      ENTITY_QUILL_NOTE,
      pageKey
    );

    for (const item of items) {
      if (item.status === "conflict" || item.status === "pending") {
        await window.UserOfflineDB.deleteOutboxMutation(item.mutationId);
      }
    }

    const stored = await storeCleanServerNote(userId, remote, current);

    dispatch("user-data-conflict-resolved", {
      userId,
      entityType: ENTITY_QUILL_NOTE,
      entityKey: pageKey,
      choice: "remote"
    });

    return stored;
  }

  async function useRemoteMiniEditorConflict(pageKey) {
    const userId = await getActiveUserId();
    if (!userId || !pageKey) return null;

    const current = await window.UserOfflineDB.getMiniEditorPage(userId, pageKey);
    const remote = current?.conflictRemote || null;
    if (!current || !remote) return null;

    const items = await window.UserOfflineDB.listOutboxForEntity(
      userId,
      ENTITY_MINI_EDITOR_PAGE,
      pageKey
    );

    for (const item of items) {
      if (["conflict", "pending", "sending"].includes(item.status)) {
        await window.UserOfflineDB.deleteOutboxMutation(item.mutationId);
      }
    }

    const stored = await storeCleanServerMiniEditorPage(userId, remote, current);
    dispatch("user-data-conflict-resolved", {
      userId,
      entityType: ENTITY_MINI_EDITOR_PAGE,
      entityKey: pageKey,
      choice: "remote"
    });
    return stored;
  }

  function dispatch(type, detail) {
    window.dispatchEvent(new CustomEvent(type, { detail }));
  }

  window.addEventListener("auth-state-changed", (event) => {
    const detail = event.detail || {};

    if (detail.signedIn && detail.userId && !detail.offlineTrusted) {
      rememberAuthenticatedUser(detail.userId).catch((error) => {
        console.warn("Could not remember the authenticated user locally:", error);
      });
    }

    if (detail.signedIn) {
      scheduleFlush(50);
    }
  });

  window.addEventListener("app-connectivity-changed", (event) => {
    const state = event.detail || {};

    if (
      state.browserOnline !== false &&
      state.appReachable === true &&
      state.connectionIssue !== true
    ) {
      scheduleFlush(50);
    }
  });

  return Object.freeze({
    ENTITY_QUILL_NOTE,
    ENTITY_MINI_EDITOR_PAGE,
    getDeviceId,
    rememberAuthenticatedUser,
    getTrustedOfflineUser,
    getActiveUserId,
    disableOfflineAccess,
    clearPendingRemoteLogout,
    hasPendingRemoteLogout,
    loadQuillNote,
    saveQuillNote,
    deleteQuillNote,
    loadMiniEditorPage,
    saveMiniEditorPage,
    deleteMiniEditorPage,
    flushOutbox,
    scheduleFlush,
    useRemoteQuillConflict,
    useRemoteMiniEditorConflict
  });
})();
