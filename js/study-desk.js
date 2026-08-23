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
    selectedTags: [],
    linkedScriptures: [],  // This is referred to "Referenced Scriptures" section shown in the Study Desk UI.
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
    managedTagScriptureFeedback: null,
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
  const linkedScripturePreviewCache = new Map();
  const linkedScriptureBookCache = new Map();
  let activeScripturePopupAnchor = null;
  let managedTagScriptureLoadToken = 0;
  let managedTagScriptureDrag = null;
  let managedTagScriptureReorderQueue = Promise.resolve();
  let studySyncChannel = null;

  const els = {};
  let statusClearTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

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

    const finalMessage = message || "";
    const finalType = type || "";

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
    const originalUpdateAuthUI = window.updateAuthUI;
  
    window.updateAuthUI = function (clerkUser) {
      if (typeof originalUpdateAuthUI === "function") {
        originalUpdateAuthUI(clerkUser);
      }
  
      handleStudyDeskAuthState(clerkUser || null);
    };
  
    /*
     * Clerk normally initializes after this script.
     * Until Clerk confirms a user, Study Desk remains locked.
     */
    const clerkObj = window.Clerk || window.clerk;
  
    if (clerkObj && clerkObj.loaded) {
      handleStudyDeskAuthState(clerkObj.user || null);
    } else {
      showLoggedOut();
    }
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

  function normalizeScriptureReference(value) {
    let cleaned = normalizeName(value);
  
    if (!cleaned) {
      return "";
    }
  
    const match = cleaned.match(/^(.+?)(\s+\d.*)$/);
  
    if (!match) {
      return cleaned;
    }
  
    const smallWords = new Set(["of", "the", "and"]);
  
    const bookName = match[1]
      .toLowerCase()
      .split(/\s+/)
      .map((word, index) => {
        if (/^[ivx]+$/i.test(word)) {
          return word.toUpperCase();
        }
  
        if (index > 0 && smallWords.has(word)) {
          return word;
        }
  
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");
  
    let reference = `${bookName}${match[2]}`;
  
    // Remove partial-verse letters such as 22a, 22b, 22c
    reference = reference.replace(
      /(\d+)([a-z])(?=\s*(?:-|,|;|$))/gi, "$1"
    );
  
    return reference;
  }
  
  function normalizeColorValue(value) {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : "";
  }

  function sortByOrderAndName(items) {
    items.sort((a, b) => ((a.sortOrder || 0) - (b.sortOrder || 0)) || String(a.name || "").localeCompare(String(b.name || "")));
  }

  function updateSelectedCategoryReferences(category) {
    state.studies = state.studies.map((study) => {
      if (study.categoryId !== category.id) return study;
      return { ...study, category };
    });
  }

  function updateSelectedTagReferences(tag) {
    state.availableTags = state.availableTags.map((item) => (item.id === tag.id ? tag : item));
    state.selectedTags = state.selectedTags.map((item) => (item.id === tag.id ? tag : item));
    state.studies = state.studies.map((study) => ({
      ...study,
      tags: Array.isArray(study.tags) ? study.tags.map((item) => (item.id === tag.id ? tag : item)) : []
    }));
  }

  function getWordCount() {
    if (!state.quill) return 0;

    const text = state.quill.getText().trim();

    if (!text) return 0;

    return text.split(/\s+/).filter(Boolean).length;
  }

  function updateWordCount() {
    if (!els.wordCount) return;

    const count = getWordCount();
    els.wordCount.textContent = `${count} word${count === 1 ? "" : "s"}`;
  }

  function getPlainPreviewText() {
    if (!state.quill) return "";

    return state.quill.getText().replace(/\s+/g, " ").trim().slice(0, 500);
  }

  function getEmptyStudy() {
    const firstCategory = state.categories[0] || null;

    return {
      id: null,
      version: null,
      title: "",
      categoryId: firstCategory ? firstCategory.id : "",
      category: firstCategory,
      speaker: "",
      location: "",
      studyDate: new Date().toISOString().slice(0, 10),
      mainScripture: "",
      tags: [],
      linkedScriptures: [],
      contentHtml: "",
      previewText: ""
    };
  }

  function collectStudyData() {
    const data = {
      title: els.title.value.trim(),
      categoryId: els.category.value || null,
      speaker: els.speaker.value.trim(),
      location: els.location.value.trim(),
      studyDate: els.date.value || null,
      mainScripture: "",
      tagIds: state.selectedTags.map((tag) => tag.id),
      linkedScriptures: state.linkedScriptures.slice(),
      contentHtml: state.quill ? state.quill.root.innerHTML : "",
      previewText: getPlainPreviewText()
    };

    if (state.activeStudyId && Number.isInteger(state.activeStudyVersion)) {
      data.expectedVersion = state.activeStudyVersion;
    }

    return data;
  }

  function applyStudyToForm(study) {
    const data = study || getEmptyStudy();

    state.activeStudyId = data.id || null;
    const loadedVersion = Number(data.version);
    state.activeStudyVersion = Number.isInteger(loadedVersion) && loadedVersion >= 1 ? loadedVersion : null;
    state.remoteStudy = null;
    state.selectedTags = Array.isArray(data.tags) ? data.tags.slice() : [];
    state.linkedScriptures = Array.isArray(data.linkedScriptures) ? data.linkedScriptures.slice() : [];
    state.editingScriptureIndex = null;

    const categoryId = data.categoryId || data.category?.id || state.categories[0]?.id || "";

    els.title.value = data.title || "";
    els.speaker.value = data.speaker || "";
    els.location.value = data.location || "";
    els.date.value = toDateInput(data.studyDate) || "";
    els.category.value = categoryId;
    state.lastCategoryId = categoryId;

    if (state.quill) {
      const html = data.contentHtml || "";
      state.isApplying = true;

      if (html && state.quill.clipboard && typeof state.quill.clipboard.dangerouslyPasteHTML === "function") {
        state.quill.clipboard.dangerouslyPasteHTML(html);
      } else {
        state.quill.setText("");
      }

      state.isApplying = false;
    }

    els.modeLabel.textContent = state.activeStudyId ? "Edit Study" : "New Study";
    els.editorTitle.textContent = data.title || "Untitled Study";
    els.deleteButton.hidden = !state.activeStudyId;

    renderSelectedTags();
    renderLinkedScriptures();
    updateWordCount();
    state.hasUnsavedChanges = false;
    setSaveState(state.activeStudyId ? "Loaded" : "Draft not saved yet", state.activeStudyId ? "success" : "");
    setStatus("", "");
    switchToEdit();
  }

  function upsertStudyInState(study) {
    if (!study || !study.id) return;

    const index = state.studies.findIndex((item) => item.id === study.id);

    if (index >= 0) {
      state.studies[index] = study;
    } else {
      state.studies.unshift(study);
    }

    state.studies.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  }

  function createSyncMessageId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function publishStudySync(type, payload = {}) {
    const message = {
      id: createSyncMessageId(),
      type,
      sentAt: Date.now(),
      ...payload
    };

    if (studySyncChannel) {
      studySyncChannel.postMessage(message);
      return;
    }

    try {
      localStorage.setItem(STUDY_SYNC_STORAGE_KEY, JSON.stringify(message));
      localStorage.removeItem(STUDY_SYNC_STORAGE_KEY);
    } catch (error) {
      console.warn("Study sync fallback failed:", error);
    }
  }

  function applyIncomingStudy(study, statusMessage) {
    if (!study || !study.id) return;

    const wasPreview = state.isPreview;

    upsertStudyInState(study);
    applyStudyToForm(study);
    renderStudyList();

    if (wasPreview) {
      switchToPreview();
    }

    if (statusMessage) {
      setStatus(statusMessage, "success");
    }
  }

  function handleIncomingStudyUpdate(study, sourceLabel = "another window or device") {
    if (!study || !study.id) return;

    upsertStudyInState(study);
    renderStudyList();

    if (study.id !== state.activeStudyId) {
      return;
    }

    const incomingVersion = Number(study.version) || 0;
    const activeVersion = Number(state.activeStudyVersion) || 0;

    if (incomingVersion <= activeVersion) {
      return;
    }

    if (state.hasUnsavedChanges) {
      const currentRemoteVersion = Number(state.remoteStudy?.version) || 0;

      if (incomingVersion > currentRemoteVersion) {
        state.remoteStudy = study;
      }

      setStatus(
        `This study was updated in ${sourceLabel}. Your local changes are still here, but Save will be blocked until you reload the latest version.`,
        "error",
        0
      );
      setSaveState("Newer version available");
      return;
    }

    applyIncomingStudy(study, `Study updated from ${sourceLabel}.`);
  }

  async function handleIncomingStudyDelete(studyId, sourceLabel = "another window or device") {
    if (!studyId) return;

    state.studies = state.studies.filter((study) => study.id !== studyId);
    renderStudyList();

    if (studyId !== state.activeStudyId) {
      return;
    }

    if (state.hasUnsavedChanges) {
      state.remoteStudy = { id: studyId, deleted: true };
      setStatus(
        `This study was deleted in ${sourceLabel}. Your unsaved local copy is still visible, but it can no longer be saved over the deleted study.`,
        "error",
        0
      );
      setSaveState("Study deleted elsewhere");
      return;
    }

    state.activeStudyId = null;
    state.activeStudyVersion = null;

    if (state.studies.length) {
      await loadStudy(state.studies[0].id);
    } else {
      applyStudyToForm(getEmptyStudy());
      renderStudyList();
    }
  }

  function processStudySyncMessage(message) {
    if (!message || typeof message !== "object") return;

    if (message.type === "study-updated" && message.study) {
      handleIncomingStudyUpdate(message.study, "another browser tab");
      return;
    }

    if (message.type === "study-deleted" && message.studyId) {
      handleIncomingStudyDelete(message.studyId, "another browser tab");
    }
  }

  function initStudySync() {
    if ("BroadcastChannel" in window) {
      studySyncChannel = new BroadcastChannel(STUDY_SYNC_CHANNEL_NAME);
      studySyncChannel.addEventListener("message", (event) => {
        processStudySyncMessage(event.data);
      });
    } else {
      window.addEventListener("storage", (event) => {
        if (event.key !== STUDY_SYNC_STORAGE_KEY || !event.newValue) {
          return;
        }

        try {
          processStudySyncMessage(JSON.parse(event.newValue));
        } catch (error) {
          console.warn("Could not read Study Desk sync message:", error);
        }
      });
    }
  }

  async function checkForRemoteStudyUpdate() {
    if (
      !state.activeStudyId ||
      state.isSaving ||
      document.hidden ||
      !Number.isInteger(state.activeStudyVersion)
    ) {
      return;
    }

    try {
      const result = await fetchJson(`/api/studies/${encodeURIComponent(state.activeStudyId)}`);
      const freshStudy = result.study;

      if (!freshStudy) return;

      const freshVersion = Number(freshStudy.version) || 0;
      const activeVersion = Number(state.activeStudyVersion) || 0;

      if (freshVersion > activeVersion) {
        handleIncomingStudyUpdate(freshStudy, "another window or device");
      }
    } catch (error) {
      if (error.status === 404) {
        await handleIncomingStudyDelete(state.activeStudyId, "another window or device");
      }
    }
  }

  function startStudySyncPolling() {
    if (state.syncPollTimer) {
      clearInterval(state.syncPollTimer);
    }

    state.syncPollTimer = window.setInterval(checkForRemoteStudyUpdate, STUDY_SYNC_POLL_MS);

    window.addEventListener("focus", checkForRemoteStudyUpdate);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        checkForRemoteStudyUpdate();
      }
    });
  }

  function handleVersionConflict(error, actionLabel = "save") {
    const latestStudy = error?.data?.latestStudy || null;

    if (latestStudy) {
      upsertStudyInState(latestStudy);
      renderStudyList();
      state.remoteStudy = latestStudy;
    }

    setStatus(
      `The ${actionLabel} was blocked because this study changed in another window or device. Nothing was overwritten.`,
      "error",
      0
    );
    setSaveState("Newer version exists");

    if (!latestStudy) {
      return;
    }

    const reloadLatest = confirm(
      "This study has a newer saved version.\n\n" +
      "Click OK to load the latest version now. Your current unsaved changes will be discarded.\n\n" +
      "Click Cancel to keep your local changes on screen so you can review or copy them first."
    );

    if (reloadLatest) {
      applyIncomingStudy(latestStudy, "Latest version loaded.");
    }
  }

  function matchesSearch(study, searchValue) {
    if (!searchValue) return true;

    const text = [
      study.title,
      study.category?.name,
      study.studyType,
      study.speaker,
      study.location,
      study.previewText,
      ...(Array.isArray(study.tags) ? study.tags.map((tag) => tag.name || "") : []),
      ...(Array.isArray(study.linkedScriptures) ? study.linkedScriptures.map((item) => `${item.reference || ""} ${item.note || ""}`) : [])
    ]
      .join(" ")
      .toLowerCase();

    return text.includes(searchValue);
  }

  function getFilteredStudies() {
    const searchValue = (els.search.value || "").trim().toLowerCase();

    return state.studies.filter((study) => {
      const typeMatches = state.filter === "all" || study.categoryId === state.filter;
      return typeMatches && matchesSearch(study, searchValue);
    });
  }

  function renderFilterTabs() {
    if (!els.filterTabs) return;

    els.filterTabs.innerHTML = "";

    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.dataset.studyFilter = "all";
    allButton.textContent = "All";
    allButton.classList.toggle("active", state.filter === "all");
    els.filterTabs.appendChild(allButton);

    state.categories.forEach((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.studyFilter = category.id;
      button.textContent = category.name;
      button.classList.toggle("active", state.filter === category.id);
      els.filterTabs.appendChild(button);
    });
  }

  function renderCategoryDropdown() {
    const currentValue = els.category.value || state.lastCategoryId || "";

    els.category.innerHTML = "";

    state.categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.name;
      els.category.appendChild(option);
    });

    const manageOption = document.createElement("option");
    manageOption.value = MANAGE_CATEGORY_VALUE;
    manageOption.textContent = "Manage categories...";
    els.category.appendChild(manageOption);

    if (currentValue && state.categories.some((category) => category.id === currentValue)) {
      els.category.value = currentValue;
    } else if (state.categories.length) {
      els.category.value = state.categories[0].id;
    } else {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No categories yet";
      els.category.insertBefore(option, els.category.firstChild);
      els.category.value = "";
    }

    state.lastCategoryId = els.category.value;
    renderFilterTabs();
  }

  function renderStudyList() {
    if (!els.list) return;

    els.list.innerHTML = "";

    const studies = getFilteredStudies();

    if (!studies.length) {
      setListStatus(state.studies.length ? "No matching studies found." : "No saved studies yet.");
      return;
    }

    setListStatus(`${studies.length} saved stud${studies.length === 1 ? "y" : "ies"}`);

    studies.forEach((study) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "study-list-item";
      button.classList.toggle("active", study.id === state.activeStudyId);
      button.dataset.studyId = study.id;

      const title = document.createElement("strong");
      title.textContent = study.title || "Untitled Study";

      const meta = document.createElement("span");
      meta.textContent = [
        formatDate(study.studyDate || study.updatedAt),
        study.category?.name || study.studyType
      ]
        .filter(Boolean)
        .join(" • ");

      const preview = document.createElement("span");
      preview.textContent = study.previewText ? study.previewText.slice(0, 90) : "";

      button.append(title, meta);

      if (preview.textContent) {
        button.appendChild(preview);
      }

      button.addEventListener("click", () => {
        if (!confirmDiscardUnsavedChanges()) {
          return;
        }

        loadStudy(study.id);
      });

      els.list.appendChild(button);
    });
  }

  async function loadCategories() {
    const result = await fetchJson("/api/study-categories");
    state.categories = Array.isArray(result.categories) ? result.categories : [];
    renderCategoryDropdown();
  }

  async function loadAvailableTags() {
    const result = await fetchJson("/api/study-tags");
    state.availableTags = Array.isArray(result.tags) ? result.tags : [];
    renderTagOptions();
  }

  async function loadSetup() {
    await loadCategories();
    await loadAvailableTags();
  }

  async function loadStudies() {
    setListStatus("Loading...");

    try {
      await loadSetup();
      const result = await fetchJson("/api/studies");
      state.studies = Array.isArray(result.studies) ? result.studies : [];
      state.hasLoaded = true;
      showApp();
      renderStudyList();

      if (state.studies.length && !state.activeStudyId) {
        await loadStudy(state.studies[0].id);
      } else if (!state.studies.length && !state.activeStudyId) {
        applyStudyToForm(getEmptyStudy());
      }
    } catch (error) {
      setListStatus(error.message, "error");
    }
  }

  async function loadStudy(id) {
    if (!id) return;

    setStatus("Loading study...");

    try {
      const result = await fetchJson(`/api/studies/${encodeURIComponent(id)}`);
      applyStudyToForm(result.study);
      renderStudyList();
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function saveStudy() {
    const data = collectStudyData();

    if (!data.title) {
      setStatus("Please enter a study title before saving.", "error");
      els.title.focus();
      return;
    }

    if (state.activeStudyId && !Number.isInteger(state.activeStudyVersion)) {
      setStatus("This study needs to be reloaded before it can be saved safely.", "error", 0);
      setSaveState("Reload required");
      return;
    }

    setStatus("Saving...");
    setSaveState("Saving...");
    state.isSaving = true;

    const isExisting = !!state.activeStudyId;
    const url = isExisting ? `/api/studies/${encodeURIComponent(state.activeStudyId)}` : "/api/studies";
    const method = isExisting ? "PUT" : "POST";

    try {
      const result = await fetchJson(url, {
        method,
        body: JSON.stringify(data)
      });

      const savedStudy = result.study;
      state.activeStudyId = savedStudy.id;

      upsertStudyInState(savedStudy);
      applyStudyToForm(savedStudy);
      renderStudyList();
      setStatus("Study saved successfully.", "success");
      markClean("Saved just now");
      publishStudySync("study-updated", { study: savedStudy });
    } catch (error) {
      if (error.status === 409 && error.data?.code === "STUDY_VERSION_CONFLICT") {
        handleVersionConflict(error, "save");
        return;
      }

      if (error.status === 428) {
        setStatus("This study must be reloaded before it can be saved safely.", "error", 0);
        setSaveState("Reload required");
        return;
      }

      setStatus(error.message, "error");
      setSaveState("Save failed");
    } finally {
      state.isSaving = false;
    }
  }

  async function deleteStudy() {
    if (!state.activeStudyId) return;

    if (!Number.isInteger(state.activeStudyVersion)) {
      setStatus("This study needs to be reloaded before it can be deleted safely.", "error", 0);
      return;
    }

    const studyId = state.activeStudyId;
    const currentTitle = els.title.value.trim() || "this study";

    if (!confirm(`Delete ${currentTitle}? This cannot be undone.`)) {
      return;
    }

    setStatus("Deleting...");
    state.isSaving = true;

    try {
      await fetchJson(
        `/api/studies/${encodeURIComponent(studyId)}?expectedVersion=${encodeURIComponent(state.activeStudyVersion)}`,
        { method: "DELETE" }
      );

      state.studies = state.studies.filter((study) => study.id !== studyId);
      state.activeStudyId = null;
      state.activeStudyVersion = null;
      state.remoteStudy = null;
      renderStudyList();
      publishStudySync("study-deleted", { studyId });

      if (state.studies.length) {
        await loadStudy(state.studies[0].id);
      } else {
        applyStudyToForm(getEmptyStudy());
      }

      setStatus("Study deleted.", "success");
    } catch (error) {
      if (error.status === 409 && error.data?.code === "STUDY_VERSION_CONFLICT") {
        handleVersionConflict(error, "delete");
        return;
      }

      setStatus(error.message, "error");
    } finally {
      state.isSaving = false;
    }
  }

  function renderTagOptions() {
    if (!els.tagOptions) return;

    els.tagOptions.innerHTML = "";

    state.availableTags.forEach((tag) => {
      const option = document.createElement("option");
      option.value = tag.name;
      els.tagOptions.appendChild(option);
    });
  }

  function isTagSelected(tagId) {
    return state.selectedTags.some((tag) => tag.id === tagId);
  }

  function addTagToCurrentStudy(tag) {
    if (!tag || !tag.id || isTagSelected(tag.id)) {
      return;
    }

    state.selectedTags.push(tag);
    renderSelectedTags();
    renderTagManager();
    markDirty();
    setStatus(`${tag.name || "Tag"} added to this study.`, "success");
  }

  function renderSelectedTags() {
    els.tagList.innerHTML = "";
    els.tagCount.textContent = String(state.selectedTags.length);

    state.selectedTags.forEach((tag, index) => {
      const chip = document.createElement("span");
      chip.className = "study-tag";
      chip.style.backgroundColor = tag.color || "#eef4ff";
      chip.style.borderColor = tag.color || "#d6e0ff";

      const text = document.createElement("span");
      text.textContent = tag.name || "Tag";

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.setAttribute("aria-label", `Remove ${tag.name || "tag"}`);
      removeButton.textContent = "×";
      removeButton.addEventListener("click", () => {
        state.selectedTags.splice(index, 1);
        renderSelectedTags();
        markDirty();
      });

      chip.append(text, removeButton);
      els.tagList.appendChild(chip);
    });
  }

  async function addTag() {
    const raw = els.tagInput.value.trim();

    if (!raw) return;

    const name = raw.replace(/\s+/g, " ");
    const existing = state.availableTags.find((tag) => tag.name.toLowerCase() === name.toLowerCase());
    let tag = existing;

    try {
      if (!tag) {
        const result = await fetchJson("/api/study-tags", {
          method: "POST",
          body: JSON.stringify({ name })
        });

        tag = result.tag;
        state.availableTags.push(tag);
        state.availableTags.sort((a, b) => a.name.localeCompare(b.name));
        renderTagOptions();
      }

      const alreadySelected = state.selectedTags.some((item) => item.id === tag.id);

      if (!alreadySelected) {
        state.selectedTags.push(tag);
        renderSelectedTags();
        markDirty();
      }

      els.tagInput.value = "";
      els.tagInput.focus();
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function reorderLinkedScripture(fromIndex, toIndex) {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= state.linkedScriptures.length ||
      toIndex >= state.linkedScriptures.length
    ) {
      return;
    }

    const [item] = state.linkedScriptures.splice(fromIndex, 1);
    state.linkedScriptures.splice(toIndex, 0, item);

    if (state.editingScriptureIndex === fromIndex) {
      state.editingScriptureIndex = toIndex;
    } else if (state.editingScriptureIndex !== null) {
      if (fromIndex < state.editingScriptureIndex && toIndex >= state.editingScriptureIndex) {
        state.editingScriptureIndex -= 1;
      } else if (fromIndex > state.editingScriptureIndex && toIndex <= state.editingScriptureIndex) {
        state.editingScriptureIndex += 1;
      }
    }

    renderLinkedScriptures();
    markDirty();
  }

  function reorderLinkedScriptureFromKeyboard(index, direction) {
    const newIndex = index + direction;

    if (newIndex < 0 || newIndex >= state.linkedScriptures.length) {
      return;
    }

    reorderLinkedScripture(index, newIndex);

    window.requestAnimationFrame(() => {
      const handle = els.scriptureList.querySelector(
        `.linked-scripture-drag-handle[data-scripture-index="${newIndex}"]`
      );

      if (handle) {
        handle.focus();
      }
    });
  }

  let linkedScriptureDrag = null;

  function getLinkedScriptureAutoScrollSpeed(clientY) {
    const edgeSize = Math.min(110, Math.max(70, window.innerHeight * 0.12));

    if (clientY < edgeSize) {
      return Math.max(-22, -Math.ceil((edgeSize - clientY) / 5));
    }

    if (clientY > window.innerHeight - edgeSize) {
      return Math.min(22, Math.ceil((clientY - (window.innerHeight - edgeSize)) / 5));
    }

    return 0;
  }

  function runLinkedScriptureAutoScroll() {
    if (!linkedScriptureDrag) return;

    linkedScriptureDrag.autoScrollFrame = null;

    if (!linkedScriptureDrag.autoScrollSpeed) return;

    window.scrollBy(0, linkedScriptureDrag.autoScrollSpeed);
    updateLinkedScriptureDragPosition(linkedScriptureDrag.lastClientY);
    linkedScriptureDrag.autoScrollFrame = window.requestAnimationFrame(runLinkedScriptureAutoScroll);
  }

  function updateLinkedScriptureAutoScroll(clientY) {
    if (!linkedScriptureDrag) return;

    linkedScriptureDrag.lastClientY = clientY;
    linkedScriptureDrag.autoScrollSpeed = getLinkedScriptureAutoScrollSpeed(clientY);

    if (linkedScriptureDrag.autoScrollSpeed && !linkedScriptureDrag.autoScrollFrame) {
      linkedScriptureDrag.autoScrollFrame = window.requestAnimationFrame(runLinkedScriptureAutoScroll);
    }
  }

  function updateLinkedScriptureDragPosition(clientY) {
    if (!linkedScriptureDrag) return;

    const { card } = linkedScriptureDrag;
    const siblings = Array.from(els.scriptureList.children).filter((item) => item !== card);
    const insertBeforeCard = siblings.find((item) => {
      const rect = item.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2;
    });

    if (insertBeforeCard) {
      els.scriptureList.insertBefore(card, insertBeforeCard);
    } else {
      els.scriptureList.appendChild(card);
    }
  }

  function finishLinkedScriptureDrag(commit = true) {
    if (!linkedScriptureDrag) return;

    const {
      card,
      startIndex,
      pointerMoveHandler,
      pointerUpHandler,
      pointerCancelHandler,
      autoScrollFrame
    } = linkedScriptureDrag;
    const endIndex = Array.from(els.scriptureList.children).indexOf(card);

    if (autoScrollFrame) {
      window.cancelAnimationFrame(autoScrollFrame);
    }

    document.removeEventListener("pointermove", pointerMoveHandler);
    document.removeEventListener("pointerup", pointerUpHandler);
    document.removeEventListener("pointercancel", pointerCancelHandler);

    card.classList.remove("is-dragging");
    els.scriptureList.classList.remove("is-reordering");
    document.body.classList.remove("is-reordering-linked-scripture");
    linkedScriptureDrag = null;

    if (!commit || endIndex < 0 || endIndex === startIndex) {
      renderLinkedScriptures();
      return;
    }

    reorderLinkedScripture(startIndex, endIndex);
  }

  function beginLinkedScriptureDrag(event, card, index) {
    if (
      linkedScriptureDrag ||
      state.linkedScriptures.length < 2 ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const pointerId = event.pointerId;

    const pointerMoveHandler = (moveEvent) => {
      if (!linkedScriptureDrag || moveEvent.pointerId !== pointerId) return;

      moveEvent.preventDefault();
      updateLinkedScriptureAutoScroll(moveEvent.clientY);
      updateLinkedScriptureDragPosition(moveEvent.clientY);
    };

    const pointerUpHandler = (upEvent) => {
      if (!linkedScriptureDrag || upEvent.pointerId !== pointerId) return;
      finishLinkedScriptureDrag(true);
    };

    const pointerCancelHandler = (cancelEvent) => {
      if (!linkedScriptureDrag || cancelEvent.pointerId !== pointerId) return;
      finishLinkedScriptureDrag(false);
    };

    linkedScriptureDrag = {
      card,
      startIndex: index,
      pointerMoveHandler,
      pointerUpHandler,
      pointerCancelHandler,
      lastClientY: event.clientY,
      autoScrollSpeed: 0,
      autoScrollFrame: null
    };

    card.classList.add("is-dragging");
    els.scriptureList.classList.add("is-reordering");
    document.body.classList.add("is-reordering-linked-scripture");

    document.addEventListener("pointermove", pointerMoveHandler, { passive: false });
    document.addEventListener("pointerup", pointerUpHandler);
    document.addEventListener("pointercancel", pointerCancelHandler);
  }

  function beginLinkedScriptureEdit(index) {
    state.editingScriptureIndex = index;
    renderLinkedScriptures();

    const editor = els.scriptureList.querySelector(`[data-linked-scripture-editor="${index}"]`);
    const input = editor?.querySelector("input");

    if (input) {
      input.focus();
      input.select();
    }
  }

  function cancelLinkedScriptureEdit() {
    state.editingScriptureIndex = null;
    renderLinkedScriptures();
  }

  function saveLinkedScriptureEdit(index, referenceInput, noteInput) {
    const reference = normalizeScriptureReference(referenceInput.value);
    const note = noteInput.value.trim();

    if (!reference) {
      referenceInput.focus();
      return;
    }

    state.linkedScriptures[index] = { reference, note };
    state.editingScriptureIndex = null;
    renderLinkedScriptures();
    markDirty();
    setStatus("Linked Scripture updated.", "success");
  }

  function deleteLinkedScripture(index) {
    state.linkedScriptures.splice(index, 1);
    state.editingScriptureIndex = null;
    renderLinkedScriptures();
    markDirty();
  }

  function renderLinkedScriptureEditor(item, index) {
    const editor = document.createElement("div");
    editor.className = "linked-scripture-edit-form";
    editor.dataset.linkedScriptureEditor = String(index);

    const referenceLabel = document.createElement("label");
    referenceLabel.textContent = "Reference";

    const referenceInput = document.createElement("input");
    referenceInput.type = "text";
    referenceInput.value = item.reference || "";
    referenceInput.placeholder = "Reference, e.g. John 3:16";

    referenceLabel.appendChild(referenceInput);

    const noteLabel = document.createElement("label");
    noteLabel.textContent = "Note";

    const noteInput = document.createElement("textarea");
    noteInput.rows = 3;
    noteInput.value = item.note || "";
    noteInput.placeholder = "Optional note or short reminder";

    noteLabel.appendChild(noteInput);

    const actions = document.createElement("div");
    actions.className = "linked-scripture-edit-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "study-primary-button";
    saveButton.textContent = "Save Changes";
    saveButton.addEventListener("click", () => saveLinkedScriptureEdit(index, referenceInput, noteInput));

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "study-secondary-button";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", cancelLinkedScriptureEdit);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "study-danger-button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteLinkedScripture(index));

    actions.append(saveButton, cancelButton, deleteButton);

    editor.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        saveLinkedScriptureEdit(index, referenceInput, noteInput);
      }

      if (event.key === "Escape") {
        event.preventDefault();
        cancelLinkedScriptureEdit();
      }
    });

    editor.append(referenceLabel, noteLabel, actions);
    return editor;
  }

  function renderLinkedScriptures() {
    els.scriptureList.innerHTML = "";
    els.scriptureCount.textContent = String(state.linkedScriptures.length);

    state.linkedScriptures.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "linked-scripture-item";
      card.classList.toggle("is-editing", state.editingScriptureIndex === index);

      if (state.editingScriptureIndex === index) {
        card.appendChild(renderLinkedScriptureEditor(item, index));
        els.scriptureList.appendChild(card);
        return;
      }

      const main = document.createElement("div");
      main.className = "linked-scripture-main";

      const reference = document.createElement("strong");
      reference.textContent = item.reference || "Scripture";

      const note = document.createElement("p");
      note.textContent = item.note || "No note added.";

      const footerActions = document.createElement("div");
      footerActions.className = "linked-scripture-card-links";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "linked-scripture-text-button";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", (event) => {
        event.stopPropagation();
        beginLinkedScriptureEdit(index);
      });

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "linked-scripture-text-button is-danger";
      removeButton.textContent = "Delete";
      removeButton.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteLinkedScripture(index);
      });

      footerActions.append(editButton, removeButton);
      main.append(reference, note, footerActions);

      const dragHandle = document.createElement("button");
      dragHandle.type = "button";
      dragHandle.className = "linked-scripture-drag-handle";
      dragHandle.dataset.scriptureIndex = String(index);
      dragHandle.innerHTML = '<span aria-hidden="true">⋮⋮</span>';
      dragHandle.setAttribute(
        "aria-label",
        `Drag ${item.reference || "linked Scripture"} to reorder. Use arrow keys when focused.`
      );
      dragHandle.title = "Drag to reorder";
      dragHandle.addEventListener("pointerdown", (event) => beginLinkedScriptureDrag(event, card, index));
      dragHandle.addEventListener("keydown", (event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          reorderLinkedScriptureFromKeyboard(index, -1);
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          reorderLinkedScriptureFromKeyboard(index, 1);
        }
      });

      card.addEventListener("dblclick", (event) => {
        if (event.target.closest("button")) return;
        beginLinkedScriptureEdit(index);
      });

      card.append(main, dragHandle);
      els.scriptureList.appendChild(card);
    });
  }

  function updateAddScriptureButtonState() {
    els.addScripture.disabled = !normalizeName(els.scriptureReference.value);
  }

  function addLinkedScripture() {
    const reference = normalizeScriptureReference(els.scriptureReference.value);
    const note = els.scriptureNote.value.trim();

    if (!reference) {
      updateAddScriptureButtonState();
      els.scriptureReference.focus();
      return;
    }

    state.linkedScriptures.push({ reference, note });
    state.editingScriptureIndex = null;

    els.scriptureReference.value = "";
    els.scriptureNote.value = "";
    updateAddScriptureButtonState();
    renderLinkedScriptures();
    markDirty();
  }

  function getPreviewBibleState() {
    const params = new URLSearchParams(window.location.search);
    const urlBibleId = params.get("bible") || params.get("version") || params.get("bibleId") || "";

    if (urlBibleId) {
      return {
        bibleId: urlBibleId,
        bibleAbbr: params.get("bibleAbbr") || params.get("abbr") || ""
      };
    }

    if (window.UserPreferences && typeof window.UserPreferences.read === "function") {
      const preferences = window.UserPreferences.read();
      return {
        bibleId: preferences.bibleId || DEFAULT_BIBLE_ID,
        bibleAbbr: preferences.bibleAbbr || DEFAULT_BIBLE_ABBR
      };
    }

    try {
      const preferences = JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) || "{}");
      return {
        bibleId: preferences.bibleId || DEFAULT_BIBLE_ID,
        bibleAbbr: preferences.bibleAbbr || DEFAULT_BIBLE_ABBR
      };
    } catch (error) {
      return {
        bibleId: DEFAULT_BIBLE_ID,
        bibleAbbr: DEFAULT_BIBLE_ABBR
      };
    }
  }

  function createScripturePreviewPopup() {
    const popup = document.createElement("section");
    popup.className = "study-scripture-popup";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-live", "polite");
    popup.hidden = true;
    popup.innerHTML = `
      <div class="study-scripture-popup-header">
        <h3></h3>
        <button type="button" aria-label="Close Scripture preview">×</button>
      </div>
      <div class="study-scripture-popup-body">
        <p>Loading...</p>
      </div>
    `;

    popup.querySelector("button")?.addEventListener("click", closeScripturePreviewPopup);
    popup.addEventListener("click", (event) => event.stopPropagation());
    document.body.appendChild(popup);
    return popup;
  }

  function getScripturePreviewPopup() {
    let popup = document.getElementById("study-scripture-popup");

    if (!popup) {
      popup = createScripturePreviewPopup();
      popup.id = "study-scripture-popup";
    }

    return popup;
  }

  function closeScripturePreviewPopup() {
    const popup = document.getElementById("study-scripture-popup");

    if (!popup) return;

    popup.hidden = true;
    activeScripturePopupAnchor = null;
  }

  function setScripturePreviewPopupContent(title, content, isError = false) {
    const popup = getScripturePreviewPopup();
    const heading = popup.querySelector("h3");
    const body = popup.querySelector(".study-scripture-popup-body");

    if (heading) {
      heading.textContent = title || "Scripture";
    }

    if (body) {
      body.innerHTML = isError
        ? `<p class="study-scripture-popup-error">${escapeHtml(content || "Could not load this Scripture.")}</p>`
        : content || "<p>No Scripture text was returned.</p>";
    }
  }

  function positionScripturePreviewPopup(anchor) {
    const popup = getScripturePreviewPopup();
    const rect = anchor.getBoundingClientRect();
    const margin = 12;

    popup.hidden = false;
    popup.style.left = "0px";
    popup.style.top = "0px";

    const popupRect = popup.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 8;

    if (left + popupRect.width + margin > window.innerWidth) {
      left = window.innerWidth - popupRect.width - margin;
    }

    if (left < margin) {
      left = margin;
    }

    if (top + popupRect.height + margin > window.innerHeight) {
      top = rect.top - popupRect.height - 8;
    }

    if (top < margin) {
      top = margin;
    }

    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;
  }

  function normalizeScriptureReferenceText(reference) {
    return normalizeName(reference)
      .replace(/[–—−]/g, "-")
      .replace(/\s*-\s*/g, "-");
  }

  function parseLinkedScriptureReference(reference) {
    const cleanReference = normalizeScriptureReferenceText(reference);
    let match = cleanReference.match(/^(.+?)\s+(\d+)\s*:\s*(\d+)(?:\s*-\s*(?:(\d+)\s*:\s*)?(\d+))?$/);

    if (match) {
      const chapter = Number(match[2]);
      const startVerse = Number(match[3]);
      const endChapter = match[4] ? Number(match[4]) : chapter;
      const endVerse = match[5] ? Number(match[5]) : startVerse;

      if (!chapter || !startVerse || !endChapter || !endVerse) {
        return null;
      }

      return {
        book: normalizeName(match[1]),
        chapter,
        startVerse,
        endChapter,
        endVerse,
        isRange: chapter !== endChapter || startVerse !== endVerse,
        isChapterReference: false
      };
    }

    match = cleanReference.match(/^(.+?)\s+(\d+)(?:\s*-\s*(\d+))?$/);

    if (!match) {
      return null;
    }

    const chapter = Number(match[2]);
    const endChapter = match[3] ? Number(match[3]) : chapter;

    if (!chapter || !endChapter || endChapter < chapter) {
      return null;
    }

    return {
      book: normalizeName(match[1]),
      chapter,
      startVerse: null,
      endChapter,
      endVerse: null,
      isRange: chapter !== endChapter,
      isChapterReference: true
    };
  }

  function parseVerseReferenceParts(reference) {
    const cleanReference = normalizeScriptureReferenceText(reference);
    const match = cleanReference.match(/^(.+?)\s+(\d+)\s*:\s*(\d+)$/);

    if (!match) {
      return null;
    }

    return {
      book: normalizeName(match[1]).toLowerCase(),
      chapter: Number(match[2]),
      verse: Number(match[3])
    };
  }

  function isVerseInsideLinkedReference(verseReference, parsedReference) {
    const verseParts = parseVerseReferenceParts(verseReference);

    if (!verseParts || !parsedReference) {
      return false;
    }

    if (verseParts.book !== parsedReference.book.toLowerCase()) {
      return false;
    }

    if (parsedReference.startVerse === null) {
      return (
        verseParts.chapter >= parsedReference.chapter &&
        verseParts.chapter <= parsedReference.endChapter
      );
    }

    if (parsedReference.chapter === parsedReference.endChapter) {
      return (
        verseParts.chapter === parsedReference.chapter &&
        verseParts.verse >= parsedReference.startVerse &&
        verseParts.verse <= parsedReference.endVerse
      );
    }

    if (verseParts.chapter === parsedReference.chapter) {
      return verseParts.verse >= parsedReference.startVerse;
    }

    if (verseParts.chapter === parsedReference.endChapter) {
      return verseParts.verse <= parsedReference.endVerse;
    }

    return verseParts.chapter > parsedReference.chapter && verseParts.chapter < parsedReference.endChapter;
  }

  function getVerseNumberFromReference(reference) {
    const verseParts = parseVerseReferenceParts(reference);
    return verseParts ? verseParts.verse : "";
  }

  function getExpectedVerseCount(parsedReference) {
    if (!parsedReference || parsedReference.chapter !== parsedReference.endChapter) {
      return null;
    }

    return Math.max(1, parsedReference.endVerse - parsedReference.startVerse + 1);
  }

  function hasEnoughExactVerses(exactVerses, parsedReference) {
    if (!parsedReference) {
      return false;
    }

    if (!parsedReference.isRange) {
      return exactVerses.length >= 1;
    }

    const expectedCount = getExpectedVerseCount(parsedReference);

    if (!expectedCount) {
      return exactVerses.length > 1;
    }

    return exactVerses.length >= expectedCount;
  }

  function buildVersePreviewContent(verses) {
    return verses
      .map((verse) => {
        const number = getVerseNumberFromReference(verse.reference);
        const text = escapeHtml(verse.text || "");
        const verseNumber = number ? `<sup>${number}</sup>` : "";
        return `<p>${verseNumber}${text}</p>`;
      })
      .join("");
  }

  function cleanApiBiblePassageContent(content) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = content || "";

    wrapper.querySelectorAll(".s, .s1, .s2, .s3, .s4, .r, .sr, .mr, .ms, .ms1, .d").forEach((node) => {
      node.remove();
    });

    return wrapper.innerHTML.trim();
  }

  async function fetchPreviewBibleApiJson(url, fallbackMessage) {
    const response = await fetch(url, {
      headers: {
        "api-key": API_KEY
      }
    });

    const result = await response.json();

    if (
      result.meta &&
      result.meta.fumsId &&
      window._BAPI &&
      typeof window._BAPI.t === "function"
    ) {
      try {
        window._BAPI.t(result.meta.fumsId);
      } catch (error) {
        console.warn("FUMS tracking failed:", error);
      }
    }

    if (!response.ok) {
      throw new Error(result.message || fallbackMessage || "Could not load this Scripture.");
    }

    return result;
  }

  function normalizePreviewBookKey(value) {
    return normalizeName(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function getPreviewBookLookupKeys(book) {
    const keys = new Set();

    [book?.id, book?.abbreviation, book?.name, book?.nameLong].forEach((value) => {
      const key = normalizePreviewBookKey(value);
      if (key) keys.add(key);
    });

    return keys;
  }

  async function getPreviewBibleBooks(bibleState) {
    if (linkedScriptureBookCache.has(bibleState.bibleId)) {
      return linkedScriptureBookCache.get(bibleState.bibleId);
    }

    const booksUrl =
      `https://api.scripture.api.bible/v1/bibles/${encodeURIComponent(bibleState.bibleId)}` +
      "/books?include-chapters=true";

    const booksResult = await fetchPreviewBibleApiJson(
      booksUrl,
      `Could not load the books for ${bibleState.bibleAbbr || "the selected Bible"}.`
    );

    const books = Array.isArray(booksResult.data) ? booksResult.data : [];
    linkedScriptureBookCache.set(bibleState.bibleId, books);
    return books;
  }

  function findPreviewBibleBook(books, requestedBook) {
    const requestedKey = normalizePreviewBookKey(requestedBook);
    const alternateKeys = new Set([requestedKey]);

    if (requestedKey === "songofsolomon") alternateKeys.add("songofsongs");
    if (requestedKey === "songofsongs") alternateKeys.add("songofsolomon");
    if (requestedKey === "psalm") alternateKeys.add("psalms");
    if (requestedKey === "psalms") alternateKeys.add("psalm");

    return books.find((book) => {
      const bookKeys = getPreviewBookLookupKeys(book);
      return Array.from(alternateKeys).some((key) => bookKeys.has(key));
    }) || null;
  }

  async function fetchLinkedChapterRangePreview(parsedReference, bibleState, cleanReference) {
    const books = await getPreviewBibleBooks(bibleState);
    const resolvedBook = findPreviewBibleBook(books, parsedReference.book);

    if (!resolvedBook?.id) {
      throw new Error(
        `Could not resolve ${parsedReference.book} in ${bibleState.bibleAbbr || "the selected Bible"}.`
      );
    }

    let availableChapters = Array.isArray(resolvedBook.chapters)
      ? resolvedBook.chapters
      : [];

    if (!availableChapters.length) {
      const chaptersUrl =
        `https://api.scripture.api.bible/v1/bibles/${encodeURIComponent(bibleState.bibleId)}` +
        `/books/${encodeURIComponent(resolvedBook.id)}/chapters`;

      const chaptersResult = await fetchPreviewBibleApiJson(
        chaptersUrl,
        `Could not load the chapters for ${parsedReference.book}.`
      );

      availableChapters = Array.isArray(chaptersResult.data)
        ? chaptersResult.data
        : [];
    }

    const chapterByNumber = new Map();

    availableChapters.forEach((chapter) => {
      const number = Number(chapter.number);

      if (Number.isInteger(number) && number > 0 && chapter.id) {
        chapterByNumber.set(number, chapter.id);
      }
    });

    const requestedChapters = [];

    for (
      let chapterNumber = parsedReference.chapter;
      chapterNumber <= parsedReference.endChapter;
      chapterNumber += 1
    ) {
      const chapterId = chapterByNumber.get(chapterNumber);

      if (!chapterId) {
        throw new Error(
          `Could not find ${parsedReference.book} ${chapterNumber} in ${bibleState.bibleAbbr || "the selected Bible"}.`
        );
      }

      requestedChapters.push({
        number: chapterNumber,
        id: chapterId
      });
    }

    const chapterResults = [];

    for (const chapter of requestedChapters) {
      const chapterUrl =
        `https://api.scripture.api.bible/v1/bibles/${encodeURIComponent(bibleState.bibleId)}` +
        `/chapters/${encodeURIComponent(chapter.id)}` +
        "?content-type=html" +
        "&include-notes=false" +
        "&include-titles=false" +
        "&include-chapter-numbers=false" +
        "&include-verse-numbers=true" +
        "&include-verse-spans=false";

      const chapterResult = await fetchPreviewBibleApiJson(
        chapterUrl,
        `Could not load ${parsedReference.book} ${chapter.number}.`
      );

      const content = cleanApiBiblePassageContent(chapterResult.data?.content || "");

      if (!content) {
        throw new Error(`No Scripture text was returned for ${parsedReference.book} ${chapter.number}.`);
      }

      chapterResults.push(
        `<h4>${escapeHtml(`${parsedReference.book} ${chapter.number}`)}</h4>${content}`
      );
    }

    return {
      reference: cleanReference,
      content: chapterResults.join("")
    };
  }

  async function fetchLinkedScripturePreview(reference) {
    const cleanReference = normalizeScriptureReferenceText(reference);
    const parsedReference = parseLinkedScriptureReference(cleanReference);
    const bibleState = getPreviewBibleState();

    if (!cleanReference) {
      throw new Error("No Scripture reference was provided.");
    }

    if (!bibleState.bibleId) {
      throw new Error("No Bible version is selected.");
    }

    if (typeof API_KEY === "undefined" || !API_KEY) {
      throw new Error("The Bible API key is not available.");
    }

    const cacheKey = `${bibleState.bibleId}::${cleanReference}`;

    if (linkedScripturePreviewCache.has(cacheKey)) {
      return linkedScripturePreviewCache.get(cacheKey);
    }

    if (parsedReference?.isChapterReference) {
      const chapterPreview = await fetchLinkedChapterRangePreview(
        parsedReference,
        bibleState,
        cleanReference
      );

      linkedScripturePreviewCache.set(cacheKey, chapterPreview);
      return chapterPreview;
    }

    const pageLimit = 50;
    const maxPages = 100;
    const verses = [];
    const verseKeys = new Set();
    let firstPassage = null;

    for (let page = 0; page < maxPages; page += 1) {
      const offset = page * pageLimit;
      const url =
        `https://api.scripture.api.bible/v1/bibles/${encodeURIComponent(bibleState.bibleId)}` +
        `/search?query=${encodeURIComponent(cleanReference)}&limit=${pageLimit}&offset=${offset}`;

      const response = await fetch(url, {
        headers: {
          "api-key": API_KEY
        }
      });

      const result = await response.json();

      if (
        result.meta &&
        result.meta.fumsId &&
        window._BAPI &&
        typeof window._BAPI.t === "function"
      ) {
        try {
          window._BAPI.t(result.meta.fumsId);
        } catch (error) {
          console.warn("FUMS tracking failed:", error);
        }
      }

      if (!response.ok) {
        throw new Error(result.message || "Could not load this Scripture.");
      }

      if (!firstPassage) {
        firstPassage = Array.isArray(result.data?.passages)
          ? result.data.passages[0] || null
          : null;
      }

      const pageVerses = Array.isArray(result.data?.verses)
        ? result.data.verses
        : [];
      const verseCountBeforePage = verseKeys.size;

      pageVerses.forEach((verse) => {
        const key = verse.id || verse.reference || `${verse.bookId || ""}:${verse.chapterId || ""}:${verse.text || ""}`;

        if (!verseKeys.has(key)) {
          verseKeys.add(key);
          verses.push(verse);
        }
      });

      if (
        pageVerses.length < pageLimit ||
        verseKeys.size === verseCountBeforePage
      ) {
        break;
      }
    }

    const exactVerses = parsedReference
      ? verses.filter((verse) => isVerseInsideLinkedReference(verse.reference, parsedReference))
      : [];

    exactVerses.sort((left, right) => {
      const leftParts = parseVerseReferenceParts(left.reference);
      const rightParts = parseVerseReferenceParts(right.reference);

      if (!leftParts || !rightParts) return 0;
      return (leftParts.chapter - rightParts.chapter) || (leftParts.verse - rightParts.verse);
    });

    let preview = null;

    if (exactVerses.length) {
      preview = {
        reference: cleanReference,
        content: buildVersePreviewContent(exactVerses)
      };
    } else if (firstPassage) {
      preview = {
        reference: cleanReference,
        content: cleanApiBiblePassageContent(firstPassage.content || "")
      };
    } else if (!parsedReference?.isRange && verses[0]) {
      preview = {
        reference: verses[0].reference || cleanReference,
        content: buildVersePreviewContent([verses[0]])
      };
    }

    if (!preview || !preview.content) {
      throw new Error(`Could not find ${cleanReference} in ${bibleState.bibleAbbr || "the selected Bible"}.`);
    }

    linkedScripturePreviewCache.set(cacheKey, preview);
    return preview;
  }

  async function openLinkedScripturePreview(anchor, item) {
    const reference = item.reference || "Scripture";
    activeScripturePopupAnchor = anchor;
    setScripturePreviewPopupContent(reference, "<p>Loading...</p>");
    positionScripturePreviewPopup(anchor);

    try {
      const preview = await fetchLinkedScripturePreview(reference);

      if (activeScripturePopupAnchor !== anchor) return;

      setScripturePreviewPopupContent(preview.reference || reference, preview.content);
      positionScripturePreviewPopup(anchor);
    } catch (error) {
      if (activeScripturePopupAnchor !== anchor) return;

      console.error("Linked Scripture preview failed:", error);
      setScripturePreviewPopupContent(reference, error.message || "Could not load this Scripture.", true);
      positionScripturePreviewPopup(anchor);
    }
  }

  function renderPreviewTags(container, tags) {
    container.innerHTML = "";

    tags.forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "study-tag";
      chip.style.backgroundColor = tag.color || "#eef4ff";
      chip.style.borderColor = tag.color || "#d6e0ff";
      chip.textContent = tag.name || "Tag";
      container.appendChild(chip);
    });
  }

  function renderPreviewScriptures() {
    els.previewLinkedScriptures.innerHTML = "";

    if (!state.linkedScriptures.length) {
      const empty = document.createElement("p");
      empty.textContent = "No Referenced Scriptures yet.";
      els.previewLinkedScriptures.appendChild(empty);
      return;
    }

    state.linkedScriptures.forEach((item) => {
      const card = document.createElement("div");
      card.className = "preview-scripture-item";

      const reference = document.createElement("button");
      reference.type = "button";
      reference.className = "study-reference-link";
      reference.textContent = item.reference || "Scripture";
      reference.setAttribute("aria-label", `Open ${item.reference || "Scripture"}`);
      reference.addEventListener("click", (event) => {
        event.preventDefault();
        openLinkedScripturePreview(reference, item);
      });

      const note = document.createElement("p");
      note.textContent = item.note || "";

      card.append(reference);

      if (note.textContent) {
        card.appendChild(note);
      }

      els.previewLinkedScriptures.appendChild(card);
    });
  }

  function renderPreview() {
    const data = collectStudyData();

    els.previewType.textContent = data.categoryId ? getCategoryName(data.categoryId) : "";
    els.previewDate.textContent = data.studyDate ? formatDate(data.studyDate) : "";
    els.previewSpeaker.textContent = data.speaker || "";
    els.previewLocation.textContent = data.location || "";
    els.previewTitle.textContent = data.title || "Untitled Study";
    els.previewContent.innerHTML = data.contentHtml || "<p>No study notes yet.</p>";

    renderPreviewTags(els.previewTags, state.selectedTags);
    renderPreviewScriptures();
  }

  function switchToPreview() {
    renderPreview();
    state.isPreview = true;
    els.form.hidden = true;
    els.preview.hidden = false;
    els.previewButton.hidden = true;
    els.editButton.hidden = false;
  
    // Preview is read-only.
    els.saveButton.disabled = true;
    els.deleteButton.disabled = true;
  
    els.modeLabel.textContent = "Preview";
  }

  function switchToEdit() {
    closeScripturePreviewPopup();
    state.isPreview = false;
    els.form.hidden = false;
    els.preview.hidden = true;
    els.previewButton.hidden = false;
    els.editButton.hidden = true;
  
    // Restore study management actions in Edit mode.
    els.saveButton.disabled = false;
    els.deleteButton.disabled = false;
  
    els.modeLabel.textContent = state.activeStudyId ? "Edit Study" : "New Study";
  }

  function openCategoryManager() {
    if (!els.categoryModal) return;
    if (!state.managedCategoryId && state.categories[0]) {
      state.managedCategoryId = state.categories[0].id;
    }
    ensureCategoryManagerInlineStyles();
    updateCategoryManagerIntroText();
    hideCategoryColorControls();
    renderCategoryManager();
    els.categoryModal.hidden = false;
    if (els.newCategoryName) els.newCategoryName.focus();
  }

  function closeCategoryManager() {
    if (!els.categoryModal) return;
    els.categoryModal.hidden = true;
    renderCategoryDropdown();
  }

  function openTagManager() {
    if (!els.tagManagerModal) return;
    updateTagManagerHeader();
    prepareTagManagerCreateSection();
    renderAddTagColorPicker();
    renderTagManager();
    els.tagManagerModal.hidden = false;

    if (state.managedTagId) {
      loadManagedTagScriptures(state.managedTagId, { force: true });
    } else if (els.newTagName) {
      els.newTagName.focus();
    }
  }

  function closeTagManager() {
    if (!els.tagManagerModal) return;

    managedTagScriptureLoadToken += 1;

    if (managedTagScriptureDrag) {
      finishManagedTagScriptureDrag(false);
    }

    els.tagManagerModal.hidden = true;
    renderTagOptions();
  }

  function updateTagManagerHeader() {
    if (!els.tagManagerModal) return;

    const eyebrow = els.tagManagerModal.querySelector(".study-modal-header .study-eyebrow");
    if (eyebrow) {
      eyebrow.hidden = true;
      eyebrow.style.display = "none";
    }

    const intro = els.tagManagerModal.querySelector(".study-modal-intro");
    if (intro) {
      intro.hidden = true;
      intro.style.display = "none";
    }
  }

  function createSectionHeading(eyebrow, title, description) {
    const heading = document.createElement("div");
    heading.className = "study-manager-section-heading";

    const small = document.createElement("p");
    small.className = "study-manager-small-label";
    small.textContent = eyebrow;

    const headline = document.createElement("h3");
    headline.textContent = title;

    heading.append(small, headline);

    if (description) {
      const note = document.createElement("p");
      note.className = "study-manager-section-note";
      note.textContent = description;
      heading.appendChild(note);
    }

    return heading;
  }

  function prepareTagManagerCreateSection() {
    const addCard = els.newTagName?.closest?.(".study-manager-add-card");
    if (!addCard) return;

    addCard.classList.add("study-manager-section-card", "study-manager-create-card");

    if (!addCard.querySelector("[data-tag-create-heading]")) {
      const heading = createSectionHeading(
        "Create New Tag",
        "Create a new tag",
        "Choose the name and color for a new tag before adding it to your private list."
      );
      heading.setAttribute("data-tag-create-heading", "true");
      addCard.prepend(heading);
    }

    const colorLabel = addCard.querySelector(".study-manager-color-section .study-manager-small-label");
    if (colorLabel) {
      colorLabel.textContent = "New tag color";
    }

    hideTagCustomColorInput();

    if (els.addManagedTag) {
      els.addManagedTag.textContent = "Create Tag";
    }
  }

  function updateCategoryManagerIntroText() {
    if (!els.categoryModal) return;

    const paragraphs = Array.from(els.categoryModal.querySelectorAll("p"));
    const intro = paragraphs.find((paragraph) =>
      /categories that appear/i.test(paragraph.textContent || "")
    );

    if (intro) {
      intro.textContent = "Add, rename, or remove the categories that appear in your Study Desk dropdown.";
    }
  }

  function ensureCategoryManagerInlineStyles() {
    if (document.getElementById("study-category-inline-editor-styles")) return;

    const style = document.createElement("style");
    style.id = "study-category-inline-editor-styles";
    style.textContent = `
      .study-category-inline-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 0.6rem;
        align-items: center;
        width: 100%;
        box-sizing: border-box;
        margin-bottom: 0.75rem;
        padding: 0.7rem;
        border: 1px solid rgba(15, 42, 80, 0.14);
        border-radius: 0.85rem;
        background: rgba(255, 255, 255, 0.9);
      }

      .study-category-inline-row.is-dirty {
        border-color: rgba(37, 99, 235, 0.6);
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
      }

      .study-category-inline-input {
        min-width: 0;
        width: 100%;
        box-sizing: border-box;
        border: 1px solid rgba(15, 42, 80, 0.16);
        border-radius: 0.7rem;
        padding: 0.65rem 0.75rem;
        font: inherit;
        font-weight: 700;
        color: #0f2a50;
        background: #fff;
      }

      .study-category-inline-input:focus {
        outline: none;
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
      }

      .study-category-inline-save,
      .study-category-inline-delete {
        white-space: nowrap;
        border-radius: 0.65rem;
        padding: 0.65rem 0.85rem;
        font-weight: 800;
        cursor: pointer;
      }

      .study-category-inline-save {
        border: 1px solid rgba(37, 99, 235, 0.25);
        color: #64748b;
        background: #eef2ff;
      }

      .study-category-inline-save.is-ready {
        color: #fff;
        background: #2563eb;
        border-color: #2563eb;
        box-shadow: 0 0.55rem 1.15rem rgba(37, 99, 235, 0.22);
      }

      .study-category-inline-save:disabled {
        cursor: default;
        opacity: 0.72;
      }

      .study-category-inline-delete {
        border: 1px solid rgba(185, 28, 28, 0.18);
        color: #991b1b;
        background: #fff1f2;
      }

      .study-category-inline-delete:hover {
        border-color: rgba(185, 28, 28, 0.35);
        background: #ffe4e6;
      }

      #category-manager-editor {
        display: none !important;
      }

      @media (max-width: 640px) {
        .study-category-inline-row {
          grid-template-columns: 1fr;
        }

        .study-category-inline-save,
        .study-category-inline-delete {
          width: 100%;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function createColorButton(color, activeColor, label, onSelect) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "study-manager-color-choice";
    button.style.setProperty("--manager-choice-color", color);
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(color.toLowerCase() === String(activeColor || "").toLowerCase()));
    button.addEventListener("click", () => onSelect(color));
    return button;
  }

  function renderColorPicker(container, activeColor, onSelect) {
    if (!container) return;
    container.innerHTML = "";

    MANAGER_COLORS.forEach((item) => {
      container.appendChild(createColorButton(item.value, activeColor, item.label, onSelect));
    });
  }

  function hideTagCustomColorInput() {
    if (!els.newTagCustomColor) return;
    els.newTagCustomColor.value = "";
    els.newTagCustomColor.hidden = true;
    els.newTagCustomColor.style.display = "none";
  }

  function hideCategoryColorControls() {
    ["new-category-color-picker", "new-category-custom-color"].forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.hidden = true;
        element.style.display = "none";
      }
    });

    const picker = document.getElementById("new-category-color-picker");
    const label = picker?.previousElementSibling;

    if (label && /color/i.test(label.textContent || "")) {
      label.hidden = true;
      label.style.display = "none";
    }
  }

  function getManagedCategory() {
    return state.categories.find((item) => item.id === state.managedCategoryId) || null;
  }

  function getManagedTag() {
    return state.availableTags.find((item) => item.id === state.managedTagId) || null;
  }

  function renderAddTagColorPicker() {
    renderColorPicker(els.newTagColorPicker, state.newTagColor, (color) => {
      state.newTagColor = color;
      renderAddTagColorPicker();
    });
  }

  function renderManagerListRow(item, selectedId, label, onSelect) {
    const row = document.createElement("div");
    row.className = "study-manager-list-row";
    row.classList.toggle("is-selected", item.id === selectedId);
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-pressed", String(item.id === selectedId));

    const selectDot = document.createElement("span");
    selectDot.className = "study-manager-select-dot";

    const name = document.createElement("span");
    name.className = "study-manager-row-name";
    name.textContent = item.name || label;

    if (label.toLowerCase() === "tag") {
      const colorSwatch = document.createElement("span");
      colorSwatch.className = "study-color-swatch";
      colorSwatch.style.backgroundColor = item.color || "#dbeafe";

      const nameGroup = document.createElement("span");
      nameGroup.className = "study-manager-row-name-group";
      nameGroup.appendChild(name);

      const scriptureCount = Math.max(0, Number(item.scriptureCount) || 0);
      const scriptureCountLabel = document.createElement("span");
      scriptureCountLabel.className = "study-manager-row-scripture-count";
      scriptureCountLabel.textContent = `${scriptureCount} ${scriptureCount === 1 ? "Scripture" : "Scriptures"}`;
      scriptureCountLabel.setAttribute(
        "aria-label",
        `${scriptureCount} ${scriptureCount === 1 ? "Scripture" : "Scriptures"} connected to ${item.name || "this tag"}`
      );
      nameGroup.appendChild(scriptureCountLabel);

      row.append(selectDot, colorSwatch, nameGroup);

      const isAdded = isTagSelected(item.id);
      const addToStudyButton = document.createElement("button");
      addToStudyButton.type = "button";
      addToStudyButton.className = "study-manager-row-action";
      addToStudyButton.textContent = isAdded ? "Added" : "Add to Study";
      addToStudyButton.disabled = isAdded;
      addToStudyButton.setAttribute(
        "aria-label",
        isAdded
          ? `${item.name || "Tag"} is already added to this study`
          : `Add ${item.name || "tag"} to this study`
      );

      addToStudyButton.addEventListener("click", (event) => {
        event.stopPropagation();
        addTagToCurrentStudy(item);
      });

      row.appendChild(addToStudyButton);
    } else {
      row.append(selectDot, name);
    }

    row.addEventListener("click", () => onSelect(item.id));
    row.addEventListener("keydown", (event) => {
      if (event.target?.closest?.("button")) {
        return;
      }

      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      onSelect(item.id);
    });

    return row;
  }

  function createManagerEditor(item, type) {
    const editor = document.createElement("div");
    editor.className = type === "tag"
      ? "study-manager-editor-card study-manager-section-card study-manager-edit-card"
      : "study-manager-editor-card";

    const heading = document.createElement("div");
    heading.className = "study-manager-editor-heading";

    const title = document.createElement("div");

    if (type === "tag") {
      const tagName = item.name || "selected tag";
      title.innerHTML = `<p class="study-manager-small-label">Edit Selected Tag</p><h3>${escapeHtml(tagName)}</h3><p class="study-manager-section-note">Changes here apply only to the selected existing tag.</p>`;
    } else {
      title.innerHTML = `<p class="study-manager-small-label">Selected ${type}</p><h3>Edit ${type}</h3>`;
    }

    const preview = document.createElement("span");
    preview.className = "study-manager-editor-preview";
    preview.style.backgroundColor = item.color || "#dbeafe";

    if (type === "tag") {
      heading.append(title, preview);
    } else {
      heading.append(title);
    }

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "study-manager-name-input";
    nameInput.value = item.name || "";
    nameInput.setAttribute("aria-label", `${type} name`);

    let selectedColor = normalizeColorValue(item.color) || "#dbeafe";

    const picker = document.createElement("div");
    picker.className = "study-manager-color-picker";

    const rerenderPicker = () => {
      renderColorPicker(picker, selectedColor, (color) => {
        selectedColor = color;
        preview.style.backgroundColor = color;
        rerenderPicker();
      });
    };

    nameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (type === "category") updateCategory(item, nameInput.value);
        if (type === "tag") updateTag(item, nameInput.value, selectedColor);
      }
    });

    rerenderPicker();

    const actions = document.createElement("div");
    actions.className = "study-manager-editor-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "study-primary-button";
    saveButton.textContent = type === "tag" ? "Save Tag Changes" : "Save Changes";
    saveButton.addEventListener("click", async () => {
      const originalText = saveButton.textContent;
      saveButton.disabled = true;
      saveButton.textContent = type === "tag" ? "Saving tag..." : "Saving...";

      try {
        if (type === "category") {
          await updateCategory(item, nameInput.value);
          return;
        }

        const finalColor = selectedColor || "#dbeafe";
        await updateTag(item, nameInput.value, finalColor);
      } finally {
        saveButton.disabled = false;
        saveButton.textContent = originalText;
      }
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "study-danger-button";
    deleteButton.textContent = type === "category" ? "Delete Category" : "Delete Tag";
    deleteButton.addEventListener("click", () => {
      if (type === "category") deleteCategory(item);
      if (type === "tag") deleteTag(item);
    });

    actions.append(saveButton, deleteButton);

    editor.append(heading, createSmallLabel(type === "tag" ? "Selected tag name" : "Name"), nameInput);

    if (type === "tag") {
      editor.append(
        document.createElement("hr"),
        createSmallLabel("Selected tag color"),
        picker
      );
    }

    editor.append(actions);

    if (type === "tag") {
      const divider = document.createElement("hr");
      divider.className = "tag-scripture-divider";
      editor.append(divider, createTagScriptureConnections(item));
    }

    return editor;
  }

  function createEmptyTagEditor() {
    const editor = document.createElement("div");
    editor.className = "study-manager-editor-card study-manager-section-card study-manager-edit-card study-manager-empty-editor";
    editor.appendChild(
      createSectionHeading(
        "Edit Selected Tag",
        "Select a tag to edit",
        "Choose a tag from the Existing Tags list above to change its name, color, or delete it."
      )
    );
    return editor;
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value || "");
    return div.innerHTML;
  }

  function createSmallLabel(text) {
    const label = document.createElement("p");
    label.className = "study-manager-small-label";
    label.textContent = text;
    return label;
  }

  function createCategoryInlineEditorRow(category) {
    const row = document.createElement("div");
    row.className = "study-category-inline-row";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "study-category-inline-input";
    input.value = category.name || "";
    input.setAttribute("aria-label", `Category name: ${category.name || "category"}`);

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "study-category-inline-save";
    saveButton.textContent = "Save";
    saveButton.disabled = true;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "study-category-inline-delete";
    deleteButton.textContent = "Delete";

    const updateSaveState = () => {
      const originalName = normalizeName(category.name);
      const currentName = normalizeName(input.value);
      const isDirty = !!currentName && currentName !== originalName;

      row.classList.toggle("is-dirty", isDirty);
      saveButton.disabled = !isDirty;
      saveButton.classList.toggle("is-ready", isDirty);
      saveButton.textContent = isDirty ? "Save Changes" : "Saved";
    };

    input.addEventListener("input", updateSaveState);

    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (!saveButton.disabled) updateCategory(category, input.value);
    });

    saveButton.addEventListener("click", () => {
      if (!saveButton.disabled) updateCategory(category, input.value);
    });

    deleteButton.addEventListener("click", () => {
      deleteCategory(category);
    });

    updateSaveState();
    row.append(input, saveButton, deleteButton);
    return row;
  }

  function renderCategoryManager() {
    if (!els.categoryList) return;

    ensureCategoryManagerInlineStyles();
    updateCategoryManagerIntroText();
    hideCategoryColorControls();

    els.categoryList.innerHTML = "";

    if (els.categoryEditor) {
      els.categoryEditor.innerHTML = "";
      els.categoryEditor.hidden = true;
    }

    if (!state.categories.length) {
      const empty = document.createElement("p");
      empty.className = "study-manager-empty";
      empty.textContent = "No categories yet.";
      els.categoryList.appendChild(empty);
      return;
    }

    state.categories.forEach((category) => {
      els.categoryList.appendChild(createCategoryInlineEditorRow(category));
    });
  }

  function resetManagedTagScriptureState(tagId = "") {
    state.managedTagScriptures = [];
    state.managedTagScripturesTagId = tagId;
    state.editingManagedTagScriptureId = "";
    state.isLoadingManagedTagScriptures = false;
    state.managedTagScriptureFeedback = null;
  }

  function setManagedTagScriptureFeedback(message, type = "") {
    const finalMessage = String(message || "").trim();
    const finalType = type || "";

    state.managedTagScriptureFeedback = finalMessage
      ? { message: finalMessage, type: finalType }
      : null;

    const feedback = els.tagManagerEditor?.querySelector(".tag-scripture-feedback");

    if (!feedback) return;

    feedback.textContent = finalMessage;
    feedback.hidden = !finalMessage;
    feedback.classList.toggle("is-error", finalType === "error");
    feedback.classList.toggle("is-warning", finalType === "warning");
    feedback.classList.toggle("is-success", finalType === "success");
    feedback.setAttribute("role", finalType === "error" ? "alert" : "status");
  }

  function getManagedTagScriptureErrorMessage(error) {
    const code = error?.data?.code || "";

    if (code === "TAG_SCRIPTURE_DUPLICATE") {
      return {
        type: "warning",
        message: "You already added that reference to this tag."
      };
    }

    if (code === "INVALID_SCRIPTURE_REFERENCE") {
      return {
        type: "error",
        message: "Enter a valid Scripture reference, for example John 3:16."
      };
    }

    return {
      type: "error",
      message: error?.message || "Failed to connect Scripture to tag."
    };
  }

  async function loadManagedTagScriptures(tagId, options = {}) {
    const normalizedTagId = String(tagId || "");
    const force = Boolean(options.force);

    if (!normalizedTagId) {
      resetManagedTagScriptureState();
      renderTagManager();
      return;
    }

    if (
      !force &&
      state.managedTagScripturesTagId === normalizedTagId &&
      !state.isLoadingManagedTagScriptures
    ) {
      return;
    }

    const loadToken = ++managedTagScriptureLoadToken;
    state.managedTagScripturesTagId = normalizedTagId;
    state.managedTagScriptures = [];
    state.editingManagedTagScriptureId = "";
    state.isLoadingManagedTagScriptures = true;
    renderTagManager();

    try {
      const result = await fetchJson(
        `/api/study-tags/${encodeURIComponent(normalizedTagId)}/scriptures`
      );

      if (
        loadToken !== managedTagScriptureLoadToken ||
        state.managedTagId !== normalizedTagId
      ) {
        return;
      }

      state.managedTagScriptures = Array.isArray(result.scriptures)
        ? result.scriptures
        : [];

      const loadedTag = state.availableTags.find((tag) => tag.id === normalizedTagId);
      if (loadedTag) {
        loadedTag.scriptureCount = state.managedTagScriptures.length;
      }
    } catch (error) {
      if (loadToken !== managedTagScriptureLoadToken) {
        return;
      }

      state.managedTagScriptures = [];
      setStatus(error.message || "Failed to load Scripture connections.", "error");
    } finally {
      if (
        loadToken === managedTagScriptureLoadToken &&
        state.managedTagId === normalizedTagId
      ) {
        state.isLoadingManagedTagScriptures = false;
        renderTagManager();
      }
    }
  }

  function selectManagedTag(tagId) {
    const normalizedTagId = String(tagId || "");

    if (!normalizedTagId) return;

    if (state.managedTagId !== normalizedTagId) {
      state.managedTagScriptureFeedback = null;
    }

    state.managedTagId = normalizedTagId;
    loadManagedTagScriptures(normalizedTagId, { force: true });
  }

  function updateManagedTagScriptureAddButton(referenceInput, button) {
    if (!referenceInput || !button) return;
    button.disabled = !normalizeName(referenceInput.value);
  }

  async function addManagedTagScripture(tag, referenceInput, noteInput, button) {
    if (!tag?.id || !referenceInput || !noteInput || !button) return;

    const reference = normalizeScriptureReference(referenceInput.value);
    const note = noteInput.value.trim();

    if (!reference) {
      setManagedTagScriptureFeedback(
        "Enter a valid Scripture reference, for example John 3:16.",
        "error"
      );
      referenceInput.focus();
      updateManagedTagScriptureAddButton(referenceInput, button);
      return;
    }

    setManagedTagScriptureFeedback("", "");
    referenceInput.value = reference;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Adding...";

    try {
      const result = await fetchJson(
        `/api/study-tags/${encodeURIComponent(tag.id)}/scriptures`,
        {
          method: "POST",
          body: JSON.stringify({ reference, note })
        }
      );

      if (state.managedTagId !== tag.id) return;

      state.managedTagScriptures.push(result.scripture);
      state.managedTagScripturesTagId = tag.id;
      state.editingManagedTagScriptureId = "";

      const currentTag = state.availableTags.find((item) => item.id === tag.id);
      if (currentTag) {
        currentTag.scriptureCount = state.managedTagScriptures.length;
      }

      setManagedTagScriptureFeedback(`${result.scripture.reference} added.`, "success");
      setStatus("Scripture connected to tag.", "success");
      renderTagManager();
    } catch (error) {
      const feedback = getManagedTagScriptureErrorMessage(error);
      setManagedTagScriptureFeedback(feedback.message, feedback.type);

      if (!error?.data?.code) {
        setStatus(error.message || "Failed to connect Scripture to tag.", "error");
      }

      button.disabled = false;
      button.textContent = originalText;
      referenceInput.focus();
    }
  }

  function beginManagedTagScriptureEdit(relationshipId) {
    state.editingManagedTagScriptureId = relationshipId;
    renderTagManager();

    window.requestAnimationFrame(() => {
      const input = els.tagManagerEditor?.querySelector(
        `[data-tag-scripture-editor="${relationshipId}"] input`
      );

      if (input) {
        input.focus();
        input.select();
      }
    });
  }

  function cancelManagedTagScriptureEdit() {
    state.editingManagedTagScriptureId = "";
    renderTagManager();
  }

  async function saveManagedTagScriptureEdit(
    tag,
    item,
    referenceInput,
    noteInput,
    button
  ) {
    if (!tag?.id || !item?.id || !referenceInput || !noteInput || !button) return;

    const reference = normalizeScriptureReference(referenceInput.value);
    const note = noteInput.value.trim();

    if (!reference) {
      setManagedTagScriptureFeedback(
        "Enter a valid Scripture reference, for example John 3:16.",
        "error"
      );
      referenceInput.focus();
      return;
    }

    setManagedTagScriptureFeedback("", "");
    referenceInput.value = reference;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Saving...";

    try {
      const result = await fetchJson(
        `/api/study-tags/${encodeURIComponent(tag.id)}/scriptures/${encodeURIComponent(item.id)}`,
        {
          method: "PUT",
          body: JSON.stringify({ reference, note })
        }
      );

      if (state.managedTagId !== tag.id) return;

      const index = state.managedTagScriptures.findIndex(
        (scripture) => scripture.id === item.id
      );

      if (index >= 0) {
        state.managedTagScriptures[index] = result.scripture;
      }

      state.editingManagedTagScriptureId = "";
      setStatus("Scripture connection updated.", "success");
      renderTagManager();
    } catch (error) {
      const feedback = getManagedTagScriptureErrorMessage(error);
      setManagedTagScriptureFeedback(feedback.message, feedback.type);

      if (!error?.data?.code) {
        setStatus(error.message || "Failed to update Scripture connection.", "error");
      }

      button.disabled = false;
      button.textContent = originalText;
      referenceInput.focus();
    }
  }

  async function deleteManagedTagScripture(tag, item) {
    if (!tag?.id || !item?.id) return;

    if (
      !confirm(
        `Remove ${item.reference || "this Scripture"} from ${tag.name || "this tag"}?`
      )
    ) {
      return;
    }

    try {
      await fetchJson(
        `/api/study-tags/${encodeURIComponent(tag.id)}/scriptures/${encodeURIComponent(item.id)}`,
        { method: "DELETE" }
      );

      if (state.managedTagId !== tag.id) return;

      state.managedTagScriptures = state.managedTagScriptures.filter(
        (scripture) => scripture.id !== item.id
      );

      const currentTag = state.availableTags.find((tagItem) => tagItem.id === tag.id);
      if (currentTag) {
        currentTag.scriptureCount = state.managedTagScriptures.length;
      }

      if (state.editingManagedTagScriptureId === item.id) {
        state.editingManagedTagScriptureId = "";
      }

      setManagedTagScriptureFeedback(`${item.reference || "Scripture"} removed.`, "success");
      setStatus("Scripture removed from tag.", "success");
      renderTagManager();
    } catch (error) {
      setStatus(error.message || "Failed to remove Scripture from tag.", "error");
    }
  }

  function persistManagedTagScriptureOrder(tagId, orderedIds) {
    managedTagScriptureReorderQueue = managedTagScriptureReorderQueue
      .then(() =>
        fetchJson(`/api/study-tags/${encodeURIComponent(tagId)}/scriptures/reorder`, {
          method: "PUT",
          body: JSON.stringify({ orderedIds })
        })
      )
      .catch((error) => {
        setStatus(error.message || "Failed to save Scripture order.", "error");

        if (state.managedTagId === tagId) {
          loadManagedTagScriptures(tagId, { force: true });
        }
      });

    return managedTagScriptureReorderQueue;
  }

  function applyManagedTagScriptureReorder(tagId, fromIndex, toIndex, focusId = "") {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= state.managedTagScriptures.length ||
      toIndex >= state.managedTagScriptures.length
    ) {
      renderTagManager();
      return;
    }

    const [item] = state.managedTagScriptures.splice(fromIndex, 1);
    state.managedTagScriptures.splice(toIndex, 0, item);
    state.managedTagScriptures.forEach((scripture, index) => {
      scripture.sortOrder = index;
    });

    const orderedIds = state.managedTagScriptures.map((scripture) => scripture.id);
    renderTagManager();
    persistManagedTagScriptureOrder(tagId, orderedIds);

    if (focusId) {
      window.requestAnimationFrame(() => {
        els.tagManagerEditor
          ?.querySelector(`[data-tag-scripture-drag-id="${focusId}"]`)
          ?.focus();
      });
    }
  }

  function reorderManagedTagScriptureFromKeyboard(tagId, index, direction) {
    const newIndex = index + direction;

    if (newIndex < 0 || newIndex >= state.managedTagScriptures.length) {
      return;
    }

    const focusId = state.managedTagScriptures[index]?.id || "";
    applyManagedTagScriptureReorder(tagId, index, newIndex, focusId);
  }

  function updateManagedTagScriptureDragPosition(clientY) {
    if (!managedTagScriptureDrag) return;

    const { card, list } = managedTagScriptureDrag;
    const siblings = Array.from(list.children).filter((child) => child !== card);
    const insertBeforeCard = siblings.find((child) => {
      const rect = child.getBoundingClientRect();
      return clientY < rect.top + rect.height / 2;
    });

    if (insertBeforeCard) {
      list.insertBefore(card, insertBeforeCard);
    } else {
      list.appendChild(card);
    }
  }

  function finishManagedTagScriptureDrag(commit = true) {
    if (!managedTagScriptureDrag) return;

    const {
      card,
      list,
      tagId,
      startIndex,
      pointerId,
      pointerMoveHandler,
      pointerUpHandler,
      pointerCancelHandler
    } = managedTagScriptureDrag;
    const endIndex = Array.from(list.children).indexOf(card);

    try {
      card.releasePointerCapture?.(pointerId);
    } catch (error) {
      // Pointer capture may already have been released by the browser.
    }

    document.removeEventListener("pointermove", pointerMoveHandler);
    document.removeEventListener("pointerup", pointerUpHandler);
    document.removeEventListener("pointercancel", pointerCancelHandler);

    card.classList.remove("is-dragging");
    list.classList.remove("is-reordering");
    document.body.classList.remove("is-reordering-linked-scripture");
    managedTagScriptureDrag = null;

    if (!commit || endIndex < 0 || endIndex === startIndex) {
      renderTagManager();
      return;
    }

    applyManagedTagScriptureReorder(tagId, startIndex, endIndex);
  }

  function beginManagedTagScriptureDrag(event, card, list, tagId, index) {
    if (
      managedTagScriptureDrag ||
      state.managedTagScriptures.length < 2 ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const pointerId = event.pointerId;
    const pointerMoveHandler = (moveEvent) => {
      if (
        !managedTagScriptureDrag ||
        moveEvent.pointerId !== pointerId
      ) {
        return;
      }

      moveEvent.preventDefault();
      updateManagedTagScriptureDragPosition(moveEvent.clientY);
    };
    const pointerUpHandler = (upEvent) => {
      if (!managedTagScriptureDrag || upEvent.pointerId !== pointerId) return;
      finishManagedTagScriptureDrag(true);
    };
    const pointerCancelHandler = (cancelEvent) => {
      if (!managedTagScriptureDrag || cancelEvent.pointerId !== pointerId) return;
      finishManagedTagScriptureDrag(false);
    };

    managedTagScriptureDrag = {
      card,
      list,
      tagId,
      startIndex: index,
      pointerId,
      pointerMoveHandler,
      pointerUpHandler,
      pointerCancelHandler
    };

    try {
      card.setPointerCapture?.(pointerId);
    } catch (error) {
      // The document listeners below still provide drag support.
    }

    card.classList.add("is-dragging");
    list.classList.add("is-reordering");
    document.body.classList.add("is-reordering-linked-scripture");

    document.addEventListener("pointermove", pointerMoveHandler, { passive: false });
    document.addEventListener("pointerup", pointerUpHandler);
    document.addEventListener("pointercancel", pointerCancelHandler);
  }

  function renderManagedTagScriptureEditor(tag, item) {
    const editor = document.createElement("div");
    editor.className = "linked-scripture-edit-form tag-scripture-edit-form";
    editor.dataset.tagScriptureEditor = item.id;

    const referenceLabel = document.createElement("label");
    referenceLabel.textContent = "Reference";

    const referenceInput = document.createElement("input");
    referenceInput.type = "text";
    referenceInput.value = item.reference || "";
    referenceInput.placeholder = "Reference, e.g. John 3:16";
    referenceInput.addEventListener("blur", () => {
      referenceInput.value = normalizeScriptureReference(referenceInput.value);
    });
    referenceLabel.appendChild(referenceInput);

    const noteLabel = document.createElement("label");
    noteLabel.textContent = "Note";

    const noteInput = document.createElement("textarea");
    noteInput.rows = 3;
    noteInput.value = item.note || "";
    noteInput.placeholder = "Optional note or short reminder";
    noteLabel.appendChild(noteInput);

    const actions = document.createElement("div");
    actions.className = "linked-scripture-edit-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "study-primary-button";
    saveButton.textContent = "Save Changes";
    saveButton.addEventListener("click", () =>
      saveManagedTagScriptureEdit(
        tag,
        item,
        referenceInput,
        noteInput,
        saveButton
      )
    );

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "study-secondary-button";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", cancelManagedTagScriptureEdit);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "study-danger-button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteManagedTagScripture(tag, item));

    actions.append(saveButton, cancelButton, deleteButton);

    editor.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        saveManagedTagScriptureEdit(
          tag,
          item,
          referenceInput,
          noteInput,
          saveButton
        );
      }

      if (event.key === "Escape") {
        event.preventDefault();
        cancelManagedTagScriptureEdit();
      }
    });

    editor.append(referenceLabel, noteLabel, actions);
    return editor;
  }

  function renderManagedTagScriptureList(tag, list) {
    list.innerHTML = "";

    if (!state.managedTagScriptures.length) {
      const empty = document.createElement("p");
      empty.className = "study-manager-empty tag-scripture-empty";
      empty.textContent = "No Scripture connections yet.";
      list.appendChild(empty);
      return;
    }

    state.managedTagScriptures.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "linked-scripture-item tag-scripture-item";
      card.classList.toggle(
        "is-editing",
        state.editingManagedTagScriptureId === item.id
      );

      if (state.editingManagedTagScriptureId === item.id) {
        card.appendChild(renderManagedTagScriptureEditor(tag, item));
        list.appendChild(card);
        return;
      }

      const main = document.createElement("div");
      main.className = "linked-scripture-main";

      const reference = document.createElement("button");
      reference.type = "button";
      reference.className = "study-reference-link";
      reference.textContent = item.reference || "Scripture";
      reference.setAttribute(
        "aria-label",
        `Preview ${item.reference || "Scripture"}`
      );
      reference.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openLinkedScripturePreview(reference, item);
      });

      const note = document.createElement("p");
      note.textContent = item.note || "No note added.";

      const footerActions = document.createElement("div");
      footerActions.className = "linked-scripture-card-links";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "linked-scripture-text-button";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", (event) => {
        event.stopPropagation();
        beginManagedTagScriptureEdit(item.id);
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "linked-scripture-text-button is-danger";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteManagedTagScripture(tag, item);
      });

      footerActions.append(editButton, deleteButton);
      main.append(reference, note, footerActions);

      const dragHandle = document.createElement("button");
      dragHandle.type = "button";
      dragHandle.className = "linked-scripture-drag-handle";
      dragHandle.dataset.tagScriptureDragId = item.id;
      dragHandle.innerHTML = '<span aria-hidden="true">⋮⋮</span>';
      dragHandle.setAttribute(
        "aria-label",
        `Drag ${item.reference || "Scripture"} to reorder. Use arrow keys when focused.`
      );
      dragHandle.title = "Drag to reorder";
      dragHandle.addEventListener("pointerdown", (event) =>
        beginManagedTagScriptureDrag(event, card, list, tag.id, index)
      );
      dragHandle.addEventListener("keydown", (event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          reorderManagedTagScriptureFromKeyboard(tag.id, index, -1);
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          reorderManagedTagScriptureFromKeyboard(tag.id, index, 1);
        }
      });

      card.addEventListener("dblclick", (event) => {
        if (event.target.closest("button")) return;
        beginManagedTagScriptureEdit(item.id);
      });

      card.append(main, dragHandle);
      list.appendChild(card);
    });
  }

  function createTagScriptureConnections(tag) {
    const section = document.createElement("section");
    section.className = "tag-scripture-connections";

    const headingRow = document.createElement("div");
    headingRow.className = "tag-scripture-heading-row";

    const headingText = document.createElement("div");
    headingText.appendChild(createSmallLabel("Scripture Connections"));

    const heading = document.createElement("h3");
    heading.textContent = "Scriptures connected to this tag";
    headingText.appendChild(heading);

    const count = document.createElement("span");
    count.className = "tag-scripture-count";
    count.textContent = String(state.managedTagScriptures.length);
    count.setAttribute(
      "aria-label",
      `${state.managedTagScriptures.length} Scripture connections`
    );

    headingRow.append(headingText, count);
    section.appendChild(headingRow);

    const architectureNote = document.createElement("p");
    architectureNote.className = "study-manager-section-note tag-scripture-note";
    architectureNote.textContent =
      "These connections belong to the tag. They do not automatically add Scriptures to a study's Referenced Scriptures.";
    section.appendChild(architectureNote);

    if (
      state.isLoadingManagedTagScriptures ||
      state.managedTagScripturesTagId !== tag.id
    ) {
      const loading = document.createElement("p");
      loading.className = "study-manager-empty tag-scripture-loading";
      loading.textContent = "Loading Scripture connections...";
      section.appendChild(loading);
      return section;
    }

    const addForm = document.createElement("div");
    addForm.className = "study-inline-fields tag-scripture-add-form";

    const referenceInput = document.createElement("input");
    referenceInput.type = "text";
    referenceInput.placeholder = "Reference, e.g. John 3:16";
    referenceInput.setAttribute("aria-label", "Scripture reference to connect");

    const noteInput = document.createElement("textarea");
    noteInput.rows = 2;
    noteInput.placeholder = "Optional note or short reminder";
    noteInput.setAttribute("aria-label", "Optional Scripture connection note");

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "study-secondary-button tag-scripture-add-button";
    addButton.textContent = "Add Scripture";
    addButton.disabled = true;

    referenceInput.addEventListener("input", () => {
      setManagedTagScriptureFeedback("", "");
      updateManagedTagScriptureAddButton(referenceInput, addButton);
    });
    referenceInput.addEventListener("blur", () => {
      referenceInput.value = normalizeScriptureReference(referenceInput.value);
      updateManagedTagScriptureAddButton(referenceInput, addButton);
    });
    referenceInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addManagedTagScripture(tag, referenceInput, noteInput, addButton);
      }
    });
    addButton.addEventListener("click", () =>
      addManagedTagScripture(tag, referenceInput, noteInput, addButton)
    );

    addForm.append(referenceInput, noteInput, addButton);
    section.appendChild(addForm);

    const feedback = document.createElement("p");
    feedback.className = "tag-scripture-feedback";
    feedback.setAttribute("aria-live", "polite");

    if (state.managedTagScriptureFeedback?.message) {
      feedback.textContent = state.managedTagScriptureFeedback.message;
      feedback.classList.toggle(
        "is-error",
        state.managedTagScriptureFeedback.type === "error"
      );
      feedback.classList.toggle(
        "is-warning",
        state.managedTagScriptureFeedback.type === "warning"
      );
      feedback.classList.toggle(
        "is-success",
        state.managedTagScriptureFeedback.type === "success"
      );
      feedback.setAttribute(
        "role",
        state.managedTagScriptureFeedback.type === "error" ? "alert" : "status"
      );
    } else {
      feedback.hidden = true;
      feedback.setAttribute("role", "status");
    }

    section.appendChild(feedback);

    const list = document.createElement("div");
    list.className = "linked-scripture-list tag-scripture-list";
    list.setAttribute("data-tag-scripture-list", tag.id);
    renderManagedTagScriptureList(tag, list);
    section.appendChild(list);

    return section;
  }

  function renderTagManager() {
    if (!els.tagManagerList) return;

    prepareTagManagerCreateSection();

    if (state.managedTagId && !getManagedTag()) {
      state.managedTagId = "";
      resetManagedTagScriptureState();
    }

    els.tagManagerList.innerHTML = "";

    const listCard = document.createElement("div");
    listCard.className = "study-manager-section-card study-manager-existing-card";
    listCard.appendChild(
      createSectionHeading(
        "Existing Tags",
        "Choose a tag to edit",
        "This list shows the tags already saved in your private Study Desk."
      )
    );

    const rows = document.createElement("div");
    rows.className = "study-manager-list-rows";

    if (!state.availableTags.length) {
      const empty = document.createElement("p");
      empty.className = "study-manager-empty";
      empty.textContent = "No tags yet. Create your first tag above.";
      rows.appendChild(empty);
    } else {
      state.availableTags.forEach((tag) => {
        rows.appendChild(renderManagerListRow(tag, state.managedTagId, "Tag", (id) => {
          selectManagedTag(id);
        }));
      });
    }

    listCard.appendChild(rows);
    els.tagManagerList.appendChild(listCard);

    if (!els.tagManagerEditor) return;

    els.tagManagerEditor.innerHTML = "";
    const selected = getManagedTag();
    els.tagManagerEditor.appendChild(selected ? createManagerEditor(selected, "tag") : createEmptyTagEditor());
    els.tagManagerEditor.hidden = false;
  }

  async function addCategory() {
    const name = normalizeName(els.newCategoryName.value);

    if (!name) {
      els.newCategoryName.focus();
      return;
    }

    try {
      const result = await fetchJson("/api/study-categories", {
        method: "POST",
        body: JSON.stringify({ name, sortOrder: state.categories.length * 10 + 100 })
      });

      const category = result.category;
      const index = state.categories.findIndex((item) => item.id === category.id);

      if (index >= 0) {
        state.categories[index] = category;
      } else {
        state.categories.push(category);
      }

      sortByOrderAndName(state.categories);
      state.managedCategoryId = category.id;
      els.newCategoryName.value = "";
      renderCategoryDropdown();
      renderCategoryManager();
      renderStudyList();
      setStatus("Category saved.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function addManagedTag() {
    const name = normalizeName(els.newTagName.value);
    const selectedColor = normalizeColorValue(state.newTagColor);
    const color = selectedColor || "#dbeafe";

    if (!name) {
      els.newTagName.focus();
      return;
    }

    try {
      const result = await fetchJson("/api/study-tags", {
        method: "POST",
        body: JSON.stringify({ name, color, sortOrder: state.availableTags.length * 10 + 100 })
      });

      const tag = result.tag;
      const index = state.availableTags.findIndex((item) => item.id === tag.id);

      if (index >= 0) {
        state.availableTags[index] = tag;
      } else {
        state.availableTags.push(tag);
      }

      sortByOrderAndName(state.availableTags);
      state.managedTagId = tag.id;
      resetManagedTagScriptureState(tag.id);
      els.newTagName.value = "";
      state.newTagColor = "";
      hideTagCustomColorInput();
      renderAddTagColorPicker();
      renderTagOptions();
      renderTagManager();
      renderSelectedTags();
      renderStudyList();
      setStatus("Tag saved.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function updateCategory(category, rawName) {
    if (!category || !category.id) return;

    const name = normalizeName(rawName);

    if (!name) return;

    try {
      const result = await fetchJson(`/api/study-categories/${encodeURIComponent(category.id)}`, {
        method: "PUT",
        body: JSON.stringify({ name, sortOrder: category.sortOrder || 0 })
      });

      const updated = result.category;
      const index = state.categories.findIndex((item) => item.id === updated.id);

      if (index >= 0) {
        state.categories[index] = updated;
      }

      updateSelectedCategoryReferences(updated);
      sortByOrderAndName(state.categories);
      renderCategoryDropdown();
      renderCategoryManager();
      renderStudyList();
      setStatus("Category updated.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function updateTag(tag, rawName, rawColor) {
    if (!tag || !tag.id) return;

    const name = normalizeName(rawName);
    const color = normalizeColorValue(rawColor) || tag.color || "#dbeafe";

    if (!name) return;

    setStatus("Saving tag changes...");

    try {
      const result = await fetchJson(`/api/study-tags/${encodeURIComponent(tag.id)}`, {
        method: "PUT",
        body: JSON.stringify({ name, color, sortOrder: tag.sortOrder || 0 })
      });

      const updated = {
        ...result.tag,
        scriptureCount: Math.max(0, Number(tag.scriptureCount) || 0)
      };
      updateSelectedTagReferences(updated);
      sortByOrderAndName(state.availableTags);
      renderTagOptions();
      renderTagManager();
      renderSelectedTags();
      renderStudyList();
      setStatus("Tag updated.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function deleteCategory(category) {
    if (!category || !category.id) return;

    if (!confirm(`Delete category ${category.name}? Studies using it will no longer have a category.`)) {
      return;
    }

    try {
      await fetchJson(`/api/study-categories/${encodeURIComponent(category.id)}`, {
        method: "DELETE"
      });

      state.categories = state.categories.filter((item) => item.id !== category.id);

      if (state.filter === category.id) {
        state.filter = "all";
      }

      if (els.category.value === category.id) {
        els.category.value = state.categories[0]?.id || "";
      }

      state.studies = state.studies.map((study) => {
        if (study.categoryId !== category.id) return study;
        return { ...study, categoryId: null, category: null };
      });

      renderCategoryDropdown();
      renderCategoryManager();
      renderStudyList();
      setStatus("Category deleted.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function deleteTag(tag) {
    if (!tag || !tag.id) return;

    if (!confirm(`Delete tag ${tag.name}? It will be removed from studies that use it.`)) {
      return;
    }

    try {
      await fetchJson(`/api/study-tags/${encodeURIComponent(tag.id)}`, {
        method: "DELETE"
      });

      state.availableTags = state.availableTags.filter((item) => item.id !== tag.id);
      state.selectedTags = state.selectedTags.filter((item) => item.id !== tag.id);

      if (state.managedTagId === tag.id) {
        state.managedTagId = "";
        resetManagedTagScriptureState();
      }

      state.studies = state.studies.map((study) => ({
        ...study,
        tags: Array.isArray(study.tags) ? study.tags.filter((item) => item.id !== tag.id) : []
      }));

      renderTagOptions();
      renderTagManager();
      renderSelectedTags();
      renderStudyList();
      setStatus("Tag deleted.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function bindOpenPassageButton() {
    document.querySelectorAll("[data-open-passage]").forEach((button) => {
      button.addEventListener("click", () => {
        if (window.BibleSelector && typeof window.BibleSelector.open === "function") {
          window.BibleSelector.open();
          return;
        }
  
        const modal = document.getElementById("bible-selector-modal");
        if (modal) {
          modal.hidden = false;
          modal.classList.add("open");
        }
      });
    });
  }
  
  function bindEvents() {
    window.addEventListener("beforeunload", (event) => {
      if (!state.hasUnsavedChanges) {
        return;
      }
    
      event.preventDefault();
      event.returnValue = "";
    });

    els.newButton.addEventListener("click", () => {
      if (!confirmDiscardUnsavedChanges()) {
        return;
      }
    
      applyStudyToForm(getEmptyStudy());
      renderStudyList();
      els.title.focus();
    });

    els.saveButton.addEventListener("click", saveStudy);
    els.deleteButton.addEventListener("click", deleteStudy);
    els.previewButton.addEventListener("click", switchToPreview);
    els.editButton.addEventListener("click", switchToEdit);

    if (els.addTag) {
      els.addTag.textContent = "Add to Study";
    }

    els.addTag.addEventListener("click", addTag);
    els.addScripture.addEventListener("click", addLinkedScripture);
    
    els.scriptureReference.addEventListener(
      "input",
      updateAddScriptureButtonState
    );
    
    els.scriptureReference.addEventListener("blur", () => {
      els.scriptureReference.value =
        normalizeScriptureReference(els.scriptureReference.value);
    });
    
    updateAddScriptureButtonState();
    
    els.closeCategoryManager.addEventListener("click", closeCategoryManager);
    els.addCategory.addEventListener("click", addCategory);
    els.manageTags.addEventListener("click", openTagManager);
    els.closeTagManager.addEventListener("click", closeTagManager);
    els.addManagedTag.addEventListener("click", addManagedTag);

    els.search.addEventListener("input", renderStudyList);

    els.category.addEventListener("change", () => {
      if (els.category.value === MANAGE_CATEGORY_VALUE) {
        openCategoryManager();
        els.category.value = state.lastCategoryId || state.categories[0]?.id || "";
        return;
      }

      state.lastCategoryId = els.category.value;
      markDirty();
    });

    els.tagInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addTag();
      }
    });

    els.newCategoryName.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addCategory();
      }
    });

    els.newTagName.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addManagedTag();
      }
    });

    els.scriptureReference.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addLinkedScripture();
      }
    });

    els.filterTabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-study-filter]");
      if (!button) return;

      state.filter = button.dataset.studyFilter || "all";
      renderFilterTabs();
      renderStudyList();
    });

    els.categoryModal.addEventListener("click", (event) => {
      if (event.target === els.categoryModal) {
        closeCategoryManager();
      }
    });

    els.tagManagerModal.addEventListener("click", (event) => {
      if (event.target === els.tagManagerModal) {
        closeTagManager();
      }
    });

    document.addEventListener("click", (event) => {
      const popup = document.getElementById("study-scripture-popup");

      if (!popup || popup.hidden) return;

      if (
        event.target.closest?.(".study-scripture-popup") ||
        event.target.closest?.(".study-reference-link")
      ) {
        return;
      }

      closeScripturePreviewPopup();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;

      closeScripturePreviewPopup();

      if (!els.categoryModal.hidden) {
        closeCategoryManager();
      }

      if (!els.tagManagerModal.hidden) {
        closeTagManager();
      }
    });

    [els.title, els.speaker, els.location, els.date].forEach((field) => {
      field.addEventListener("input", () => {
        els.editorTitle.textContent = els.title.value.trim() || "Untitled Study";
        markDirty();
      });
    });
  }

  function initQuill() {
    state.quill = new Quill("#study-editor", {
      theme: "snow",
      modules: {
        toolbar: "#study-quill-toolbar"
      },
      placeholder: "Write your notes, insights, outline, sermon, lesson, or reflection here..."
    });

    state.quill.on("text-change", () => {
      updateWordCount();

      if (!state.isApplying) {
        markDirty();
      }
    });
  }

  window.addEventListener("resize", () => {
    if (activeScripturePopupAnchor) {
      positionScripturePreviewPopup(activeScripturePopupAnchor);
    }
  });

  window.addEventListener(
    "scroll",
    () => {
      if (activeScripturePopupAnchor) {
        positionScripturePreviewPopup(activeScripturePopupAnchor);
      }
    },
    true
  );

  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    hideCategoryColorControls();
    initQuill();
    bindEvents();
    bindOpenPassageButton();
    initStudySync();
    startStudySyncPolling();
  
    applyStudyToForm(getEmptyStudy());
  
    // Default to locked until Clerk confirms authentication.
    showLoggedOut();
    bindStudyDeskAuthState();
  });
})();
