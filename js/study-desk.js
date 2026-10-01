"use strict";

(function () {
  const MANAGE_CATEGORY_VALUE = "__manage_categories__";

  const state = {
    studies: [],
    categories: [],
    availableTags: [],
    activeStudyId: null,
    activeStudyVersion: null,
    remoteStudy: null,
    referencedScripturesStale: false,
    referencedScripturesRemoteStudy: null,
    referencedScripturesDirty: false,
    selectedTags: [],
    linkedScriptures: [],  // This is referred to "Referenced Scriptures" section shown in the Study Desk UI.
    relatedScriptures: [],
    relatedScripturesKey: "",
    relatedScripturesError: "",
    isLoadingRelatedScriptures: false,
    relatedScripturesExpanded: false,
    previewRelatedScripturesExpanded: false,
    studyScriptureTab: "referenced",
    previewScriptureTab: "referenced",
    editingScriptureIndex: null,
    filter: "all",
    lastCategoryId: "",
    managedCategoryId: "",
    managedTagId: "",
    newTagColor: "",
    managedTagScriptures: [],
    managedTagScripturesTagId: "",
    editingManagedTagScriptureId: "",
    isLoadingManagedTagScriptures: false,
    isMutatingManagedTagScripture: false,
    keywordDataStale: false,
    managedTagConflictId: "",
    managedTagScriptureFeedback: null,
    tagManagerTab: "study",
    tagManagerSearch: "",
    isCreatingManagedTag: false,
    quill: null,
    isPreview: false,
    hasLoaded: false,
    isApplying: false,
    hasUnsavedChanges: false,
    isSaving: false,
    syncPollTimer: null
  };

  const MANAGER_COLORS = [
    { label: "Blue", value: "#dbeafe" },
    { label: "Green", value: "#dcfce7" },
    { label: "Purple", value: "#ede9fe" },
    { label: "Gold", value: "#fef3c7" },
    { label: "Rose", value: "#fce7f3" },
    { label: "Teal", value: "#ccfbf1" },
    { label: "Red", value: "#fee2e2" },
    { label: "Gray", value: "#e5e7eb" }
  ];

  const PREFERENCES_STORAGE_KEY = "branchOfIsraelPreferences";
  const DEFAULT_BIBLE_ID = "bba9f40183526463-01";
  const DEFAULT_BIBLE_ABBR = "BSB";
  const STUDY_SYNC_CHANNEL_NAME = "branch-of-israel-study-sync-v1";
  const STUDY_SYNC_STORAGE_KEY = "branchOfIsraelStudySync";
  const STUDY_SYNC_POLL_MS = 15000;
  const STUDY_TOOLBAR_FIT_MARGIN = 8;
  const STUDY_TOOLBAR_RESTORE_MARGIN = 24;
  const PREVIEW_SCRIPTURE_COLUMN_BASE_WIDTH = 310;
  const PREVIEW_SCRIPTURE_COLUMN_MAX_WIDTH = 390;
  const PREVIEW_SCRIPTURE_COLUMN_FIT_MARGIN = 4;
  const linkedScripturePreviewCache = new Map();
  const linkedScriptureBookCache = new Map();
  let activeScripturePopupAnchor = null;
  let relatedScriptureLoadToken = 0;
  let managedTagScriptureLoadToken = 0;
  let managedTagScriptureDrag = null;
  let managedTagScriptureReorderQueue = Promise.resolve();
  let managedTagAutoSaveTimer = null;
  let managedTagAutoSaveVersion = 0;
  let managedTagAutoSaveQueue = Promise.resolve();
  let managedTagPendingSave = null;
  let studySyncChannel = null;
  let studyToolbarFitController = null;
  let keywordManagerFitController = null;
  let previewReferencedFitController = null;
  let lastQuillSelection = null;
  let lastStudyConflictDialogKey = "";

  const els = {};
  let statusClearTimer = null;
  let referencedScriptureFeedbackTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  // Shared responsive-fit logic lives in js/ui-fit-controller.js.
  // Keep the component-specific mode definitions in this file.
  const createResponsiveFitController =
    window.UIFitController?.createResponsiveFitController || (() => null);
  const measureNaturalWidth =
    window.UIFitController?.measureNaturalWidth || ((element) => Number(element?.scrollWidth) || 0);

  function cacheElements() {
    els.authMessage = byId("study-auth-message");
    els.app = byId("study-app");
    els.search = byId("study-search");
    els.filterTabs = byId("study-filter-tabs");
    els.list = byId("study-list");
    els.listStatus = byId("study-list-status");
    els.newButton = byId("new-study-button");
    els.form = byId("study-form");
    els.preview = byId("study-preview");
    els.modeLabel = byId("study-mode-label");
    els.editorTitle = byId("study-editor-title");
    els.status = byId("study-status");
    els.saveState = byId("study-save-state");
    els.wordCount = byId("study-word-count");
    els.previewButton = byId("study-preview-button");
    els.editButton = byId("study-edit-button");
    els.saveButton = byId("save-study-button");
    els.deleteButton = byId("delete-study-button");
    els.title = byId("study-title");
    els.speaker = byId("study-speaker");
    els.location = byId("study-location");
    els.date = byId("study-date");
    els.category = byId("study-category");
    els.scriptureReference = byId("scripture-reference-input");
    els.scriptureNote = byId("scripture-note-input");
    els.addScripture = byId("add-scripture-button");
    els.scriptureList = byId("linked-scripture-list");
    els.scriptureCount = byId("linked-scripture-count");
    els.tagInput = byId("tag-input");
    els.tagOptions = byId("study-tag-options");
    els.addTag = byId("add-tag-button");
    els.tagList = byId("tag-list");
    els.tagCount = byId("tag-count");
    els.previewType = byId("preview-type");
    els.previewDate = byId("preview-date");
    els.previewSpeaker = byId("preview-speaker");
    els.previewLocation = byId("preview-location");
    els.previewTitle = byId("preview-title");
    els.previewTags = byId("preview-tags");
    els.previewContent = byId("preview-content");
    els.previewLinkedScriptures = byId("preview-linked-scriptures");
    els.categoryModal = byId("category-manager-modal");
    els.categoryList = byId("category-manager-list");
    els.closeCategoryManager = byId("close-category-manager");
    els.newCategoryName = byId("new-category-name");
    els.addCategory = byId("add-category-button");
    els.categoryEditor = byId("category-manager-editor");
    els.manageTags = byId("manage-tags-button");
    els.tagManagerModal = byId("tag-manager-modal");
    els.tagManagerList = byId("tag-manager-list");
    els.closeTagManager = byId("close-tag-manager");
    els.newTagName = byId("new-tag-name");
    els.newTagColorPicker = byId("new-tag-color-picker");
    els.newTagCustomColor = byId("new-tag-custom-color");
    els.addManagedTag = byId("add-managed-tag-button");
    els.tagManagerEditor = byId("tag-manager-editor");
  }

  function setStatus(message, type, autoClearMs) {
    if (!els.status) return;

    if (statusClearTimer) {
      clearTimeout(statusClearTimer);
      statusClearTimer = null;
    }

    // A whole-study conflict is the most important status on the page. Keep it
    // visible until the user explicitly loads the newer version.
    if (state.remoteStudy && !state.remoteStudy.deleted) {
      renderStudyConflictNotice("another window or device");
      return;
    }

    const finalMessage = message || "";
    const finalType = type || "";

    els.status.classList.remove("is-conflict");
    els.status.textContent = finalMessage;
    els.status.classList.toggle("is-error", finalType === "error");
    els.status.classList.toggle("is-success", finalType === "success");

    const shouldAutoClear = typeof autoClearMs === "number"
      ? autoClearMs > 0
      : finalType === "success";

    if (finalMessage && shouldAutoClear) {
      const delay = typeof autoClearMs === "number" ? autoClearMs : 4000;

      statusClearTimer = window.setTimeout(() => {
        if (els.status && els.status.textContent === finalMessage) {
          setStatus("", "");
        }
      }, delay);
    }
  }

  function updateStudyActionAvailability() {
    if (!els.saveButton || !els.deleteButton) return;

    const blockedByRemoteChange = Boolean(state.remoteStudy);
    const blockedByReferencedRefresh = Boolean(state.referencedScripturesStale);
    const blockedByVersion = Boolean(
      state.activeStudyId && !Number.isInteger(state.activeStudyVersion)
    );

    els.saveButton.disabled =
      state.isPreview ||
      state.isSaving ||
      blockedByRemoteChange ||
      blockedByReferencedRefresh ||
      blockedByVersion;

    els.deleteButton.disabled =
      state.isPreview ||
      state.isSaving ||
      blockedByRemoteChange ||
      blockedByReferencedRefresh ||
      blockedByVersion;
  }

  function applyLatestRemoteStudy() {
    if (!state.remoteStudy || state.remoteStudy.deleted) return;

    const latest = state.remoteStudy;
    applyIncomingStudy(latest, "Latest version loaded.");
    updateStudyActionAvailability();
  }

  function showStudyConflictDialog(sourceLabel = "another device") {
    if (!state.remoteStudy || state.remoteStudy.deleted) return;

    const remoteVersion = Number(state.remoteStudy.version) || 0;
    const key = `study:${state.activeStudyId || "unknown"}:${remoteVersion}`;

    if (lastStudyConflictDialogKey === key) return;
    lastStudyConflictDialogKey = key;

    if (!window.AppConflictDialog?.show) return;

    window.AppConflictDialog.show({
      key,
      title: "Newer study version available",
      message: `This study was saved from ${sourceLabel} after the version currently open here.`,
      detail: state.hasUnsavedChanges
        ? "Your unsaved changes are still visible. Save is paused so they cannot overwrite the newer version."
        : "Saving is paused until you review or load the newer version.",
      secondaryLabel: "Keep this screen",
      primaryLabel: "Review conflict",
      onPrimary: () => {
        els.status?.scrollIntoView?.({ behavior: "smooth", block: "center" });
        els.status?.querySelector?.(".study-conflict-button")?.focus?.();
      }
    });
  }

  function showStudyDataConflict(error, label = "This item") {
    const code = error?.data?.code || error?.code || "";

    if (!String(code).includes("VERSION_CONFLICT")) {
      return false;
    }

    if (window.AppConflictDialog?.show) {
      const latestTag = error?.data?.latestTag || null;
      const isKeyword = label === "Keyword" && latestTag;

      window.AppConflictDialog.show({
        key: `${code}:${latestTag?.version || error?.data?.latestScripture?.version || "newer"}`,
        title: `${label} changed on another device`,
        message: isKeyword
          ? `The saved Keyword is now “${latestTag.name}”. Your current edit was not saved.`
          : "Your change was not allowed to overwrite the newer saved version.",
        detail: "Your current screen has been left unchanged so nothing is lost. Load the latest saved data before continuing.",
        secondaryLabel: "Keep this screen",
        primaryLabel: "Load latest",
        onPrimary: () => window.location.reload()
      });
    }

    return true;
  }

  function showDuplicateKeywordNotice(error, keywordName = "") {
    const code = error?.data?.code || error?.code || "";

    if (code !== "TAG_DUPLICATE") {
      return false;
    }

    const name = normalizeName(keywordName);

    if (window.AppConflictDialog?.show) {
      window.AppConflictDialog.show({
        key: `duplicate-keyword:${name.toLowerCase()}`,
        title: "Keyword already exists",
        message: name
          ? `"${name}" already exists in your Keyword library.`
          : "That Keyword already exists in your Keyword library.",
        detail: "Use the existing Keyword instead of creating another copy.",
        secondaryLabel: null,
        primaryLabel: "OK"
      });
    }

    return true;
  }

  function renderStudyConflictNotice(sourceLabel = "another window or device", confirmDiscard = false) {
    if (!els.status || !state.remoteStudy || state.remoteStudy.deleted) return;

    if (statusClearTimer) {
      clearTimeout(statusClearTimer);
      statusClearTimer = null;
    }

    els.status.classList.remove("is-error", "is-success");
    els.status.classList.add("is-conflict");
    els.status.replaceChildren();

    const text = document.createElement("span");
    text.className = "study-conflict-copy";

    if (confirmDiscard) {
      text.textContent =
        "Load the latest saved version and discard your current unsaved changes?";
    } else {
      text.textContent =
        `A newer version of this study is available from ${sourceLabel}. ` +
        (state.hasUnsavedChanges
          ? "Your unsaved changes are still here. Save is paused so nothing can be overwritten."
          : "Load it when you are ready.");
    }

    const actions = document.createElement("span");
    actions.className = "study-conflict-actions";

    if (confirmDiscard) {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "study-conflict-button is-secondary";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => renderStudyConflictNotice(sourceLabel, false));

      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "study-conflict-button";
      confirm.textContent = "Load Latest";
      confirm.addEventListener("click", applyLatestRemoteStudy);

      actions.append(cancel, confirm);
    } else {
      const load = document.createElement("button");
      load.type = "button";
      load.className = "study-conflict-button";
      load.textContent = "Load Latest";
      load.addEventListener("click", () => {
        if (state.hasUnsavedChanges) {
          renderStudyConflictNotice(sourceLabel, true);
          return;
        }

        applyLatestRemoteStudy();
      });

      actions.appendChild(load);
    }

    els.status.append(text, actions);
    setSaveState("Newer version available");
    updateStudyActionAvailability();

    if (!confirmDiscard) {
      showStudyConflictDialog(sourceLabel);
    }
  }

  function ensureReferencedScriptureFeedback() {
    if (els.scriptureFeedback?.isConnected) {
      return els.scriptureFeedback;
    }

    const card = els.scriptureList?.closest(".study-tool-card");
    const heading = card?.querySelector(".study-tool-heading");

    if (!card || !heading) return null;

    const feedback = document.createElement("div");
    feedback.className = "referenced-scripture-feedback";
    feedback.setAttribute("aria-live", "polite");
    feedback.hidden = true;
    heading.after(feedback);

    els.scriptureFeedback = feedback;
    return feedback;
  }

  function setReferencedScriptureFeedback(message, type = "error") {
    const feedback = ensureReferencedScriptureFeedback();
    if (!feedback) return;

    if (referencedScriptureFeedbackTimer) {
      clearTimeout(referencedScriptureFeedbackTimer);
      referencedScriptureFeedbackTimer = null;
    }

    const finalMessage = message || "";
    feedback.textContent = finalMessage;
    feedback.hidden = !finalMessage;
    feedback.classList.toggle("is-error", Boolean(finalMessage) && type === "error");
    feedback.classList.toggle("is-success", Boolean(finalMessage) && type === "success");
    feedback.setAttribute("role", type === "error" ? "alert" : "status");

    // This is a transient confirmation, not persistent status. Clear the exact
    // rendered feedback node after five seconds so it cannot remain visible.
    if (finalMessage === "Referenced Scriptures refreshed." && type === "success") {
      const feedbackNode = feedback;
      const expectedMessage = finalMessage;

      referencedScriptureFeedbackTimer = window.setTimeout(() => {
        referencedScriptureFeedbackTimer = null;

        if (!feedbackNode.isConnected || feedbackNode.textContent !== expectedMessage) {
          return;
        }

        feedbackNode.textContent = "";
        feedbackNode.hidden = true;
        feedbackNode.classList.remove("is-error", "is-success");
        feedbackNode.setAttribute("role", "status");
      }, 5000);
    }
  }

  function ensureReferencedScriptureRefreshNotice() {
    if (els.referencedRefreshNotice?.isConnected) {
      return els.referencedRefreshNotice;
    }

    const card = els.scriptureList?.closest(".study-tool-card");
    const heading = card?.querySelector(".study-tool-heading");

    if (!card || !heading) return null;

    const notice = document.createElement("div");
    notice.className = "study-referenced-refresh-notice";
    notice.setAttribute("role", "status");
    notice.hidden = true;

    const text = document.createElement("span");
    text.className = "study-referenced-refresh-text";
    text.textContent = "New Scripture changes are available. Refresh this section before saving.";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "study-referenced-refresh-button";
    button.textContent = "Refresh";
    button.addEventListener("click", refreshReferencedScripturesManually);

    notice.append(text, button);
    heading.insertAdjacentElement("afterend", notice);

    els.referencedRefreshNotice = notice;
    els.referencedRefreshText = text;
    els.referencedRefreshButton = button;

    return notice;
  }

  function hasReferencedScriptureWorkInProgress() {
    return Boolean(
      state.editingScriptureIndex !== null ||
      normalizeName(els.scriptureReference?.value || "") ||
      normalizeName(els.scriptureNote?.value || "")
    );
  }

  function updateReferencedScriptureRefreshNotice() {
    const notice = ensureReferencedScriptureRefreshNotice();
    if (!notice) return;

    if (!state.referencedScripturesStale) {
      notice.hidden = true;
      return;
    }

    notice.hidden = false;

    const busy = hasReferencedScriptureWorkInProgress();
    const blockedByWholeStudy = Boolean(state.remoteStudy);

    if (els.referencedRefreshText) {
      if (blockedByWholeStudy) {
        els.referencedRefreshText.textContent =
          "Scripture changes are available, but a newer whole-study version must be loaded first.";
      } else if (busy) {
        els.referencedRefreshText.textContent =
          "New Scripture changes are available. Finish your current Scripture edit, then refresh before saving.";
      } else {
        els.referencedRefreshText.textContent =
          "New Scripture changes are available. Refresh this section before saving.";
      }
    }

    if (els.referencedRefreshButton) {
      els.referencedRefreshButton.disabled = busy || blockedByWholeStudy;
      els.referencedRefreshButton.textContent = "Refresh";
    }
  }

  function mergeReferencedScriptureChanges(remoteScriptures) {
    const remote = Array.isArray(remoteScriptures) ? remoteScriptures : [];

    if (!state.referencedScripturesDirty) {
      return remote.slice();
    }

    const merged = state.linkedScriptures.slice();
    const seen = new Set(
      merged
        .map((item) => getNormalizedReferenceKey(item?.reference || ""))
        .filter(Boolean)
    );

    remote.forEach((item) => {
      const key = getNormalizedReferenceKey(item?.reference || "");
      if (!key || seen.has(key)) return;
      merged.push(item);
      seen.add(key);
    });

    return merged;
  }

  async function refreshReferencedScripturesManually() {
    if (
      !state.referencedScripturesStale ||
      !state.referencedScripturesRemoteStudy ||
      state.remoteStudy ||
      hasReferencedScriptureWorkInProgress()
    ) {
      updateReferencedScriptureRefreshNotice();
      return;
    }

    const remoteStudy = state.referencedScripturesRemoteStudy;
    const remoteVersion = Number(remoteStudy.version) || 0;

    if (
      remoteStudy.id !== state.activeStudyId ||
      remoteVersion <= (Number(state.activeStudyVersion) || 0)
    ) {
      state.referencedScripturesStale = false;
      state.referencedScripturesRemoteStudy = null;
      updateReferencedScriptureRefreshNotice();
      updateStudyActionAvailability();
      return;
    }

    if (els.referencedRefreshButton) {
      els.referencedRefreshButton.disabled = true;
      els.referencedRefreshButton.textContent = "Refreshing...";
    }

    state.linkedScriptures = mergeReferencedScriptureChanges(remoteStudy.linkedScriptures);
    state.activeStudyVersion = remoteVersion;
    state.referencedScripturesStale = false;
    state.referencedScripturesRemoteStudy = null;

    upsertStudyInState(remoteStudy);
    renderStudyList();
    renderLinkedScriptures();
    renderRelatedScriptures();

    setReferencedScriptureFeedback("Referenced Scriptures refreshed.", "success");
    updateReferencedScriptureRefreshNotice();
    updateStudyActionAvailability();

    if (state.hasUnsavedChanges) {
      setSaveState("Unsaved changes");
    } else {
      setSaveState("Synced", "success");
    }
  }

  function markReferencedScripturesDirty() {
    state.referencedScripturesDirty = true;
    markDirty();
  }

  function markDirty() {
    state.hasUnsavedChanges = true;
    setSaveState("Unsaved changes");
  }

  function confirmDiscardUnsavedChanges() {
    if (!state.hasUnsavedChanges) {
      return true;
    }
  
    return confirm("You have unsaved changes. Leave without saving?");
  }
  
  function markClean(message = "Saved") {
    state.hasUnsavedChanges = false;
    setSaveState(message, "success");
  }
  
  function setListStatus(message, type) {
    if (!els.listStatus) return;

    els.listStatus.textContent = message || "";
    els.listStatus.classList.toggle("is-error", type === "error");
    els.listStatus.classList.toggle("is-success", type === "success");
  }

  function setSaveState(message, type) {
    if (!els.saveState) return;

    els.saveState.textContent = message || "";
    els.saveState.classList.toggle("is-success", type === "success");
  }

  function showLoggedOut() {
    if (els.authMessage) els.authMessage.hidden = false;
    if (els.app) els.app.hidden = true;
  
    if (els.search) {
      els.search.disabled = true;
      els.search.value = "";
    }
  }
  
  function showApp() {
    if (els.authMessage) els.authMessage.hidden = true;
    if (els.app) els.app.hidden = false;
  
    if (els.search) {
      els.search.disabled = false;
    }
  }

  let studyLoadPromise = null;

  function handleStudyDeskAuthState(user) {
    if (!user) {
      state.studies = [];
      state.categories = [];
      state.availableTags = [];
      resetManagedTagScriptureState();
      state.managedTagId = "";
      state.activeStudyId = null;
      state.activeStudyVersion = null;
      state.remoteStudy = null;
      state.referencedScripturesStale = false;
      state.referencedScripturesRemoteStudy = null;
      state.referencedScripturesDirty = false;
      state.keywordDataStale = false;
      state.hasLoaded = false;
  
      showLoggedOut();
      return;
    }
  
    if (state.hasLoaded) {
      showApp();
      return;
    }
  
    if (!studyLoadPromise) {
      studyLoadPromise = loadStudies().finally(() => {
        studyLoadPromise = null;
      });
    }
  }
  
  function bindStudyDeskAuthState() {
    window.addEventListener(
      "auth-state-changed",
      (event) => {
        const detail = event.detail || {};

        if (detail.signedIn && !detail.offlineTrusted) {
          handleStudyDeskAuthState({
            id: detail.userId || "authenticated-user"
          });
          return;
        }

        handleStudyDeskAuthState(null);
      }
    );

    /*
     * Study Desk stays locked until the shared authentication controller
     * publishes an authenticated online state.
     */
    showLoggedOut();
  }
    
  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: "include",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    let result = null;

    try {
      result = await response.json();
    } catch (error) {
      result = { ok: false, message: "Unexpected server response" };
    }

    if (response.status === 401) {
      showLoggedOut();
      throw new Error("Please log in to use Study Desk.");
    }

    if (!response.ok) {
      const requestError = new Error(result.message || "Request failed");
      requestError.status = response.status;
      requestError.data = result;
      throw requestError;
    }

    return result;
  }

  function toDateInput(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value).slice(0, 10);
    }

    return date.toISOString().slice(0, 10);
  }

  function formatDate(value) {
    if (!value) return "";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function getCategoryById(id) {
    return state.categories.find((category) => category.id === id) || null;
  }

  function getCategoryName(id) {
    const category = getCategoryById(id);
    return category ? category.name : "Study";
  }

  function normalizeName(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function properCaseKeywordName(value) {
    return normalizeName(value)
      .toLocaleLowerCase("en-US")
      .replace(/(^|[\s\-\/(])([\p{L}])/gu, (match, prefix, letter) => {
        return `${prefix}${letter.toLocaleUpperCase("en-US")}`;
      });
  }

  const SCRIPTURE_BOOK_ALIAS_GROUPS = [
    ["Genesis", ["gen", "ge", "gn"]],
    ["Exodus", ["exod", "exo", "ex"]],
    ["Leviticus", ["lev", "le", "lv"]],
    ["Numbers", ["num", "nu", "nm", "nb"]],
    ["Deuteronomy", ["deut", "deu", "dt"]],
    ["Joshua", ["josh", "jos", "jsh"]],
    ["Judges", ["judg", "jdg", "jg", "jdgs"]],
    ["Ruth", ["rth", "ru"]],
    ["1 Samuel", ["1 sam", "1sam", "1 sa", "1sa", "1 sm", "1sm", "i samuel", "i sam", "1st samuel"]],
    ["2 Samuel", ["2 sam", "2sam", "2 sa", "2sa", "2 sm", "2sm", "ii samuel", "ii sam", "2nd samuel"]],
    ["1 Kings", ["1 kings", "1 kgs", "1kgs", "1 ki", "1ki", "i kings", "1st kings"]],
    ["2 Kings", ["2 kings", "2 kgs", "2kgs", "2 ki", "2ki", "ii kings", "2nd kings"]],
    ["1 Chronicles", ["1 chronicles", "1 chron", "1chron", "1 chr", "1chr", "1 ch", "1ch", "i chronicles", "1st chronicles"]],
    ["2 Chronicles", ["2 chronicles", "2 chron", "2chron", "2 chr", "2chr", "2 ch", "2ch", "ii chronicles", "2nd chronicles"]],
    ["Ezra", ["ezr"]],
    ["Nehemiah", ["neh", "ne"]],
    ["Esther", ["esth", "est"]],
    ["Job", []],
    ["Psalms", ["psalm", "ps", "psa", "pss", "psm"]],
    ["Proverbs", ["prov", "pro", "prv", "pr"]],
    ["Ecclesiastes", ["eccl", "ecc", "ecl"]],
    ["Song of Solomon", ["song of songs", "song of solomon", "song of sol", "song", "sos"]],
    ["Isaiah", ["isa", "is"]],
    ["Jeremiah", ["jer", "je", "jr"]],
    ["Lamentations", ["lam", "la"]],
    ["Ezekiel", ["ezek", "eze", "ezk"]],
    ["Daniel", ["dan", "da", "dn"]],
    ["Hosea", ["hos", "ho"]],
    ["Joel", ["jl"]],
    ["Amos", ["am"]],
    ["Obadiah", ["obad", "ob"]],
    ["Jonah", ["jon"]],
    ["Micah", ["mic", "mi"]],
    ["Nahum", ["nah", "na"]],
    ["Habakkuk", ["hab", "hb"]],
    ["Zephaniah", ["zeph", "zep", "zp"]],
    ["Haggai", ["hag", "hg"]],
    ["Zechariah", ["zech", "zec", "zc"]],
    ["Malachi", ["mal", "ml"]],
    ["Matthew", ["matt", "mat", "mt"]],
    ["Mark", ["mrk", "mk"]],
    ["Luke", ["luk", "lk"]],
    ["John", ["joh", "jhn", "jn"]],
    ["Acts", ["act", "ac"]],
    ["Romans", ["rom", "ro", "rm"]],
    ["1 Corinthians", ["1 corinthians", "1 corinth", "1 cor", "1cor", "1 co", "1co", "i corinthians", "i cor", "1st corinthians"]],
    ["2 Corinthians", ["2 corinthians", "2 corinth", "2 cor", "2cor", "2 co", "2co", "ii corinthians", "ii cor", "2nd corinthians"]],
    ["Galatians", ["gal", "ga"]],
    ["Ephesians", ["eph", "ep"]],
    ["Philippians", ["phil", "php"]],
    ["Colossians", ["col"]],
    ["1 Thessalonians", ["1 thessalonians", "1 thess", "1thess", "1 thes", "1thes", "1 th", "1th", "i thessalonians", "i thess", "1st thessalonians"]],
    ["2 Thessalonians", ["2 thessalonians", "2 thess", "2thess", "2 thes", "2thes", "2 th", "2th", "ii thessalonians", "ii thess", "2nd thessalonians"]],
    ["1 Timothy", ["1 timothy", "1 tim", "1tim", "1 ti", "1ti", "1 tm", "1tm", "i timothy", "i tim", "1st timothy"]],
    ["2 Timothy", ["2 timothy", "2 tim", "2tim", "2 ti", "2ti", "2 tm", "2tm", "ii timothy", "ii tim", "2nd timothy"]],
    ["Titus", ["tit"]],
    ["Philemon", ["phlm", "phm", "pm"]],
    ["Hebrews", ["heb", "he"]],
    ["James", ["jas", "jam", "jm"]],
    ["1 Peter", ["1 peter", "1 pet", "1pet", "1 pe", "1pe", "1 pt", "1pt", "i peter", "i pet", "1st peter"]],
    ["2 Peter", ["2 peter", "2 pet", "2pet", "2 pe", "2pe", "2 pt", "2pt", "ii peter", "ii pet", "2nd peter"]],
    ["1 John", ["1 john", "1 jn", "1jn", "1 jhn", "1jhn", "1 joh", "1joh", "i john", "i jn", "1st john"]],
    ["2 John", ["2 john", "2 jn", "2jn", "2 jhn", "2jhn", "2 joh", "2joh", "ii john", "ii jn", "2nd john"]],
    ["3 John", ["3 john", "3 jn", "3jn", "3 jhn", "3jhn", "3 joh", "3joh", "iii john", "iii jn", "3rd john"]],
    ["Jude", []],
    ["Revelation", ["rev", "re", "rv"]]
  ];

  function getScriptureBookAliasKey(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[.'’]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  const SCRIPTURE_BOOK_ALIAS_MAP = new Map();

  SCRIPTURE_BOOK_ALIAS_GROUPS.forEach(([canonicalName, aliases]) => {
    [canonicalName, ...aliases].forEach((alias) => {
      SCRIPTURE_BOOK_ALIAS_MAP.set(getScriptureBookAliasKey(alias), canonicalName);
    });
  });


  function getCanonicalScriptureBookName(value) {
    const aliasKey = getScriptureBookAliasKey(normalizeName(value));
    return SCRIPTURE_BOOK_ALIAS_MAP.get(aliasKey) || "";
  }

  function normalizeScriptureReference(value) {
    let cleaned = normalizeName(value);

    if (!cleaned) {
      return "";
    }

    cleaned = cleaned
      .replace(/[\u2012\u2013\u2014\u2212]/g, "-")
      .replace(/\s*:\s*/g, ":")
      .replace(/\s*-\s*/g, "-");

    const match = cleaned.match(/^(.+?)(\s+\d.*)$/);

    // If the user entered only a recognized book alias, canonicalize the
    // book name but leave it invalid until a chapter or verse is supplied.
    if (!match) {
      return getCanonicalScriptureBookName(cleaned) || cleaned;
    }

    const rawBookName = normalizeName(match[1]);
    const canonicalBookName = getCanonicalScriptureBookName(rawBookName);

    // Keep unknown book text intact so validation can reject it explicitly.
    const bookName = canonicalBookName || rawBookName;
    let reference = `${bookName}${match[2]}`;

    // Remove partial-verse letters such as 22a, 22b, 22c.
    reference = reference.replace(
      /(\d+)([a-z])(?=\s*(?:-|,|;|$))/gi,
      "$1"
    );

    return reference;
  }

  function positiveScriptureInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
  }

  function buildClientParsedScriptureReference(
    book,
    startChapter,
    startVerse,
    endChapter,
    endVerse
  ) {
    if (!book || !startChapter) {
      return null;
    }
