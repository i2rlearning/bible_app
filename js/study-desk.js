"use strict";

(function () {
  const state = {
    studies: [],
    activeStudyId: null,
    tags: [],
    linkedScriptures: [],
    filter: "all",
    quill: null,
    isPreview: false,
    hasLoaded: false,
    isApplying: false
  };

  const els = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    els.authMessage = byId("study-auth-message");
    els.app = byId("study-app");
    els.loginButton = byId("study-login-button");
    els.search = byId("study-search");
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
    els.type = byId("study-type");
    els.mainScripture = byId("study-main-scripture");
    els.scriptureReference = byId("scripture-reference-input");
    els.scriptureNote = byId("scripture-note-input");
    els.addScripture = byId("add-scripture-button");
    els.scriptureList = byId("linked-scripture-list");
    els.scriptureCount = byId("linked-scripture-count");
    els.tagInput = byId("tag-input");
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

  function formatType(value) {
    const map = {
      study: "Study",
      sermon: "Sermon",
      lesson: "Lesson",
      teaching: "Teaching",
      "personal-study": "Personal Study",
      journal: "Journal",
      other: "Other"
    };

    return map[value] || value || "Study";
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
    return {
      id: null,
      title: "",
      studyType: "study",
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
      studyType: els.type.value || "study",
      speaker: els.speaker.value.trim(),
      location: els.location.value.trim(),
      studyDate: els.date.value || null,
      mainScripture: els.mainScripture.value.trim(),
      tags: state.tags.slice(),
      linkedScriptures: state.linkedScriptures.slice(),
      contentHtml: state.quill ? state.quill.root.innerHTML : "",
      previewText: getPlainPreviewText()
    };
  }

  function applyStudyToForm(study) {
    const data = study || getEmptyStudy();

    state.activeStudyId = data.id || null;
    state.tags = Array.isArray(data.tags) ? data.tags.slice() : [];
    state.linkedScriptures = Array.isArray(data.linkedScriptures) ? data.linkedScriptures.slice() : [];

    els.title.value = data.title || "";
    els.speaker.value = data.speaker || "";
    els.location.value = data.location || "";
    els.date.value = toDateInput(data.studyDate) || "";
    els.type.value = data.studyType || "study";
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

    renderTags();
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
      study.studyType,
      study.speaker,
      study.location,
      study.mainScripture,
      study.previewText,
      ...(Array.isArray(study.tags) ? study.tags : []),
      ...(Array.isArray(study.linkedScriptures) ? study.linkedScriptures.map((item) => `${item.reference || ""} ${item.note || ""}`) : [])
    ]
      .join(" ")
      .toLowerCase();

    return text.includes(searchValue);
  }

  function getFilteredStudies() {
    const searchValue = (els.search.value || "").trim().toLowerCase();

    return state.studies.filter((study) => {
      const typeMatches = state.filter === "all" || study.studyType === state.filter;
      return typeMatches && matchesSearch(study, searchValue);
    });
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
      meta.textContent = [formatDate(study.studyDate || study.updatedAt), formatType(study.studyType), study.mainScripture]
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

  async function loadStudies() {
    setListStatus("Loading...");

    try {
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

  function renderTags() {
    els.tagList.innerHTML = "";
    els.tagCount.textContent = String(state.tags.length);

    state.tags.forEach((tag, index) => {
      const chip = document.createElement("span");
      chip.className = "study-tag";

      const text = document.createElement("span");
      text.textContent = tag;

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.setAttribute("aria-label", `Remove ${tag}`);
      removeButton.textContent = "×";
      removeButton.addEventListener("click", () => {
        state.tags.splice(index, 1);
        renderTags();
        markDirty();
      });

      chip.append(text, removeButton);
      els.tagList.appendChild(chip);
    });
  }

  function addTag() {
    const raw = els.tagInput.value.trim();

    if (!raw) return;

    const tag = raw.replace(/\s+/g, " ");
    const exists = state.tags.some((item) => item.toLowerCase() === tag.toLowerCase());

    if (!exists) {
      state.tags.push(tag);
      renderTags();
      markDirty();
    }

    els.tagInput.value = "";
    els.tagInput.focus();
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

    state.linkedScriptures.push({
      reference,
      note
    });

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
      chip.textContent = tag;
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

    els.previewType.textContent = data.studyType ? formatType(data.studyType) : "";
    els.previewDate.textContent = data.studyDate ? formatDate(data.studyDate) : "";
    els.previewSpeaker.textContent = data.speaker || "";
    els.previewLocation.textContent = data.location || "";
    els.previewTitle.textContent = data.title || "Untitled Study";
    els.previewMainScripture.textContent = data.mainScripture ? `Main Scripture: ${data.mainScripture}` : "";
    els.previewContent.innerHTML = data.contentHtml || "<p>No study notes yet.</p>";

    renderPreviewTags(els.previewTags, state.tags);
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

    els.search.addEventListener("input", renderStudyList);

    els.tagInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addTag();
      }
    });

    els.scriptureReference.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addLinkedScripture();
      }
    });

    document.querySelectorAll("[data-study-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.filter = button.dataset.studyFilter || "all";

        document.querySelectorAll("[data-study-filter]").forEach((item) => {
          item.classList.toggle("active", item === button);
        });

        renderStudyList();
      });
    });

    [els.title, els.speaker, els.location, els.date, els.type, els.mainScripture].forEach((field) => {
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
