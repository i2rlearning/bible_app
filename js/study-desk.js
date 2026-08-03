"use strict";

(function () {
  const MANAGE_CATEGORY_VALUE = "__manage_categories__";

  const state = {
    studies: [],
    categories: [],
    availableTags: [],
    activeStudyId: null,
    selectedTags: [],
    linkedScriptures: [],
    filter: "all",
    lastCategoryId: "",
    managedCategoryId: "",
    managedTagId: "",
    newCategoryColor: "",
    newTagColor: "",
    quill: null,
    isPreview: false,
    hasLoaded: false,
    isApplying: false
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

  const els = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    els.authMessage = byId("study-auth-message");
    els.app = byId("study-app");
    els.loginButton = byId("study-login-button");
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
    els.mainScripture = byId("study-main-scripture");
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
    els.previewMainScripture = byId("preview-main-scripture");
    els.previewTags = byId("preview-tags");
    els.previewContent = byId("preview-content");
    els.previewLinkedScriptures = byId("preview-linked-scriptures");
    els.categoryModal = byId("category-manager-modal");
    els.categoryList = byId("category-manager-list");
    els.closeCategoryManager = byId("close-category-manager");
    els.newCategoryName = byId("new-category-name");
    els.newCategoryColorPicker = byId("new-category-color-picker");
    els.newCategoryCustomColor = byId("new-category-custom-color");
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

  function setStatus(message, type) {
    if (!els.status) return;

    els.status.textContent = message || "";
    els.status.classList.toggle("is-error", type === "error");
    els.status.classList.toggle("is-success", type === "success");
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
  }

  function showApp() {
    if (els.authMessage) els.authMessage.hidden = true;
    if (els.app) els.app.hidden = false;
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
      throw new Error(result.message || "Request failed");
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
    return {
      title: els.title.value.trim(),
      categoryId: els.category.value || null,
      speaker: els.speaker.value.trim(),
      location: els.location.value.trim(),
      studyDate: els.date.value || null,
      mainScripture: els.mainScripture.value.trim(),
      tagIds: state.selectedTags.map((tag) => tag.id),
      linkedScriptures: state.linkedScriptures.slice(),
      contentHtml: state.quill ? state.quill.root.innerHTML : "",
      previewText: getPlainPreviewText()
    };
  }

  function applyStudyToForm(study) {
    const data = study || getEmptyStudy();

    state.activeStudyId = data.id || null;
    state.selectedTags = Array.isArray(data.tags) ? data.tags.slice() : [];
    state.linkedScriptures = Array.isArray(data.linkedScriptures) ? data.linkedScriptures.slice() : [];

    const categoryId = data.categoryId || data.category?.id || state.categories[0]?.id || "";

    els.title.value = data.title || "";
    els.speaker.value = data.speaker || "";
    els.location.value = data.location || "";
    els.date.value = toDateInput(data.studyDate) || "";
    els.category.value = categoryId;
    state.lastCategoryId = categoryId;
    els.mainScripture.value = data.mainScripture || "";

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
    setSaveState(state.activeStudyId ? "Loaded" : "Draft not saved yet", state.activeStudyId ? "success" : "");
    setStatus("", "");
    switchToEdit();
  }

  function matchesSearch(study, searchValue) {
    if (!searchValue) return true;

    const text = [
      study.title,
      study.category?.name,
      study.studyType,
      study.speaker,
      study.location,
      study.mainScripture,
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
      meta.textContent = [formatDate(study.studyDate || study.updatedAt), study.category?.name || study.studyType, study.mainScripture]
        .filter(Boolean)
        .join(" • ");

      const preview = document.createElement("span");
      preview.textContent = study.previewText ? study.previewText.slice(0, 90) : "";

      button.append(title, meta);

      if (preview.textContent) {
        button.appendChild(preview);
      }

      button.addEventListener("click", () => {
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

    setStatus("Saving...");
    setSaveState("Saving...");

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

      const index = state.studies.findIndex((study) => study.id === savedStudy.id);

      if (index >= 0) {
        state.studies[index] = savedStudy;
      } else {
        state.studies.unshift(savedStudy);
      }

      state.studies.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      applyStudyToForm(savedStudy);
      renderStudyList();
      setStatus("Study saved successfully.", "success");
      setSaveState("Saved just now", "success");
    } catch (error) {
      setStatus(error.message, "error");
      setSaveState("Save failed");
    }
  }

  async function deleteStudy() {
    if (!state.activeStudyId) return;

    const currentTitle = els.title.value.trim() || "this study";

    if (!confirm(`Delete ${currentTitle}? This cannot be undone.`)) {
      return;
    }

    setStatus("Deleting...");

    try {
      await fetchJson(`/api/studies/${encodeURIComponent(state.activeStudyId)}`, {
        method: "DELETE"
      });

      state.studies = state.studies.filter((study) => study.id !== state.activeStudyId);
      state.activeStudyId = null;
      renderStudyList();

      if (state.studies.length) {
        await loadStudy(state.studies[0].id);
      } else {
        applyStudyToForm(getEmptyStudy());
      }

      setStatus("Study deleted.", "success");
    } catch (error) {
      setStatus(error.message, "error");
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

  function renderLinkedScriptures() {
    els.scriptureList.innerHTML = "";
    els.scriptureCount.textContent = String(state.linkedScriptures.length);

    state.linkedScriptures.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "linked-scripture-item";

      const reference = document.createElement("strong");
      reference.textContent = item.reference || "Scripture";

      const note = document.createElement("p");
      note.textContent = item.note || "No note added.";

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        state.linkedScriptures.splice(index, 1);
        renderLinkedScriptures();
        markDirty();
      });

      card.append(reference, note, removeButton);
      els.scriptureList.appendChild(card);
    });
  }

  function addLinkedScripture() {
    const reference = els.scriptureReference.value.trim();
    const note = els.scriptureNote.value.trim();

    if (!reference) {
      els.scriptureReference.focus();
      return;
    }

    state.linkedScriptures.push({ reference, note });

    els.scriptureReference.value = "";
    els.scriptureNote.value = "";
    renderLinkedScriptures();
    markDirty();
  }

  function markDirty() {
    setSaveState("Unsaved changes");
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
      empty.textContent = "No linked Scriptures yet.";
      els.previewLinkedScriptures.appendChild(empty);
      return;
    }

    state.linkedScriptures.forEach((item) => {
      const card = document.createElement("div");
      card.className = "preview-scripture-item";

      const reference = document.createElement("strong");
      reference.textContent = item.reference || "Scripture";

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
    els.previewMainScripture.textContent = data.mainScripture ? `Main Scripture: ${data.mainScripture}` : "";
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
    els.modeLabel.textContent = "Preview";
  }

  function switchToEdit() {
    state.isPreview = false;
    els.form.hidden = false;
    els.preview.hidden = true;
    els.previewButton.hidden = false;
    els.editButton.hidden = true;
    els.modeLabel.textContent = state.activeStudyId ? "Edit Study" : "New Study";
  }

  function openCategoryManager() {
    if (!els.categoryModal) return;
    if (!state.managedCategoryId && state.categories[0]) {
      state.managedCategoryId = state.categories[0].id;
    }
    renderAddCategoryColorPicker();
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
    if (!state.managedTagId && state.availableTags[0]) {
      state.managedTagId = state.availableTags[0].id;
    }
    renderAddTagColorPicker();
    renderTagManager();
    els.tagManagerModal.hidden = false;
    if (els.newTagName) els.newTagName.focus();
  }

  function closeTagManager() {
    if (!els.tagManagerModal) return;
    els.tagManagerModal.hidden = true;
    renderTagOptions();
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

  function syncCustomColorInput(input, color) {
    if (!input) return;
    input.value = normalizeColorValue(color) || "";
  }

  function getManagedCategory() {
    return state.categories.find((item) => item.id === state.managedCategoryId) || null;
  }

  function getManagedTag() {
    return state.availableTags.find((item) => item.id === state.managedTagId) || null;
  }

  function renderAddCategoryColorPicker() {
    renderColorPicker(els.newCategoryColorPicker, state.newCategoryColor, (color) => {
      state.newCategoryColor = color;
      syncCustomColorInput(els.newCategoryCustomColor, color);
      renderAddCategoryColorPicker();
    });
  }

  function renderAddTagColorPicker() {
    renderColorPicker(els.newTagColorPicker, state.newTagColor, (color) => {
      state.newTagColor = color;
      syncCustomColorInput(els.newTagCustomColor, color);
      renderAddTagColorPicker();
    });
  }

  function renderManagerListRow(item, selectedId, label, onSelect) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "study-manager-list-row";
    row.classList.toggle("is-selected", item.id === selectedId);
    row.setAttribute("aria-pressed", String(item.id === selectedId));

    const selectDot = document.createElement("span");
    selectDot.className = "study-manager-select-dot";

    const colorSwatch = document.createElement("span");
    colorSwatch.className = "study-color-swatch";
    colorSwatch.style.backgroundColor = item.color || "#dbeafe";

    const name = document.createElement("span");
    name.className = "study-manager-row-name";
    name.textContent = item.name || label;

    row.append(selectDot, colorSwatch, name);
    row.addEventListener("click", () => onSelect(item.id));
    return row;
  }

  function createManagerEditor(item, type) {
    const editor = document.createElement("div");
    editor.className = "study-manager-editor-card";

    const heading = document.createElement("div");
    heading.className = "study-manager-editor-heading";

    const title = document.createElement("div");
    title.innerHTML = `<p class="study-manager-small-label">Selected ${type}</p><h3>Edit ${type}</h3>`;

    const preview = document.createElement("span");
    preview.className = "study-manager-editor-preview";
    preview.style.backgroundColor = item.color || "#dbeafe";

    heading.append(title, preview);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "study-manager-name-input";
    nameInput.value = item.name || "";
    nameInput.setAttribute("aria-label", `${type} name`);

    let selectedColor = normalizeColorValue(item.color) || "#dbeafe";

    const picker = document.createElement("div");
    picker.className = "study-manager-color-picker";

    const customInput = document.createElement("input");
    customInput.type = "text";
    customInput.className = "study-manager-custom-color-input";
    customInput.placeholder = "Custom color, e.g. #dbeafe";
    customInput.maxLength = 7;
    customInput.spellcheck = false;
    customInput.value = selectedColor;

    const rerenderPicker = () => {
      renderColorPicker(picker, selectedColor, (color) => {
        selectedColor = color;
        customInput.value = color;
        preview.style.backgroundColor = color;
        rerenderPicker();
      });
    };

    customInput.addEventListener("input", () => {
      const color = normalizeColorValue(customInput.value);
      if (!color) return;
      selectedColor = color;
      preview.style.backgroundColor = color;
      rerenderPicker();
    });

    nameInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (type === "category") updateCategory(item, nameInput.value, selectedColor);
        if (type === "tag") updateTag(item, nameInput.value, selectedColor);
      }
    });

    rerenderPicker();

    const actions = document.createElement("div");
    actions.className = "study-manager-editor-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "study-primary-button";
    saveButton.textContent = "Save Changes";
    saveButton.addEventListener("click", () => {
      const customColor = normalizeColorValue(customInput.value);
      const finalColor = customColor || selectedColor;
      if (type === "category") updateCategory(item, nameInput.value, finalColor);
      if (type === "tag") updateTag(item, nameInput.value, finalColor);
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

    editor.append(
      heading,
      nameInput,
      document.createElement("hr"),
      createSmallLabel("Color"),
      picker,
      customInput,
      actions
    );

    return editor;
  }

  function createSmallLabel(text) {
    const label = document.createElement("p");
    label.className = "study-manager-small-label";
    label.textContent = text;
    return label;
  }

  function renderCategoryManager() {
    if (!els.categoryList) return;

    if (state.categories.length && !getManagedCategory()) {
      state.managedCategoryId = state.categories[0].id;
    }

    els.categoryList.innerHTML = "";

    if (!state.categories.length) {
      const empty = document.createElement("p");
      empty.className = "study-manager-empty";
      empty.textContent = "No categories yet.";
      els.categoryList.appendChild(empty);
      if (els.categoryEditor) els.categoryEditor.hidden = true;
      return;
    }

    state.categories.forEach((category) => {
      els.categoryList.appendChild(renderManagerListRow(category, state.managedCategoryId, "Category", (id) => {
        state.managedCategoryId = id;
        renderCategoryManager();
      }));
    });

    const selected = getManagedCategory();
    if (els.categoryEditor && selected) {
      els.categoryEditor.innerHTML = "";
      els.categoryEditor.appendChild(createManagerEditor(selected, "category"));
      els.categoryEditor.hidden = false;
    }
  }

  function renderTagManager() {
    if (!els.tagManagerList) return;

    if (state.availableTags.length && !getManagedTag()) {
      state.managedTagId = state.availableTags[0].id;
    }

    els.tagManagerList.innerHTML = "";

    if (!state.availableTags.length) {
      const empty = document.createElement("p");
      empty.className = "study-manager-empty";
      empty.textContent = "No tags yet.";
      els.tagManagerList.appendChild(empty);
      if (els.tagManagerEditor) els.tagManagerEditor.hidden = true;
      return;
    }

    state.availableTags.forEach((tag) => {
      els.tagManagerList.appendChild(renderManagerListRow(tag, state.managedTagId, "Tag", (id) => {
        state.managedTagId = id;
        renderTagManager();
      }));
    });

    const selected = getManagedTag();
    if (els.tagManagerEditor && selected) {
      els.tagManagerEditor.innerHTML = "";
      els.tagManagerEditor.appendChild(createManagerEditor(selected, "tag"));
      els.tagManagerEditor.hidden = false;
    }
  }

  async function addCategory() {
    const name = normalizeName(els.newCategoryName.value);
    const color = normalizeColorValue(state.newCategoryColor || els.newCategoryCustomColor.value);

    if (!name) {
      els.newCategoryName.focus();
      return;
    }

    try {
      const result = await fetchJson("/api/study-categories", {
        method: "POST",
        body: JSON.stringify({ name, color, sortOrder: state.categories.length * 10 + 100 })
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
      state.newCategoryColor = "";
      if (els.newCategoryCustomColor) els.newCategoryCustomColor.value = "";
      renderAddCategoryColorPicker();
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
    const color = normalizeColorValue(state.newTagColor || els.newTagCustomColor.value);

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
      els.newTagName.value = "";
      state.newTagColor = "";
      if (els.newTagCustomColor) els.newTagCustomColor.value = "";
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

  async function updateCategory(category, rawName, rawColor) {
    if (!category || !category.id) return;

    const name = normalizeName(rawName);
    const color = normalizeColorValue(rawColor) || category.color || "#dbeafe";

    if (!name) return;

    try {
      const result = await fetchJson(`/api/study-categories/${encodeURIComponent(category.id)}`, {
        method: "PUT",
        body: JSON.stringify({ name, color, sortOrder: category.sortOrder || 0 })
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
      markDirty();
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

    try {
      const result = await fetchJson(`/api/study-tags/${encodeURIComponent(tag.id)}`, {
        method: "PUT",
        body: JSON.stringify({ name, color, sortOrder: tag.sortOrder || 0 })
      });

      const updated = result.tag;
      updateSelectedTagReferences(updated);
      sortByOrderAndName(state.availableTags);
      renderTagOptions();
      renderTagManager();
      renderSelectedTags();
      renderStudyList();
      markDirty();
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
      markDirty();
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
      state.studies = state.studies.map((study) => ({
        ...study,
        tags: Array.isArray(study.tags) ? study.tags.filter((item) => item.id !== tag.id) : []
      }));

      renderTagOptions();
      renderTagManager();
      renderSelectedTags();
      renderStudyList();
      markDirty();
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function bindEvents() {
    els.loginButton.addEventListener("click", () => {
      const login = byId("login");
      if (login) login.click();
    });

    els.newButton.addEventListener("click", () => {
      applyStudyToForm(getEmptyStudy());
      renderStudyList();
      els.title.focus();
    });

    els.saveButton.addEventListener("click", saveStudy);
    els.deleteButton.addEventListener("click", deleteStudy);
    els.previewButton.addEventListener("click", switchToPreview);
    els.editButton.addEventListener("click", switchToEdit);
    els.addTag.addEventListener("click", addTag);
    els.addScripture.addEventListener("click", addLinkedScripture);
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

    if (els.newCategoryCustomColor) {
      els.newCategoryCustomColor.addEventListener("input", () => {
        const color = normalizeColorValue(els.newCategoryCustomColor.value);
        state.newCategoryColor = color;
        renderAddCategoryColorPicker();
      });
    }

    els.newTagName.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addManagedTag();
      }
    });

    if (els.newTagCustomColor) {
      els.newTagCustomColor.addEventListener("input", () => {
        const color = normalizeColorValue(els.newTagCustomColor.value);
        state.newTagColor = color;
        renderAddTagColorPicker();
      });
    }

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

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;

      if (!els.categoryModal.hidden) {
        closeCategoryManager();
      }

      if (!els.tagManagerModal.hidden) {
        closeTagManager();
      }
    });

    [els.title, els.speaker, els.location, els.date, els.mainScripture].forEach((field) => {
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

  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    initQuill();
    bindEvents();
    applyStudyToForm(getEmptyStudy());
    loadStudies();
  });
})();
