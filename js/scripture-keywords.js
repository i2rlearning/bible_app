"use strict";

// ============================================================================
// Scripture <-> Keyword access from the Bible reading page
//
// User-facing language says "Keyword", while the existing backend/API continues
// to use the established tag model. This file does not change database structure.
//
// UX:
// - Select Scripture text and press the Keywords button, OR click a verse number.
// - A right-side drawer shows Keywords connected to that Scripture reference.
// - Add/remove existing Keywords from the same drawer.
// - Create a new Keyword and connect it immediately.
// - Click a connected Keyword to see all Scriptures connected to that Keyword.
// ============================================================================

(function () {
  const STUDY_SYNC_CHANNEL_NAME = "branch-of-israel-study-sync-v1";
  const STUDY_SYNC_STORAGE_KEY = "branchOfIsraelStudySync";

  const state = {
    drawer: null,
    backdrop: null,
    body: null,
    title: null,
    referenceLabel: null,
    activeReference: "",
    activeDisplayReference: "",
    activeKeyword: null,
    allKeywords: [],
    connectedKeywords: [],
    savedOffsets: null,
    savedAt: 0,
    lastVerseReference: "",
    lastVerseDisplayReference: "",
    lastFocusedElement: null,
    requestId: 0,
    chooserOpen: false,
    searchQuery: ""
  };

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  async function parseResponse(response) {
    const text = await response.text();

    try {
      return text ? JSON.parse(text) : {};
    } catch (error) {
      return { message: text || "Unexpected server response" };
    }
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });

    const result = await parseResponse(response);

    if (!response.ok) {
      const error = new Error(result.message || "Request failed");
      error.status = response.status;
      error.code = result.code || "";
      throw error;
    }

    return result;
  }

  function notifyKeywordDataChanged() {
    const message = {
      type: "keyword-data-changed",
      source: "bible",
      sentAt: Date.now()
    };

    if ("BroadcastChannel" in window) {
      try {
        const channel = new BroadcastChannel(STUDY_SYNC_CHANNEL_NAME);
        channel.postMessage(message);
        window.setTimeout(() => channel.close(), 0);
        return;
      } catch (error) {
        console.warn("Keyword sync channel failed:", error);
      }
    }

    try {
      localStorage.setItem(STUDY_SYNC_STORAGE_KEY, JSON.stringify(message));
      localStorage.removeItem(STUDY_SYNC_STORAGE_KEY);
    } catch (error) {
      console.warn("Keyword sync fallback failed:", error);
    }
  }

  function getBibleContext() {
    const params = new URLSearchParams(window.location.search);
    const chapterId = params.get("chapter") || "";
    const chapterParts = chapterId.split(".");
    const bookId =
      params.get("book") ||
      (chapterParts.length > 1 ? chapterParts[0] : "") ||
      "";

    return {
      // bookId is the stable API.Bible book identifier (for example JHN).
      // It is used for Keyword lookups so connections do not depend on the
      // displayed language or Bible translation.
      bookId,
      // bookName is display-only and may be localized (John, Yochanan, etc.).
      bookName:
        params.get("bookName") ||
        params.get("name") ||
        bookId ||
        "",
      chapterNumber: chapterParts[chapterParts.length - 1] || ""
    };
  }

  function getReferenceBooks(context) {
    return {
      lookupBook: normalizeText(context.bookId || context.bookName),
      displayBook: normalizeText(context.bookName || context.bookId)
    };
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

    if (start === end) return;

    state.savedOffsets = { start, end };
    state.savedAt = Date.now();
  }

  function getSelectionRange() {
    const bibleText = document.getElementById("bible-text");
    const selection = window.getSelection();

    if (!bibleText) return null;

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

  function getVerseNumber(marker) {
    const sid = marker.getAttribute("data-sid") || "";
    const verseId = marker.getAttribute("data-verse-id") || marker.getAttribute("id") || "";

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

  function buildReferenceFromRange(range) {
    const bibleText = document.getElementById("bible-text");
    const context = getBibleContext();
    const books = getReferenceBooks(context);
    const lookupBookChapter = `${books.lookupBook} ${context.chapterNumber}`.trim();
    const displayBookChapter = `${books.displayBook} ${context.chapterNumber}`.trim();

    if (!bibleText || !range || !lookupBookChapter) {
      return null;
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
    if (!startVerse) {
      return {
        reference: lookupBookChapter,
        displayReference: displayBookChapter || lookupBookChapter
      };
    }

    const start = startVerse.split("-")[0];
    const end = endVerse.split("-").pop();
    const suffix = end && end !== start
      ? `:${start}-${end}`
      : `:${start}`;

    return {
      reference: `${lookupBookChapter}${suffix}`,
      displayReference: `${displayBookChapter || lookupBookChapter}${suffix}`
    };
  }

  function buildReferenceFromVerseMarker(marker) {
    const context = getBibleContext();
    const books = getReferenceBooks(context);
    const verse = getVerseNumber(marker);
    const lookupBookChapter = `${books.lookupBook} ${context.chapterNumber}`.trim();
    const displayBookChapter = `${books.displayBook} ${context.chapterNumber}`.trim();

    if (!lookupBookChapter || !verse) return null;

    return {
      reference: `${lookupBookChapter}:${verse}`,
      displayReference: `${displayBookChapter || lookupBookChapter}:${verse}`
    };
  }

  function getCurrentTargetReference() {
    const range = getSelectionRange();
    const selectedTarget = range ? buildReferenceFromRange(range) : null;

    if (selectedTarget?.reference) {
      return selectedTarget;
    }

    if (!state.lastVerseReference) return null;

    return {
      reference: state.lastVerseReference,
      displayReference: state.lastVerseDisplayReference || state.lastVerseReference
    };
  }

  function createDrawer() {
    if (state.drawer) return state.drawer;

    const backdrop = document.createElement("div");
    backdrop.className = "scripture-keywords-backdrop";
    backdrop.hidden = true;

    const drawer = document.createElement("aside");
    drawer.className = "scripture-keywords-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-labelledby", "scripture-keywords-title");
    drawer.hidden = true;

    drawer.innerHTML = `
      <div class="scripture-keywords-header">
        <div class="scripture-keywords-header-copy">
          <h2 id="scripture-keywords-title">Keywords</h2>
          <p class="scripture-keywords-reference"></p>
        </div>
        <button type="button" class="scripture-keywords-close" aria-label="Close Keywords">&times;</button>
      </div>
      <div class="scripture-keywords-body"></div>
    `;

    document.body.append(backdrop, drawer);

    state.drawer = drawer;
    state.backdrop = backdrop;
    state.body = drawer.querySelector(".scripture-keywords-body");
    state.title = drawer.querySelector("#scripture-keywords-title");
    state.referenceLabel = drawer.querySelector(".scripture-keywords-reference");

    drawer
      .querySelector(".scripture-keywords-close")
      ?.addEventListener("click", closeDrawer);

    backdrop.addEventListener("click", closeDrawer);

    return drawer;
  }

  function setTriggerExpanded(expanded) {
    document.querySelectorAll("[data-scripture-keywords-trigger]").forEach((trigger) => {
      trigger.setAttribute("aria-expanded", String(expanded));
    });
  }

  function openShell() {
    createDrawer();

    state.lastFocusedElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    state.backdrop.hidden = false;
    state.drawer.hidden = false;
    document.body.classList.add("scripture-keywords-open");
    setTriggerExpanded(true);

    window.setTimeout(() => {
      state.drawer?.querySelector(".scripture-keywords-close")?.focus();
    }, 0);
  }

  function closeDrawer() {
    if (!state.drawer) return;

    state.requestId += 1;
    state.drawer.hidden = true;
    state.backdrop.hidden = true;
    document.body.classList.remove("scripture-keywords-open");
    setTriggerExpanded(false);
    state.activeKeyword = null;
    state.chooserOpen = false;
    state.searchQuery = "";

    if (state.lastFocusedElement && document.contains(state.lastFocusedElement)) {
      state.lastFocusedElement.focus();
    }
  }

  function setHeader(title, reference = "") {
    createDrawer();
    state.title.textContent = title;
    state.referenceLabel.textContent = reference;
    state.referenceLabel.hidden = !reference;
  }

  function renderMessage(message, type = "") {
    createDrawer();
    state.body.innerHTML = "";

    const status = document.createElement("div");
    status.className = `scripture-keywords-status${type ? ` is-${type}` : ""}`;
    status.textContent = message;
    state.body.appendChild(status);
  }

  function isAuthError(error) {
    return error && (error.status === 401 || error.status === 403);
  }

  function renderNeedSelection() {
    openShell();
    setHeader("Keywords");
    state.body.innerHTML = `
      <div class="scripture-keywords-empty-card">
        <i class="fa fa-tags" aria-hidden="true"></i>
        <strong>Choose a Scripture first</strong>
        <p>Select Scripture text and press Keywords, or click a verse number to open its Keywords.</p>
      </div>
    `;
  }

  function connectedKeywordMap() {
    return new Map(state.connectedKeywords.map((keyword) => [String(keyword.id), keyword]));
  }

  function applyKeywordColor(element, color) {
    const safeColor = /^#[0-9a-f]{6}$/i.test(String(color || ""))
      ? color
      : "#dbeafe";

    element.style.setProperty("--keyword-chip-color", safeColor);
  }

  function createConnectedKeywordChip(keyword) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scripture-keyword-chip";
    button.dataset.keywordId = keyword.id;
    button.title = `View Scriptures connected to ${keyword.name}`;
    button.setAttribute("aria-label", `View Scriptures connected to ${keyword.name}`);
    applyKeywordColor(button, keyword.color);

    const dot = document.createElement("span");
    dot.className = "scripture-keyword-chip-dot";
    dot.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.textContent = keyword.name;

    button.append(dot, label);
    button.addEventListener("click", () => openKeywordScriptures(keyword));
    return button;
  }

  function createChooserRow(keyword, connectedMap) {
    const connected = connectedMap.get(String(keyword.id)) || null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scripture-keyword-choice";
    button.dataset.keywordId = keyword.id;
    button.setAttribute("aria-pressed", String(Boolean(connected)));
    applyKeywordColor(button, keyword.color);

    const swatch = document.createElement("span");
    swatch.className = "scripture-keyword-choice-swatch";
    swatch.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.className = "scripture-keyword-choice-name";
    name.textContent = keyword.name;

    const stateIcon = document.createElement("span");
    stateIcon.className = "scripture-keyword-choice-state";
    stateIcon.setAttribute("aria-hidden", "true");
    stateIcon.textContent = connected ? "✓" : "+";

    button.append(swatch, name, stateIcon);
    button.addEventListener("click", () => toggleKeywordConnection(keyword, button));
    return button;
  }

  function renderChooser(container) {
    const chooser = document.createElement("section");
    chooser.className = "scripture-keyword-chooser";

    const search = document.createElement("input");
    search.type = "search";
    search.className = "scripture-keyword-search";
    search.placeholder = "Search keywords...";
    search.setAttribute("aria-label", "Search keywords");
    search.value = state.searchQuery;

    const list = document.createElement("div");
    list.className = "scripture-keyword-choice-list";

    const createWrap = document.createElement("div");
    createWrap.className = "scripture-keyword-create";
    createWrap.innerHTML = `
      <label for="scripture-new-keyword">New keyword</label>
      <div class="scripture-keyword-create-row">
        <input id="scripture-new-keyword" type="text" maxlength="100" placeholder="e.g. Covenant">
        <button type="button">Create &amp; Add</button>
      </div>
      <div class="scripture-keyword-inline-status" aria-live="polite"></div>
    `;

    function renderChoices() {
      const query = normalizeText(search.value).toLowerCase();
      state.searchQuery = search.value;
      const connectedMap = connectedKeywordMap();
      const matches = state.allKeywords.filter((keyword) => {
        return !query || String(keyword.name || "").toLowerCase().includes(query);
      });

      list.innerHTML = "";

      if (!matches.length) {
        const empty = document.createElement("div");
        empty.className = "scripture-keywords-small-empty";
        empty.textContent = "No matching keywords.";
        list.appendChild(empty);
        return;
      }

      matches.forEach((keyword) => {
        list.appendChild(createChooserRow(keyword, connectedMap));
      });
    }

    search.addEventListener("input", renderChoices);

    const createInput = createWrap.querySelector("input");
    const createButton = createWrap.querySelector("button");
    const createStatus = createWrap.querySelector(".scripture-keyword-inline-status");

    async function createAndAddKeyword() {
      const name = normalizeText(createInput.value);

      if (!name) {
        createStatus.textContent = "Enter a keyword name.";
        createStatus.className = "scripture-keyword-inline-status is-error";
        return;
      }

      createInput.disabled = true;
      createButton.disabled = true;
      createStatus.textContent = "Creating...";
      createStatus.className = "scripture-keyword-inline-status";

      try {
        const created = await requestJson("/api/study-tags", {
          method: "POST",
          body: JSON.stringify({ name })
        });

        const keyword = created.tag;

        if (!keyword?.id) {
          throw new Error("Could not create the keyword.");
        }

        const existingIndex = state.allKeywords.findIndex((item) => item.id === keyword.id);

        if (existingIndex >= 0) {
          state.allKeywords[existingIndex] = keyword;
        } else {
          state.allKeywords.push(keyword);
          state.allKeywords.sort((a, b) => {
            const sortDiff = (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0);
            return sortDiff || String(a.name || "").localeCompare(String(b.name || ""));
          });
        }

        notifyKeywordDataChanged();

        if (!connectedKeywordMap().has(String(keyword.id))) {
          const linked = await requestJson(`/api/study-tags/${encodeURIComponent(keyword.id)}/scriptures`, {
            method: "POST",
            body: JSON.stringify({ reference: state.activeReference })
          });

          state.connectedKeywords.push({
            ...keyword,
            relationshipId: linked.scripture?.id || "",
            note: linked.scripture?.note || ""
          });

          notifyKeywordDataChanged();
        }

        createInput.value = "";
        createStatus.textContent = "Keyword added.";
        createStatus.className = "scripture-keyword-inline-status is-success";
        renderKeywordsView({ focusChooser: true });
      } catch (error) {
        createStatus.textContent = isAuthError(error)
          ? "Log in to create Keywords."
          : (error.message || "Could not create the keyword.");
        createStatus.className = "scripture-keyword-inline-status is-error";
        createInput.disabled = false;
        createButton.disabled = false;
      }
    }

    createButton.addEventListener("click", createAndAddKeyword);
    createInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        createAndAddKeyword();
      }
    });

    chooser.append(search, list, createWrap);
    container.appendChild(chooser);
    renderChoices();
  }

  function renderKeywordsView(options = {}) {
    openShell();
    setHeader("Keywords", state.activeDisplayReference || state.activeReference);
    state.activeKeyword = null;
    state.body.innerHTML = "";

    const intro = document.createElement("p");
    intro.className = "scripture-keywords-intro";
    intro.textContent = "Keywords connected to this Scripture in your library.";

    const topRow = document.createElement("div");
    topRow.className = "scripture-keywords-section-heading";

    const label = document.createElement("strong");
    label.textContent = `Connected Keywords (${state.connectedKeywords.length})`;

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "scripture-keywords-add-button";
    addButton.textContent = state.chooserOpen ? "Done" : "+ Add Keyword";
    addButton.addEventListener("click", () => {
      state.chooserOpen = !state.chooserOpen;
      renderKeywordsView({ focusChooser: state.chooserOpen });
    });

    topRow.append(label, addButton);

    const chips = document.createElement("div");
    chips.className = "scripture-keyword-chip-list";

    if (state.connectedKeywords.length) {
      state.connectedKeywords.forEach((keyword) => {
        chips.appendChild(createConnectedKeywordChip(keyword));
      });
    } else {
      const empty = document.createElement("div");
      empty.className = "scripture-keywords-small-empty";
      empty.textContent = "No Keywords are connected to this Scripture yet.";
      chips.appendChild(empty);
    }

    state.body.append(intro, topRow, chips);

    if (state.chooserOpen) {
      renderChooser(state.body);
    }

    if (options.focusChooser) {
      window.setTimeout(() => {
        state.body.querySelector(".scripture-keyword-search")?.focus();
      }, 0);
    }
  }

  async function toggleKeywordConnection(keyword, button) {
    if (!state.activeReference || button.disabled) return;

    const existing = connectedKeywordMap().get(String(keyword.id));
    button.disabled = true;

    try {
      if (existing?.relationshipId) {
        await requestJson(
          `/api/study-tags/${encodeURIComponent(keyword.id)}/scriptures/${encodeURIComponent(existing.relationshipId)}`,
          { method: "DELETE" }
        );

        state.connectedKeywords = state.connectedKeywords.filter(
          (item) => String(item.id) !== String(keyword.id)
        );
      } else {
        const linked = await requestJson(
          `/api/study-tags/${encodeURIComponent(keyword.id)}/scriptures`,
          {
            method: "POST",
            body: JSON.stringify({ reference: state.activeReference })
          }
        );

        state.connectedKeywords.push({
          ...keyword,
          relationshipId: linked.scripture?.id || "",
          note: linked.scripture?.note || ""
        });
      }

      notifyKeywordDataChanged();
      renderKeywordsView({ focusChooser: true });
    } catch (error) {
      renderMessage(
        isAuthError(error)
          ? "Log in to manage Scripture Keywords."
          : (error.message || "Could not update this Keyword."),
        "error"
      );
    }
  }

  async function loadReferenceKeywords(reference, displayReference = reference) {
    const requestId = ++state.requestId;
    state.activeReference = reference;
    state.activeDisplayReference = displayReference || reference;
    state.activeKeyword = null;
    state.chooserOpen = false;
    state.searchQuery = "";

    openShell();
    setHeader("Keywords", state.activeDisplayReference);
    renderMessage("Loading Keywords...");

    try {
      const [allResult, connectedResult] = await Promise.all([
        requestJson("/api/study-tags"),
        requestJson(`/api/scripture-references/tags?reference=${encodeURIComponent(reference)}`)
      ]);

      if (requestId !== state.requestId) return;

      state.allKeywords = Array.isArray(allResult.tags) ? allResult.tags : [];
      state.connectedKeywords = Array.isArray(connectedResult.tags) ? connectedResult.tags : [];
      renderKeywordsView();
    } catch (error) {
      if (requestId !== state.requestId) return;

      setHeader("Keywords", state.activeDisplayReference);
      renderMessage(
        isAuthError(error)
          ? "Log in to view and manage your Scripture Keywords."
          : (error.message || "Could not load Scripture Keywords."),
        "error"
      );
    }
  }

  function renderKeywordScriptureRow(item) {
    const row = document.createElement("div");
    row.className = "scripture-keyword-scripture-row";

    const reference = document.createElement("strong");
    reference.textContent = item.reference || item.normalizedReference || "Scripture";

    row.appendChild(reference);

    if (item.note) {
      const note = document.createElement("p");
      note.textContent = item.note;
      row.appendChild(note);
    }

    return row;
  }

  async function openKeywordScriptures(keyword) {
    const requestId = ++state.requestId;
    state.activeKeyword = keyword;
    state.chooserOpen = false;

    setHeader(keyword.name, "Scriptures connected to this Keyword");
    state.body.innerHTML = "";

    const backButton = document.createElement("button");
    backButton.type = "button";
    backButton.className = "scripture-keywords-back-button";
    backButton.textContent = "‹ Back to Scripture Keywords";
    backButton.addEventListener("click", () => {
      state.requestId += 1;
      renderKeywordsView();
    });

    state.body.appendChild(backButton);
    const loading = document.createElement("div");
    loading.className = "scripture-keywords-status";
    loading.textContent = "Loading Scriptures...";
    state.body.appendChild(loading);

    try {
      const result = await requestJson(
        `/api/study-tags/${encodeURIComponent(keyword.id)}/scriptures`
      );

      if (requestId !== state.requestId) return;

      const scriptures = Array.isArray(result.scriptures) ? result.scriptures : [];
      state.body.innerHTML = "";
      state.body.appendChild(backButton);

      const summary = document.createElement("p");
      summary.className = "scripture-keywords-intro";
      summary.textContent = `${scriptures.length} Scripture${scriptures.length === 1 ? "" : "s"} connected to ${keyword.name}.`;
      state.body.appendChild(summary);

      const list = document.createElement("div");
      list.className = "scripture-keyword-scripture-list";

      if (!scriptures.length) {
        const empty = document.createElement("div");
        empty.className = "scripture-keywords-small-empty";
        empty.textContent = "No Scriptures are connected to this Keyword yet.";
        list.appendChild(empty);
      } else {
        scriptures.forEach((item) => list.appendChild(renderKeywordScriptureRow(item)));
      }

      state.body.appendChild(list);
    } catch (error) {
      if (requestId !== state.requestId) return;

      state.body.innerHTML = "";
      state.body.appendChild(backButton);
      const message = document.createElement("div");
      message.className = "scripture-keywords-status is-error";
      message.textContent = error.message || "Could not load Scriptures for this Keyword.";
      state.body.appendChild(message);
    }
  }

  function openFromCurrentContext() {
    rememberBibleSelection();
    const target = getCurrentTargetReference();

    if (!target?.reference) {
      renderNeedSelection();
      return;
    }

    loadReferenceKeywords(target.reference, target.displayReference);
  }

  function bindTriggers() {
    document.querySelectorAll("[data-scripture-keywords-trigger]").forEach((trigger) => {
      if (trigger.dataset.keywordTriggerReady === "true") return;
      trigger.dataset.keywordTriggerReady = "true";

      trigger.addEventListener("pointerdown", (event) => {
        rememberBibleSelection();
        event.preventDefault();
      });

      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (typeof window.closeMobileToolbarMenus === "function") {
          window.closeMobileToolbarMenus();
        }

        if (state.drawer && !state.drawer.hidden) {
          closeDrawer();
          return;
        }

        openFromCurrentContext();
      });
    });
  }

  function decorateVerseMarkers() {
    const bibleText = document.getElementById("bible-text");
    if (!bibleText) return;

    bibleText.querySelectorAll(".v").forEach((marker) => {
      if (marker.dataset.keywordVerseReady === "true") return;

      const target = buildReferenceFromVerseMarker(marker);
      const labelReference = target?.displayReference || target?.reference || "";
      marker.dataset.keywordVerseReady = "true";
      marker.setAttribute("role", "button");
      marker.setAttribute("tabindex", "0");
      marker.setAttribute(
        "aria-label",
        labelReference ? `Open Keywords for ${labelReference}` : "Open Scripture Keywords"
      );
      marker.title = labelReference ? `Keywords for ${labelReference}` : "Scripture Keywords";
    });
  }

  function bindVerseMarkerAccess() {
    const bibleText = document.getElementById("bible-text");
    if (!bibleText) return;

    const observer = new MutationObserver(decorateVerseMarkers);
    observer.observe(bibleText, { childList: true, subtree: true });
    decorateVerseMarkers();

    bibleText.addEventListener("click", (event) => {
      const marker = event.target.closest?.(".v[data-keyword-verse-ready='true']");
      if (!marker || !bibleText.contains(marker)) return;

      const target = buildReferenceFromVerseMarker(marker);
      if (!target?.reference) return;

      event.preventDefault();
      event.stopPropagation();
      state.lastVerseReference = target.reference;
      state.lastVerseDisplayReference = target.displayReference || target.reference;
      state.savedOffsets = null;
      loadReferenceKeywords(target.reference, target.displayReference);
    });

    bibleText.addEventListener("keydown", (event) => {
      const marker = event.target.closest?.(".v[data-keyword-verse-ready='true']");
      if (!marker || !bibleText.contains(marker)) return;
      if (event.key !== "Enter" && event.key !== " ") return;

      const target = buildReferenceFromVerseMarker(marker);
      if (!target?.reference) return;

      event.preventDefault();
      state.lastVerseReference = target.reference;
      state.lastVerseDisplayReference = target.displayReference || target.reference;
      state.savedOffsets = null;
      loadReferenceKeywords(target.reference, target.displayReference);
    });
  }

  document.addEventListener("selectionchange", rememberBibleSelection);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.drawer && !state.drawer.hidden) {
      closeDrawer();
    }
  });

  bindTriggers();
  bindVerseMarkerAccess();
})();
