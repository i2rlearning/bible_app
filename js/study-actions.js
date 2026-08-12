"use strict";

(function () {
  const state = {
    menu: null,
    trigger: null,
    selection: null,
    studies: [],
    savedOffsets: null,
    savedAt: 0,
    requestId: 0
  };

  const STUDY_SYNC_CHANNEL_NAME = "branch-of-israel-study-sync-v1";
  const STUDY_SYNC_STORAGE_KEY = "branchOfIsraelStudySync";
  let studySyncChannel = null;

  if ("BroadcastChannel" in window) {
    studySyncChannel = new BroadcastChannel(STUDY_SYNC_CHANNEL_NAME);
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function parseResponse(response) {
    const text = await response.text();

    try {
      return text ? JSON.parse(text) : {};
    } catch (error) {
      return { message: text || "Unexpected server response" };
    }
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

  function getTextOffset(root, targetNode, targetOffset) {
    let offset = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const node = walker.currentNode;

      if (node === targetNode) {
        return offset + targetOffset;
      }

      offset += node.nodeValue.length;
    }

    return offset;
  }

  function getRangeFromOffsets(root, startOffset, endOffset) {
    const range = document.createRange();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let currentOffset = 0;
    let startSet = false;

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const nextOffset = currentOffset + node.nodeValue.length;

      if (!startSet && startOffset >= currentOffset && startOffset <= nextOffset) {
        range.setStart(node, startOffset - currentOffset);
        startSet = true;
      }

      if (startSet && endOffset >= currentOffset && endOffset <= nextOffset) {
        range.setEnd(node, endOffset - currentOffset);
        return range;
      }

      currentOffset = nextOffset;
    }

    return null;
  }

  function rememberBibleSelection() {
    const selection = window.getSelection();
    const bibleText = document.getElementById("bible-text");

    if (!selection || !selection.rangeCount || selection.isCollapsed || !bibleText) {
      return;
    }

    const range = selection.getRangeAt(0);

    if (!bibleText.contains(range.commonAncestorContainer)) {
      return;
    }

    const start = getTextOffset(bibleText, range.startContainer, range.startOffset);
    const end = getTextOffset(bibleText, range.endContainer, range.endOffset);

    if (start === end) {
      return;
    }

    state.savedOffsets = { start, end };
    state.savedAt = Date.now();
  }

  function getSelectionRange() {
    const selection = window.getSelection();
    const bibleText = document.getElementById("bible-text");

    if (!bibleText) {
      return null;
    }

    if (selection && selection.rangeCount && !selection.isCollapsed) {
      const liveRange = selection.getRangeAt(0);

      if (bibleText.contains(liveRange.commonAncestorContainer)) {
        return liveRange.cloneRange();
      }
    }

    if (!state.savedOffsets || Date.now() - state.savedAt > 120000) {
      return null;
    }

    return getRangeFromOffsets(
      bibleText,
      state.savedOffsets.start,
      state.savedOffsets.end
    );
  }

  function getBibleContext() {
    const params = new URLSearchParams(window.location.search);
    const chapterId = params.get("chapter") || "";
    const chapterParts = chapterId.split(".");

    return {
      bibleId: params.get("bible") || params.get("version") || "",
      bibleAbbr: params.get("bibleAbbr") || params.get("abbr") || "",
      bibleName: params.get("bibleName") || "",
      bookId: params.get("book") || chapterParts[0] || "",
      bookName:
        params.get("bookName") ||
        params.get("name") ||
        params.get("book") ||
        chapterParts[0] ||
        "",
      chapterId,
      chapterNumber: chapterParts[chapterParts.length - 1] || ""
    };
  }

  function getVerseNumber(marker) {
    const sid = marker.getAttribute("data-sid") || "";
    const verseId =
      marker.getAttribute("data-verse-id") || marker.getAttribute("id") || "";

    return (
      sid.match(/:(\d+(?:-\d+)?)$/)?.[1] ||
      verseId.match(/\.(\d+(?:-\d+)?)$/)?.[1] ||
      normalizeText(marker.textContent).match(/^(\d+(?:-\d+)?)/)?.[1] ||
      ""
    );
  }

  function getMarkerOffset(root, marker) {
    try {
      const range = document.createRange();
      range.selectNodeContents(root);
      range.setEndBefore(marker);
      return range.toString().length;
    } catch (error) {
      return null;
    }
  }

  function buildReference(range) {
    const bibleText = document.getElementById("bible-text");
    const context = getBibleContext();
    const bookChapter = `${context.bookName} ${context.chapterNumber}`.trim();

    if (!bibleText || !range) {
      return bookChapter;
    }

    const startOffset = getTextOffset(
      bibleText,
      range.startContainer,
      range.startOffset
    );
    const endOffset = getTextOffset(
      bibleText,
      range.endContainer,
      range.endOffset
    );

    const markers = Array.from(bibleText.querySelectorAll(".v"))
      .map((marker) => ({
        verse: getVerseNumber(marker),
        offset: getMarkerOffset(bibleText, marker)
      }))
      .filter((item) => item.verse && Number.isFinite(item.offset));

    let startVerse = "";
    let endVerse = "";

    markers.forEach((item) => {
      if (item.offset <= startOffset) startVerse = item.verse;
      if (item.offset < endOffset) endVerse = item.verse;
    });

    if (!startVerse && markers.length) startVerse = markers[0].verse;
    if (!endVerse) endVerse = startVerse;
    if (!startVerse) return bookChapter;

    const start = startVerse.split("-")[0];
    const end = endVerse.split("-").pop();

    return end && end !== start
      ? `${bookChapter}:${start}-${end}`
      : `${bookChapter}:${start}`;
  }

  function getSelectedText(range) {
    const wrapper = document.createElement("div");
    wrapper.appendChild(range.cloneContents());

    wrapper
      .querySelectorAll(".v, .api-footnote-marker, .api-crossref-marker")
      .forEach((element) => element.remove());

    return normalizeText(wrapper.textContent || range.toString());
  }

  function captureSelection() {
    const range = getSelectionRange();

    if (!range || range.collapsed) {
      return null;
    }

    const selectedText = getSelectedText(range);

    if (!selectedText) {
      return null;
    }

    const context = getBibleContext();

    return {
      reference: buildReference(range),
      selectedText,
      bibleId: context.bibleId,
      bibleAbbr: context.bibleAbbr,
      bibleName: context.bibleName,
      bookId: context.bookId,
      bookName: context.bookName,
      chapterId: context.chapterId,
      sourceUrl: `${window.location.pathname}${window.location.search}`
    };
  }

  function ensureMenu() {
    if (state.menu) return state.menu;

    const menu = document.createElement("section");
    menu.id = "selection-study-menu";
    menu.className = "selection-study-menu";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", "Add selected Scripture to Study");
    menu.hidden = true;
    document.body.appendChild(menu);
    state.menu = menu;
    return menu;
  }

  function setExpanded(expanded) {
    document.querySelectorAll("[data-study-selection-trigger]").forEach((button) => {
      button.setAttribute(
        "aria-expanded",
        String(expanded && button === state.trigger)
      );
    });
  }

  function positionMenu() {
    const menu = ensureMenu();

    if (menu.hidden || !state.trigger) return;

    const trigger = state.trigger.getBoundingClientRect();
    const margin = 10;
    const gap = 8;

    menu.style.left = "0px";
    menu.style.top = "0px";

    const rect = menu.getBoundingClientRect();
    let left = trigger.left + trigger.width / 2 - rect.width / 2;
    let top = trigger.bottom + gap;

    left = Math.max(margin, Math.min(left, window.innerWidth - rect.width - margin));

    if (top + rect.height + margin > window.innerHeight) {
      top = Math.max(margin, trigger.top - rect.height - gap);
    }

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  function closeMenu() {
    const menu = ensureMenu();
    menu.hidden = true;
    menu.innerHTML = "";
    setExpanded(false);
    state.trigger = null;
  }

  function headerHtml(title, subtitle) {
    return `
      <div class="selection-study-menu-header">
        <span class="study-menu-bookmark-icon" aria-hidden="true">
          <i class="fa fa-bookmark-o"></i><span>+</span>
        </span>
        <div>
          <strong>${escapeHtml(title)}</strong>
          <span class="selection-study-menu-subtitle">${escapeHtml(subtitle || "")}</span>
        </div>
      </div>
    `;
  }

  async function loadStudies() {
    const response = await fetch("/api/studies", {
      method: "GET",
      credentials: "include"
    });
    const result = await parseResponse(response);

    if (!response.ok) {
      throw new Error(result.message || "Could not load your studies.");
    }

    state.studies = Array.isArray(result.studies) ? result.studies : [];
  }

  function studyButtonHtml(study) {
    const detail = study.mainScripture || study.category?.name || "";

    return `
      <button type="button" class="selection-study-menu-button is-study" data-study-id="${escapeHtml(study.id)}">
        ${escapeHtml(study.title || "Untitled Study")}
        ${detail ? `<span>${escapeHtml(detail)}</span>` : ""}
      </button>
    `;
  }

  function renderStart() {
    const menu = ensureMenu();
    menu.innerHTML = headerHtml(
      "Add to Study",
      state.selection?.reference || "Selected Scripture"
    );

    if (!state.selection) {
      menu.insertAdjacentHTML(
        "beforeend",
        '<div class="selection-study-menu-status is-error">Select Scripture text first, then tap this button.</div>'
      );
      positionMenu();
      return;
    }

    if (!state.studies.length) {
      menu.insertAdjacentHTML(
        "beforeend",
        `
          <div class="selection-study-menu-status">You do not have any saved studies yet.</div>
          <button type="button" class="selection-study-menu-button is-primary" data-open-study-desk>Open Study Desk</button>
        `
      );
      menu.querySelector("[data-open-study-desk]").addEventListener("click", () => {
        window.location.href = "./study-desk.html";
      });
      positionMenu();
      return;
    }

    const recent = state.studies.slice(0, 3);
    menu.insertAdjacentHTML(
      "beforeend",
      `
        <div class="selection-study-menu-label">Recent studies</div>
        ${recent.map(studyButtonHtml).join("")}
        <button type="button" class="selection-study-menu-button is-secondary" data-choose-study>Choose another study...</button>
      `
    );

    bindStudyButtons(menu);
    menu.querySelector("[data-choose-study]").addEventListener("click", renderSearch);
    positionMenu();
  }

  function bindStudyButtons(container) {
    container.querySelectorAll("[data-study-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const study = state.studies.find((item) => item.id === button.dataset.studyId);
        if (study) renderDestination(study);
      });
    });
  }

  function renderSearch() {
    const menu = ensureMenu();
    menu.innerHTML = `
      <div class="selection-study-menu-top-row">
        <button type="button" class="selection-study-back-button" data-back>‹ Back</button>
        <strong>Choose a Study</strong>
      </div>
      <input type="search" class="selection-study-search" placeholder="Search studies..." aria-label="Search studies">
      <div class="selection-study-search-results"></div>
    `;

    const search = menu.querySelector(".selection-study-search");
    const results = menu.querySelector(".selection-study-search-results");
    menu.querySelector("[data-back]").addEventListener("click", renderStart);

    function renderResults() {
      const query = normalizeText(search.value).toLowerCase();
      const matches = state.studies
        .filter((study) => {
          if (!query) return true;
          return [
            study.title,
            study.mainScripture,
            study.category?.name,
            study.speaker,
            study.location
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(query);
        })
        .slice(0, 50);

      results.innerHTML = matches.length
        ? matches.map(studyButtonHtml).join("")
        : '<div class="selection-study-menu-status">No matching studies.</div>';
      bindStudyButtons(results);
      positionMenu();
    }

    search.addEventListener("input", renderResults);
    renderResults();
    positionMenu();
    setTimeout(() => search.focus(), 0);
  }

  function renderDestination(study) {
    const menu = ensureMenu();
    menu.innerHTML = `
      <div class="selection-study-menu-top-row">
        <button type="button" class="selection-study-back-button" data-back>‹ Back</button>
        <strong>Add to ${escapeHtml(study.title || "Study")}</strong>
      </div>
      <div class="selection-study-reference">${escapeHtml(state.selection.reference)}</div>
      <button type="button" class="selection-study-menu-button is-primary" data-mode="linked-scripture">
        Linked Scripture
        <span>Add it to the study's Linked Scriptures list</span>
      </button>
      <button type="button" class="selection-study-menu-button is-secondary" data-mode="notes">
        Insert into Notes
        <span>Append the selected words to the study notes</span>
      </button>
    `;

    menu.querySelector("[data-back]").addEventListener("click", renderStart);
    menu.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => addToStudy(study, button.dataset.mode));
    });
    positionMenu();
  }

  function dateForUpdate(value) {
    return typeof value === "string" && value.length >= 10 ? value.slice(0, 10) : value || null;
  }

  function buildUpdate(study, mode) {
    const selection = state.selection;
    const linkedScriptures = Array.isArray(study.linkedScriptures)
      ? study.linkedScriptures.slice()
      : [];
    let contentHtml = typeof study.contentHtml === "string" ? study.contentHtml : "";

    if (mode === "linked-scripture") {
      linkedScriptures.push({
        reference: selection.reference,
        note: selection.selectedText,
        selectedText: selection.selectedText,
        bibleId: selection.bibleId,
        bibleAbbr: selection.bibleAbbr,
        bibleName: selection.bibleName,
        bookId: selection.bookId,
        bookName: selection.bookName,
        chapterId: selection.chapterId,
        sourceUrl: selection.sourceUrl,
        addedFrom: "verse-selection"
      });
    } else {
      const version = selection.bibleAbbr ? ` (${selection.bibleAbbr})` : "";
      contentHtml +=
        `<p><strong>${escapeHtml(selection.reference + version)}</strong></p>` +
        `<blockquote>${escapeHtml(selection.selectedText)}</blockquote>` +
        "<p><br></p>";
    }

    return {
      title: study.title || "Untitled Study",
      categoryId: study.categoryId || study.category?.id || null,
      speaker: study.speaker || "",
      location: study.location || "",
      studyDate: dateForUpdate(study.studyDate),
      mainScripture: study.mainScripture || "",
      tagIds: Array.isArray(study.tags) ? study.tags.map((tag) => tag.id).filter(Boolean) : [],
      linkedScriptures,
      contentHtml,
      previewText: "",
      expectedVersion: Number(study.version) || null
    };
  }

  async function saveStudyUpdate(studyId, sourceStudy, mode) {
    return fetch(`/api/studies/${encodeURIComponent(studyId)}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildUpdate(sourceStudy, mode))
    });
  }

  async function addToStudy(study, mode) {
    const menu = ensureMenu();
    const requestId = ++state.requestId;

    menu.querySelectorAll("button, input").forEach((control) => {
      control.disabled = true;
    });
    menu.insertAdjacentHTML(
      "beforeend",
      '<div class="selection-study-menu-status">Adding to study...</div>'
    );
    positionMenu();

    try {
      const freshResponse = await fetch(`/api/studies/${encodeURIComponent(study.id)}`, {
        method: "GET",
        credentials: "include"
      });
      const freshResult = await parseResponse(freshResponse);

      if (!freshResponse.ok || !freshResult.study) {
        throw new Error(freshResult.message || "Could not load the selected study.");
      }

      if (requestId !== state.requestId) return;

      let saveResponse = await saveStudyUpdate(study.id, freshResult.study, mode);
      let saveResult = await parseResponse(saveResponse);

      /*
       * Adding Scripture is an additive action. If another tab/device saved
       * between our fresh GET and PUT, retry once against the server's newest
       * version instead of silently overwriting either person's work.
       */
      if (
        saveResponse.status === 409 &&
        saveResult.code === "STUDY_VERSION_CONFLICT" &&
        saveResult.latestStudy
      ) {
        saveResponse = await saveStudyUpdate(study.id, saveResult.latestStudy, mode);
        saveResult = await parseResponse(saveResponse);
      }

      if (!saveResponse.ok || !saveResult.study) {
        if (saveResponse.status === 409) {
          throw new Error("This study changed again while the Scripture was being added. Please try once more.");
        }

        if (saveResponse.status === 428) {
          throw new Error("This study needs to be reloaded before it can be updated.");
        }

        throw new Error(saveResult.message || "Could not update the selected study.");
      }

      const index = state.studies.findIndex((item) => item.id === saveResult.study.id);
      if (index >= 0) state.studies[index] = saveResult.study;

      publishStudySync("study-updated", { study: saveResult.study });

      menu.innerHTML =
        headerHtml("Added to Study", saveResult.study.title || "Study") +
        `<div class="selection-study-menu-status is-success">${
          mode === "linked-scripture"
            ? "Added to Linked Scriptures."
            : "Appended to Study Notes."
        }</div>`;
      positionMenu();
      setTimeout(closeMenu, 1300);
    } catch (error) {
      menu.innerHTML =
        headerHtml("Add to Study", state.selection?.reference || "Selected Scripture") +
        `<div class="selection-study-menu-status is-error">${escapeHtml(
          error.message || "Could not add the Scripture to the study."
        )}</div>` +
        '<button type="button" class="selection-study-menu-button is-secondary" data-back>Back</button>';
      menu.querySelector("[data-back]").addEventListener("click", renderStart);
      positionMenu();
    }
  }

  async function openMenu(trigger) {
    rememberBibleSelection();
    state.selection = captureSelection();
    state.trigger = trigger;

    if (typeof window.closeMobileToolbarMenus === "function") {
      window.closeMobileToolbarMenus();
    }

    const menu = ensureMenu();
    menu.hidden = false;
    setExpanded(true);

    if (!state.selection) {
      state.studies = [];
      renderStart();
      return;
    }

    menu.innerHTML =
      headerHtml("Add to Study", state.selection.reference) +
      '<div class="selection-study-menu-status">Loading studies...</div>';
    positionMenu();

    try {
      await loadStudies();
      renderStart();
    } catch (error) {
      menu.innerHTML =
        headerHtml("Add to Study", state.selection.reference) +
        `<div class="selection-study-menu-status is-error">${escapeHtml(
          error.message || "Could not load your studies."
        )}</div>`;
      positionMenu();
    }
  }

  function bindTriggers() {
    document.querySelectorAll("[data-study-selection-trigger]").forEach((trigger) => {
      trigger.addEventListener("pointerdown", (event) => {
        rememberBibleSelection();
        event.preventDefault();
      });

      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (!ensureMenu().hidden && state.trigger === trigger) {
          closeMenu();
          return;
        }

        openMenu(trigger);
      });
    });
  }

  document.addEventListener("selectionchange", rememberBibleSelection);

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) return;
    if (target.closest("#selection-study-menu, [data-study-selection-trigger]")) return;
    if (state.menu && !state.menu.hidden) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.menu && !state.menu.hidden) {
      closeMenu();
    }
  });

  window.addEventListener("resize", positionMenu);
  window.addEventListener("scroll", positionMenu, true);

  bindTriggers();
})();
