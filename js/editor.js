import BlotFormatter2 from "https://cdn.jsdelivr.net/npm/@enzedonline/quill-blot-formatter2@3.2.0/+esm";

// Register the Quill 2 compatible image resize/formatting module once
Quill.register("modules/blotFormatter2", BlotFormatter2);

// ----------------------------------------------------
// Quill Custom Icons Setup (Must be before toolbarOptions)
// ----------------------------------------------------
const icons = Quill.import("ui/icons");
icons["datestamp"] = '<svg viewbox="0 0 18 18"><rect class="ql-stroke" x="3" y="4" width="12" height="11" rx="1"></rect><line class="ql-stroke" x1="3" y1="7" x2="15" y2="7"></line><line class="ql-stroke" x1="6" y1="2" x2="6" y2="5"></line><line class="ql-stroke" x1="12" y1="2" x2="12" y2="5"></line></svg>';
icons["timestamp"] = '<svg viewbox="0 0 18 18"><circle class="ql-stroke" cx="9" cy="9" r="6"></circle><polyline class="ql-stroke" points="9 5 9 9 11 9"></polyline></svg>';

// ----------------------------------------------------
// Quill font-size setup
// ----------------------------------------------------
const Size = Quill.import("attributors/class/size");
Size.whitelist = ["8px", "10px", "12px", "14px", "18px", "24px", "32px"];
Quill.register(Size, true);

// ----------------------------------------------------
// Quill Toolbar Configuration
// ----------------------------------------------------
const toolbarOptions = [
  // Group 1: Font Size
  [{ size: [false, "8px", "10px", "12px", "14px", "18px", "24px", "32px"] }],
  ["bold", "italic", "underline", "strike"],
  [{ color: [] }, { background: [] }],
  [{ list: "ordered" }, { list: "bullet" }, { list: "check" }],
  [{ align: [] }],
  [{ script: "sub" }, { script: "super" }],
  [{ indent: "-1" }, { indent: "+1" }],
  [{ direction: "rtl" }],
  ["link", "image"],
  ["datestamp", "timestamp"],
  ["clean"]
];

const quill = new Quill("#editor", {
  placeholder: "Notes...",
  theme: "snow",
  modules: {
    blotFormatter2: {
      resize: {
        useRelativeSize: false
      }
    }, // Activate image resizing module for Quill
    toolbar: {
      container: toolbarOptions,
      handlers: {
        datestamp: function () {
          const now = new Date();

          const dateStamp = now.toLocaleDateString([], {
            month: "short",
            day: "numeric",
            year: "numeric"
          });

          const range = this.quill.getSelection(true);

          if (range) {
            this.quill.insertText(range.index, dateStamp);
            this.quill.setSelection(range.index + dateStamp.length);
          }
        },

        timestamp: function () {
          const now = new Date();

          const timeStamp = now.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
          });

          const range = this.quill.getSelection(true);

          if (range) {
            this.quill.insertText(range.index, timeStamp);
            this.quill.setSelection(range.index + timeStamp.length);
          }
        }
      }
    }
  }
});

// ----------------------------------------------------
// Paste Guard: Block Large Image Pastes & Clear Event
// ----------------------------------------------------
quill.root.addEventListener(
  "paste",
  (e) => {
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;

    const items = clipboardData.items;
    let hasImage = false;

    // Check if any part of the paste contains an image
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        hasImage = true;
        break;
      }
    }

    if (hasImage) {
      // Stop the browser from pasting an image
      e.preventDefault();
      e.stopPropagation();

      alert("Direct image pasting is not allowed as this feature is diabled. Please save the image locally and use the 'Insert Image' button to insert it.");
    }

    // If there is NO image (just text), the code does nothing
    // and lets the standard paste happen naturally.
  },
  true
); // The "true" here ensures we catch the event before Quill does

const toolbar = quill.getModule("toolbar");

// ----------------------------------------------------
// Save status in top navbar
// ----------------------------------------------------
function getEditorSaveStatusElement() {
  let status = document.getElementById("editor-save-status");

  if (!status) {
    status = document.createElement("span");
    status.id = "editor-save-status";
    status.className = "editor-save-status";
    status.textContent = "";

    // Place inside the main flex container of stickyHeader
    const flexContainer = document.querySelector("#stickyHeader .container.flex");
    if (flexContainer) {
      flexContainer.appendChild(status);  // append anywhere
    } else {
      document.body.appendChild(status);
    }
  }

  return status;
}

let editorSaveStatusClearTimer = null;

function syncEditorSaveStatusVisibility(status) {
  const hasMessage = Boolean(status?.textContent?.trim());
  const statusColumn = status?.closest?.(".save-status-column");

  status?.classList.toggle(
    "editor-save-status-visible",
    hasMessage
  );

  statusColumn?.classList.toggle(
    "save-status-column-visible",
    hasMessage
  );
}

function setEditorSaveStatus(message) {
  const status = getEditorSaveStatusElement();

  if (!status) return;

  status.textContent = message || "";

  status.classList.remove(
    "editor-save-status-saving",
    "editor-save-status-saved",
    "editor-save-status-failed"
  );

  if (message === "Saving...") {
    status.classList.add("editor-save-status-saving");
  }

  if (message === "Saved") {
    status.classList.add("editor-save-status-saved");
  }

  if (message === "Save failed") {
    status.classList.add("editor-save-status-failed");
  }

  syncEditorSaveStatusVisibility(status);

  clearTimeout(editorSaveStatusClearTimer);

  if (message === "Saved") {
    editorSaveStatusClearTimer = setTimeout(() => {
      status.textContent = "";
      status.classList.remove("editor-save-status-saved");
      syncEditorSaveStatusVisibility(status);
    }, 3000);
  }
}

// ----------------------------------------------------
// Small helper for safer fetch response parsing
// ----------------------------------------------------
async function parseResponseSafely(response) {
  const responseText = await response.text();

  let result = {};
  try {
    result = responseText ? JSON.parse(responseText) : {};
  } catch (parseError) {
    result = { message: responseText };
  }

  return result;
}

// ----------------------------------------------------
// Page navigation state
// ----------------------------------------------------
let editorPageIsLeaving = false;

window.addEventListener("beforeunload", () => {
  editorPageIsLeaving = true;
});

window.addEventListener("pagehide", () => {
  editorPageIsLeaving = true;
});

document.addEventListener(
  "click",
  (event) => {
    const clickedElement = event.target;

    if (!clickedElement || typeof clickedElement.closest !== "function") return;

    const link = clickedElement.closest("a");

    if (link && link.href) {
      editorPageIsLeaving = true;
    }
  },
  true
);

// ----------------------------------------------------
// Tooltips and UI
// ----------------------------------------------------

const sizeSelect = toolbar?.container?.querySelector("select.ql-size");

if (sizeSelect) {
  sizeSelect.setAttribute("title", "Change Font Size");
}

const btnTitles = {
  "ql-bold": "Bold",
  "ql-italic": "Italic",
  "ql-underline": "Underline",
  "ql-strike": "Strikethrough",
  "ql-link": "Insert Link",
  "ql-image": "Insert Image",
  "ql-direction": "Text Direction",
  "ql-datestamp": "Insert Date",
  "ql-timestamp": "Insert Time",
  "ql-clean": "Clear Format"
};

Object.keys(btnTitles).forEach((cls) => {
  toolbar?.container?.querySelector(`button.${cls}`)?.setAttribute("title", btnTitles[cls]);
});

toolbar?.container?.querySelector("select.ql-align")?.parentElement.setAttribute("title", "Align Text");
toolbar?.container?.querySelector(".ql-color")?.setAttribute("title", "Font Color");
toolbar?.container?.querySelector(".ql-background")?.setAttribute("title", "Background Color");
toolbar?.container?.querySelector('button.ql-list[value="ordered"]')?.setAttribute("title", "Ordered List");
toolbar?.container?.querySelector('button.ql-list[value="bullet"]')?.setAttribute("title", "Bullet List");
toolbar?.container?.querySelector('button.ql-list[value="check"]')?.setAttribute("title", "Checkbox List");
toolbar?.container?.querySelector('button.ql-indent[value="-1"]')?.setAttribute("title", "Outdent");
toolbar?.container?.querySelector('button.ql-indent[value="+1"]')?.setAttribute("title", "Indent");
toolbar?.container?.querySelector('button.ql-script[value="sub"]')?.setAttribute("title", "Subscript");
toolbar?.container?.querySelector('button.ql-script[value="super"]')?.setAttribute("title", "Superscript");

// ----------------------------------------------------
// Auth lock for editor tools
// ----------------------------------------------------
let editorToolsUnlocked = false;

async function checkEditorAuth() {
  try {
    const response = await fetch("/api/me", {
      method: "GET",
      credentials: "include"
    });

    const result = await response.json();

    if (response.ok && result.ok && result.user) {
      unlockEditorTools();

      if (typeof loadQuillNotes === "function") {
        loadQuillNotes();
      }

      if (typeof loadMiniEditorPage === "function") {
        waitForBibleTextContent().then((ready) => {
          if (ready) {
            loadMiniEditorPage();
          }
        });
      }
    } else {
      lockEditorTools();
    }
  } catch (error) {
    lockEditorTools();
  }
}

function lockEditorTools() {
  editorToolsUnlocked = false;

  document.body.classList.add("editor-locked-state");

  if (typeof quill !== "undefined") {
    quill.disable();
    quill.root.setAttribute("data-placeholder", "Log in to use notes and editor tools.");
  }

  const miniToolbar = document.getElementById("bible-mini-toolbar");

  if (miniToolbar) {
    miniToolbar.classList.add("editor-tools-locked");

    miniToolbar.querySelectorAll("button").forEach((button) => {
      button.disabled = true;
    });
  }

  const quillToolbar = document.querySelector(".ql-toolbar");

  if (quillToolbar) {
    quillToolbar.classList.add("editor-tools-locked");

    quillToolbar.querySelectorAll("button, select").forEach((control) => {
      control.disabled = true;
    });
  }

  if (typeof setDrawingTool === "function") {
    setDrawingTool(null);
  }

  const message = document.getElementById("editor-login-message");

  if (message) {
    message.remove();
  }

  setEditorSaveStatus("");
}

function unlockEditorTools() {
  editorToolsUnlocked = true;
  document.body.classList.remove("editor-locked-state");

  if (typeof quill !== "undefined") {
    quill.enable();
    quill.root.setAttribute("data-placeholder", "Notes...");
  }

  const miniToolbar = document.getElementById("bible-mini-toolbar");
  if (miniToolbar) {
    miniToolbar.classList.remove("editor-tools-locked");
    miniToolbar.querySelectorAll("button").forEach((button) => {
      button.disabled = false;
    });
  }

  const quillToolbar = document.querySelector(".ql-toolbar");
  if (quillToolbar) {
    quillToolbar.classList.remove("editor-tools-locked");
    quillToolbar.querySelectorAll("button, select").forEach((control) => {
      control.disabled = false;
    });
  }

  const message = document.getElementById("editor-login-message");
  if (message) {
    message.remove();
  }

  setEditorSaveStatus("");
  updateMiniEditorHistoryControls();
  }
  
// ----------------------------------------------------
// Quill notes save/load
// ----------------------------------------------------
let quillSaveTimer = null;
let quillNotesLoaded = false;

function getCurrentBiblePageIdentity() {
  const urlParams = new URLSearchParams(window.location.search);

  const bibleVersionID =
    urlParams.get("version") ||
    urlParams.get("bible") ||
    urlParams.get("bibleId") ||
    "";

  const bibleChapterID =
    urlParams.get("chapter") ||
    urlParams.get("chapterId") ||
    "";

  if (!bibleVersionID || !bibleChapterID) {
    console.warn("Missing Bible page identity", {
      bibleVersionID,
      bibleChapterID
    });

    return null;
  }

  return {
    bibleVersionID,
    bibleChapterID,
    pageKey: `${bibleVersionID}::${bibleChapterID}`
  };
}

function getCurrentBookChapterLabel() {
  const urlParams = new URLSearchParams(window.location.search);

  const rawChapter =
    urlParams.get("chapter") ||
    urlParams.get("chapterId") ||
    "";

  const bookName =
    urlParams.get("bookName") ||
    urlParams.get("name") ||
    "";

  const bookId =
    urlParams.get("book") ||
    (rawChapter.includes(".")
      ? rawChapter.split(".")[0]
      : "");

  const chapterLabel =
    rawChapter.includes(".")
      ? rawChapter.split(".").pop()
      : rawChapter;

  if (bookName && chapterLabel) {
    return `${bookName} ${chapterLabel}`.trim();
  }

  if (rawChapter.includes(".")) {
    return rawChapter.trim();
  }

  if (bookId && chapterLabel) {
    return `${bookId}.${chapterLabel}`.trim();
  }

  const currentPassageLabel =
    document.getElementById("current-passage-label")
      ?.textContent
      ?.trim() ||
    "";

  if (currentPassageLabel.includes("·")) {
    return currentPassageLabel
      .split("·")
      .pop()
      .trim();
  }

  return currentPassageLabel;
}


async function loadQuillNotes() {
  if (typeof quill === "undefined") return;

  const pageIdentity = getCurrentBiblePageIdentity();

  if (!pageIdentity) return;

  try {
    const response = await fetch(`/api/quill-notes?pageKey=${encodeURIComponent(pageIdentity.pageKey)}`, {
      method: "GET",
      credentials: "include"
    });

    const result = await parseResponseSafely(response);

    if (!response.ok) {
      throw new Error(result.message || `Failed to load Quill notes. Status: ${response.status}`);
    }

    if (result.note && result.note.quill_delta_json) {
      quill.setContents(result.note.quill_delta_json);
    }

    quillNotesLoaded = true;
  } catch (error) {
    console.error("Load Quill notes error:", error);
    quillNotesLoaded = true;
  }
}

async function saveQuillNotes() {
  if (typeof quill === "undefined") return;
  if (!editorToolsUnlocked) return;
  if (!quillNotesLoaded) return;

  const pageIdentity = getCurrentBiblePageIdentity();

  if (!pageIdentity) return;

  try {
    const quillDelta = quill.getContents();
    const plainText = quill.getText().trim();

    if (!plainText) {
      const deleteResponse = await fetch(
        `/api/quill-notes?pageKey=${encodeURIComponent(pageIdentity.pageKey)}`,
        {
          method: "DELETE",
          credentials: "include"
        }
      );

      if (!deleteResponse.ok) {
        throw new Error("Failed to delete empty notes");
      }

      console.log("Empty Quill notes deleted");
      setEditorSaveStatus("Saved");
      return;
    }

    const response = await fetch("/api/quill-notes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        bibleVersionID: pageIdentity.bibleVersionID,
        bibleChapterID: pageIdentity.bibleChapterID,
        pageKey: pageIdentity.pageKey,
        pageUrl: window.location.pathname + window.location.search,
        bookChapterLabel: getCurrentBookChapterLabel(),
        quillDelta,
        plainText
      })
    });

    const result = await parseResponseSafely(response);

    if (!response.ok) {
      throw new Error(result.message || `Failed to save Quill editor notes. Status: ${response.status}`);
    }

    console.log("Quill notes saved");
    setEditorSaveStatus("Saved");
  } catch (error) {
    if (editorPageIsLeaving || document.visibilityState === "hidden") {
      return;
    }

    console.error("Save Quill notes error:", error);
    setEditorSaveStatus("Save failed");
  }
}

function scheduleQuillNotesSave() {
  if (!editorToolsUnlocked) return;
  if (!quillNotesLoaded) return;

  setEditorSaveStatus("Saving...");

  clearTimeout(quillSaveTimer);

  quillSaveTimer = setTimeout(() => {
    saveQuillNotes();
  }, 1200);
}

if (typeof quill !== "undefined") {
  quill.on("text-change", function () {
    scheduleQuillNotesSave();
  });
}

function waitForBibleTextContent(maxWaitMs = 5000) {
  return new Promise((resolve) => {
    const bibleText = document.getElementById("bible-text");

    if (!bibleText) {
      resolve(false);
      return;
    }

    if (bibleText.textContent.trim().length > 0) {
      resolve(true);
      return;
    }

    const startedAt = Date.now();

    const interval = setInterval(() => {
      if (bibleText.textContent.trim().length > 0) {
        clearInterval(interval);
        resolve(true);
        return;
      }

      if (Date.now() - startedAt >= maxWaitMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, 200);
  });
}

// ----------------------------------------------------
// Bible annotation layout helpers
// ----------------------------------------------------
let bibleLayoutRefreshFrame = null;

function refreshBibleAnnotationLayout() {
  if (bibleLayoutRefreshFrame) {
    cancelAnimationFrame(bibleLayoutRefreshFrame);
  }

  bibleLayoutRefreshFrame = requestAnimationFrame(() => {
    // Let the browser/CSS recalculate the Bible text width first. This is
    // especially important when the viewport grows back after being narrow.
    if (typeof updateBibleZoomLayout === "function") {
      updateBibleZoomLayout();
    }

    resizeAnnotationLayer();
    ensureAllAnnotationMetadata();
    updateAnnotationLayoutWarning();
    window.AnchoredAnnotations?.render?.();

    bibleLayoutRefreshFrame = null;
  });
}

let bibleLayoutObserverStarted = false;
let bibleTextResizeObserver = null;

function startBibleLayoutObservers() {
  if (bibleLayoutObserverStarted) return;

  const bibleText = document.getElementById("bible-text");
  const displayText = document.getElementById("display-text");
  const drawingArea = document.getElementById("bible-drawing-area");

  if (!bibleText) return;

  bibleLayoutObserverStarted = true;

  if (typeof ResizeObserver !== "undefined") {
    bibleTextResizeObserver = new ResizeObserver(() => {
      refreshBibleAnnotationLayout();
    });

    // Watch every layout box that can affect text wrapping or annotation size.
    [displayText, drawingArea, bibleText].forEach((element) => {
      if (element) bibleTextResizeObserver.observe(element);
    });
  }

  window.addEventListener("resize", refreshBibleAnnotationLayout);

  window.addEventListener("orientationchange", () => {
    setTimeout(refreshBibleAnnotationLayout, 250);
  });
}

// ----------------------------------------------------
// Mini-editor save/load
// ----------------------------------------------------
let miniEditorSaveTimer = null;
let miniEditorLoaded = false;
let miniEditorApplyingState = false;
let miniEditorObserver = null;

function getMiniEditorState() {
  const bibleText = document.getElementById("bible-text");
  const annotationLayer = document.getElementById("bible-annotation-layer");

  if (!bibleText) return null;

  ensureAllAnnotationMetadata();

  return {
    bibleTextHtml: bibleText.innerHTML,
    annotationLayerHtml: annotationLayer ? annotationLayer.innerHTML : "",
    anchoredAnnotations:
      window.AnchoredAnnotations?.getState?.() || []
  };
}

function applyMiniEditorState(miniEditorJson) {
  const bibleText = document.getElementById("bible-text");
  const annotationLayer = document.getElementById("bible-annotation-layer");

  if (!bibleText || !miniEditorJson) return;

  miniEditorApplyingState = true;

  if (miniEditorJson.bibleTextHtml) {
    bibleText.innerHTML = miniEditorJson.bibleTextHtml;
  }

  if (annotationLayer && typeof miniEditorJson.annotationLayerHtml === "string") {
    annotationLayer.innerHTML = miniEditorJson.annotationLayerHtml;
  }

  window.AnchoredAnnotations?.setState?.(
    miniEditorJson.anchoredAnnotations || []
  );

  // Important: recalculate the drawing layer after saved text/drawings are restored
  requestAnimationFrame(() => {
    ensureAllAnnotationMetadata();

    if (typeof refreshBibleAnnotationLayout === "function") {
      refreshBibleAnnotationLayout();
    }

    window.AnchoredAnnotations?.render?.();
  });

  setTimeout(() => {
    miniEditorApplyingState = false;
  }, 300);
}

function getMiniEditorFlags(miniEditorJson) {
  const bibleTextHtml = miniEditorJson?.bibleTextHtml || "";
  const annotationLayerHtml = miniEditorJson?.annotationLayerHtml || "";
  const anchoredAnnotations = Array.isArray(
    miniEditorJson?.anchoredAnnotations
  )
    ? miniEditorJson.anchoredAnnotations
    : [];

  return {
    hasHighlights: bibleTextHtml.includes("highlight-"),
    hasDrawings:
      annotationLayerHtml.trim().length > 0 ||
      anchoredAnnotations.length > 0 ||
      bibleTextHtml.includes("anchored-inline-annotation"),
    hasTextFormats:
      bibleTextHtml.includes("bible-user-format bold") ||
      bibleTextHtml.includes("bible-user-format italic") ||
      bibleTextHtml.includes("bible-user-format underline") ||
      bibleTextHtml.includes("bible-user-format double-underline") ||
      bibleTextHtml.includes("bible-user-format overline-underline") ||
      bibleTextHtml.includes("bible-user-format strike-through") ||
      bibleTextHtml.includes("bible-user-format uppercase") ||
      bibleTextHtml.includes("text-grey") ||
      bibleTextHtml.includes("text-red") ||
      bibleTextHtml.includes("text-blue") ||
      bibleTextHtml.includes("text-green") ||
      bibleTextHtml.includes("text-purple") ||
      bibleTextHtml.includes("text-black")
  };
}


// ----------------------------------------------------
// Mini-editor history (undo / redo)
// ----------------------------------------------------
const MINI_EDITOR_HISTORY_LIMIT = 50;
let miniEditorUndoStack = [];
let miniEditorRedoStack = [];
let miniEditorHistorySignature = "";
let miniEditorHistoryReady = false;
let miniEditorHistoryApplying = false;
let miniEditorHistorySaveTimer = null;

function getMiniEditorHistorySnapshot() {
  const bibleText = document.getElementById("bible-text");
  const annotationLayer = document.getElementById("bible-annotation-layer");

  if (!bibleText) return null;

  return {
    bibleTextHtml: bibleText.innerHTML,
    annotationLayerHtml: annotationLayer ? annotationLayer.innerHTML : "",
    anchoredAnnotations:
      window.AnchoredAnnotations?.getState?.() || []
  };
}

function getMiniEditorHistorySignature(snapshot) {
  if (!snapshot) return "";

  return [
    snapshot.bibleTextHtml || "",
    snapshot.annotationLayerHtml || "",
    JSON.stringify(snapshot.anchoredAnnotations || [])
  ].join("::");
}

function initializeMiniEditorHistory() {
  const snapshot = getMiniEditorHistorySnapshot();
  if (!snapshot) return;

  miniEditorUndoStack = [snapshot];
  miniEditorRedoStack = [];
  miniEditorHistorySignature = getMiniEditorHistorySignature(snapshot);
  miniEditorHistoryReady = true;
  updateMiniEditorHistoryControls();
}

function updateMiniEditorHistoryControls() {
  const canUndo =
    miniEditorHistoryReady &&
    miniEditorUndoStack.length > 1;

  const canRedo =
    miniEditorHistoryReady &&
    miniEditorRedoStack.length > 0;

  document
    .querySelectorAll(
      '[onclick*="undoMiniEditorChange"]'
    )
    .forEach((button) => {
      button.disabled = !canUndo;
      button.classList.toggle(
        "history-button-disabled",
        !canUndo
      );
      button.setAttribute(
        "aria-disabled",
        String(!canUndo)
      );
    });

  document
    .querySelectorAll(
      '[onclick*="redoMiniEditorChange"]'
    )
    .forEach((button) => {
      button.disabled = !canRedo;
      button.classList.toggle(
        "history-button-disabled",
        !canRedo
      );
      button.setAttribute(
        "aria-disabled",
        String(!canRedo)
      );
    });
}

function recordMiniEditorHistorySnapshot() {
  if (!editorToolsUnlocked) return;
  if (!miniEditorLoaded) return;
  if (miniEditorApplyingState) return;
  if (miniEditorHistoryApplying) return;

  const snapshot = getMiniEditorHistorySnapshot();
  if (!snapshot) return;

  const signature = getMiniEditorHistorySignature(snapshot);
  if (!signature || signature === miniEditorHistorySignature) return;

  miniEditorUndoStack.push(snapshot);

  if (miniEditorUndoStack.length > MINI_EDITOR_HISTORY_LIMIT) {
    miniEditorUndoStack.shift();
  }

  miniEditorRedoStack = [];
  miniEditorHistorySignature = signature;
  miniEditorHistoryReady = true;
  updateMiniEditorHistoryControls();
}

function scheduleMiniEditorSaveAfterHistoryApply() {
  clearTimeout(miniEditorHistorySaveTimer);

  miniEditorHistorySaveTimer = setTimeout(() => {
    if (!miniEditorHistoryApplying) {
      scheduleMiniEditorSave();
    }
  }, 80);
}

function applyMiniEditorHistorySnapshot(snapshot) {
  const bibleText = document.getElementById("bible-text");
  const annotationLayer = document.getElementById("bible-annotation-layer");

  if (!bibleText || !snapshot) return;

  miniEditorApplyingState = true;
  miniEditorHistoryApplying = true;

  bibleText.innerHTML = snapshot.bibleTextHtml || "";

  if (annotationLayer) {
    annotationLayer.innerHTML = snapshot.annotationLayerHtml || "";
  }

  window.AnchoredAnnotations?.setState?.(
    snapshot.anchoredAnnotations || []
  );

  selectedDrawnAnnotation = null;
  currentShape = null;
  currentFreehandGroup = null;
  freehandSessionHasChanges = false;

  requestAnimationFrame(() => {
    ensureAllAnnotationMetadata();
    resizeAnnotationLayer();
    updateAnnotationLayoutWarning();

    if (typeof updateBibleZoomLayout === "function") {
      updateBibleZoomLayout();
    }

    window.AnchoredAnnotations?.render?.();
  });

  setTimeout(() => {
    miniEditorApplyingState = false;
    miniEditorHistoryApplying = false;
    miniEditorHistorySignature = getMiniEditorHistorySignature(snapshot);
    updateMiniEditorHistoryControls();
    scheduleMiniEditorSaveAfterHistoryApply();
  }, 120);
}

function undoMiniEditorChange() {
  if (currentFreehandGroup) {
    finalizeFreehandGroup({ recordHistory: true });
  }

  if (!miniEditorHistoryReady) {
    initializeMiniEditorHistory();
  }

  if (miniEditorUndoStack.length <= 1) return;

  const currentSnapshot = miniEditorUndoStack.pop();
  const previousSnapshot = miniEditorUndoStack[miniEditorUndoStack.length - 1];

  miniEditorRedoStack.push(currentSnapshot);
  updateMiniEditorHistoryControls();
  applyMiniEditorHistorySnapshot(previousSnapshot);
}

function redoMiniEditorChange() {
  if (currentFreehandGroup) {
    finalizeFreehandGroup({ recordHistory: true });
  }

  if (!miniEditorHistoryReady || miniEditorRedoStack.length === 0) return;

  const nextSnapshot = miniEditorRedoStack.pop();
  miniEditorUndoStack.push(nextSnapshot);
  updateMiniEditorHistoryControls();
  applyMiniEditorHistorySnapshot(nextSnapshot);
}

function isQuillEditorTarget(target) {
  return Boolean(target?.closest?.(".ql-editor"));
}

function isTypingTarget(target) {
  if (!target) return false;

  const tagName = target.tagName?.toLowerCase();

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    (target.isContentEditable && !target.closest?.("#bible-text"))
  );
}

function hasBibleSelectionContext() {
  const bibleText = document.getElementById("bible-text");
  const selection = window.getSelection();

  if (
    bibleText &&
    selection &&
    selection.rangeCount &&
    !selection.isCollapsed &&
    bibleText.contains(selection.getRangeAt(0).commonAncestorContainer)
  ) {
    return true;
  }

  return Boolean(savedBibleSelectionOffsets);
}

function handleMiniEditorKeyboardShortcuts(event) {
  if (!editorToolsUnlocked) return;
  if (!event.ctrlKey && !event.metaKey) return;
  if (event.altKey) return;

  const key = event.key.toLowerCase();
  const target = event.target;

  // Let Quill handle its own note-editor shortcuts/history.
  if (isQuillEditorTarget(target)) return;

  if (key === "z") {
    event.preventDefault();

    if (event.shiftKey) {
      redoMiniEditorChange();
    } else {
      undoMiniEditorChange();
    }

    return;
  }

  if (key === "y") {
    event.preventDefault();
    redoMiniEditorChange();
    return;
  }

  if (isTypingTarget(target)) return;

  if (key === "b" && hasBibleSelectionContext()) {
    event.preventDefault();
    applyBibleFormat("bold");
    return;
  }

  if (key === "i" && hasBibleSelectionContext()) {
    event.preventDefault();
    applyBibleFormat("italic");
    return;
  }

  if (key === "u" && hasBibleSelectionContext()) {
    event.preventDefault();
    applyBibleFormat("underline");
    return;
  }
}

document.addEventListener("keydown", handleMiniEditorKeyboardShortcuts);

async function loadMiniEditorPage() {
  if (!editorToolsUnlocked) return;

  const pageIdentity = getCurrentBiblePageIdentity();

  if (!pageIdentity) return;

  try {
    const response = await fetch(`/api/mini-editor-page?pageKey=${encodeURIComponent(pageIdentity.pageKey)}`, {
      method: "GET",
      credentials: "include"
    });

    const result = await parseResponseSafely(response);

    if (!response.ok) {
      throw new Error(result.message || `Failed to load mini-editor page. Status: ${response.status}`);
    }

    if (result.page && result.page.mini_editor_json) {
      const savedState =
        typeof result.page.mini_editor_json === "string"
          ? JSON.parse(result.page.mini_editor_json)
          : result.page.mini_editor_json;

      applyMiniEditorState(savedState);
    }

    miniEditorLoaded = true;
    initializeMiniEditorHistory();
    startBibleLayoutObservers();
    startMiniEditorObserver();
  } catch (error) {
    console.error("Load mini-editor page error:", error);
    miniEditorLoaded = true;
    initializeMiniEditorHistory();
    startBibleLayoutObservers();
    startMiniEditorObserver();
  }
}

async function saveMiniEditorPage() {
  if (!editorToolsUnlocked) return;
  if (!miniEditorLoaded) return;

  const pageIdentity = getCurrentBiblePageIdentity();

  if (!pageIdentity) return;

  const miniEditorJson = getMiniEditorState();

  if (!miniEditorJson) return;

  const flags = getMiniEditorFlags(miniEditorJson);

  try {
    if (!flags.hasHighlights && !flags.hasDrawings && !flags.hasTextFormats) {
      const deleteResponse = await fetch(
        `/api/mini-editor-page?pageKey=${encodeURIComponent(pageIdentity.pageKey)}`,
        {
          method: "DELETE",
          credentials: "include"
        }
      );

      if (!deleteResponse.ok) {
        const result = await parseResponseSafely(deleteResponse);
        throw new Error(result.message || "Failed to delete empty mini-editor page");
      }

      console.log("Empty mini-editor page deleted");
      setEditorSaveStatus("Saved");
      return;
    }

    const response = await fetch("/api/mini-editor-page", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        bibleVersionID: pageIdentity.bibleVersionID,
        bibleChapterID: pageIdentity.bibleChapterID,
        pageKey: pageIdentity.pageKey,
        pageUrl: window.location.pathname + window.location.search,
        bibleName: new URLSearchParams(window.location.search).get("bibleAbbr") ||
          new URLSearchParams(window.location.search).get("abbr") || "",
        bookChapterLabel: getCurrentBookChapterLabel(),
        miniEditorJson,
        hasHighlights: flags.hasHighlights,
        hasDrawings: flags.hasDrawings,
        hasTextFormats: flags.hasTextFormats
      })
    });

    const result = await parseResponseSafely(response);

    if (!response.ok) {
      const detailedError = [
        result.message,
        result.error,
        result.code ? `Code: ${result.code}` : "",
        result.detail ? `Detail: ${result.detail}` : ""
      ]
        .filter(Boolean)
        .join(" | ");
    
      throw new Error(detailedError || `Failed to save mini-editor page. Status: ${response.status}`);
    }

    console.log("Mini-editor page saved");
    setEditorSaveStatus("Saved");
  } catch (error) {
    if (editorPageIsLeaving || document.visibilityState === "hidden") {
      return;
    }

    console.error("Save mini-editor page error:", error);
    setEditorSaveStatus("Save failed");
  }
}

function scheduleMiniEditorSave() {
  if (!editorToolsUnlocked) return;
  if (!miniEditorLoaded) return;
  if (miniEditorApplyingState) return;

  setEditorSaveStatus("Saving...");

  clearTimeout(miniEditorSaveTimer);

  miniEditorSaveTimer = setTimeout(() => {
    saveMiniEditorPage();
  }, 1200);
}

function startMiniEditorObserver() {
  const bibleText = document.getElementById("bible-text");
  const annotationLayer = document.getElementById("bible-annotation-layer");

  if (!bibleText) {
    console.warn("Mini-editor target elements missing. Retrying...");
    return;
  }

  // Disconnect any active duplicate instance
  if (miniEditorObserver) {
    miniEditorObserver.disconnect();
  }

  miniEditorObserver = new MutationObserver((mutations) => {
    // Avoid triggering save if the change was programmatically applied via load
    if (miniEditorApplyingState) return;

    const hasSavableChange = mutations.some((mutation) => {
      // Ignore annotation-layer sizing performed by resizeAnnotationLayer().
      // These are layout-only changes and should not trigger autosave.
      if (
        mutation.type === "attributes" &&
        mutation.target === annotationLayer &&
        ["width", "height", "viewBox", "style", "preserveAspectRatio"].includes(
          mutation.attributeName
        )
      ) {
        return false;
      }

      // Ignore metadata updates added for layout warnings. These are internal
      // bookkeeping changes, not user edits, and must not start an autosave loop.
      if (isAnnotationMetadataOnlyMutation(mutation)) {
        return false;
      }

      return true;
    });

    if (hasSavableChange) {
      scheduleMiniEditorSave();
    }
  });

  miniEditorObserver.observe(bibleText, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true
  });

  if (annotationLayer) {
    miniEditorObserver.observe(annotationLayer, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });
  }
  console.log("Mini-editor mutation observers attached successfully.");
}

// ----------------------------------------------------
// Mini-editor selection memory
// ----------------------------------------------------
let savedBibleSelectionOffsets = null;
let savedBibleSelectionTimestamp = 0;

function getTextOffsetWithinElement(root, targetNode, targetOffset) {
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

function getRangeFromTextOffsets(root, startOffset, endOffset) {
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  let currentOffset = 0;
  let startSet = false;
  let endSet = false;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const nodeLength = node.nodeValue.length;
    const nodeStart = currentOffset;
    const nodeEnd = currentOffset + nodeLength;

    if (!startSet && startOffset >= nodeStart && startOffset <= nodeEnd) {
      range.setStart(node, startOffset - nodeStart);
      startSet = true;
    }

    if (!endSet && endOffset >= nodeStart && endOffset <= nodeEnd) {
      range.setEnd(node, endOffset - nodeStart);
      endSet = true;
      break;
    }

    currentOffset = nodeEnd;
  }

  return startSet && endSet ? range : null;
}

function saveBibleSelection() {
  const selection = window.getSelection();
  const bibleText = document.getElementById("bible-text");

  if (!selection || !selection.rangeCount || selection.isCollapsed || !bibleText) {
    return;
  }

  const range = selection.getRangeAt(0);

  if (!bibleText.contains(range.commonAncestorContainer)) {
    return;
  }

  const start = getTextOffsetWithinElement(
    bibleText,
    range.startContainer,
    range.startOffset
  );

  const end = getTextOffsetWithinElement(
    bibleText,
    range.endContainer,
    range.endOffset
  );

  if (start === end) {
    return;
  }

  savedBibleSelectionOffsets = { start, end };
  savedBibleSelectionTimestamp = Date.now();
}

function restoreBibleSelection() {
  const bibleText = document.getElementById("bible-text");

  if (!savedBibleSelectionOffsets || !bibleText) {
    return false;
  }

  const range = getRangeFromTextOffsets(
    bibleText,
    savedBibleSelectionOffsets.start,
    savedBibleSelectionOffsets.end
  );

  if (!range) {
    return false;
  }

  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);

  return true;
}

function rememberCurrentSelectionOffsets() {
  saveBibleSelection();
}

function clearSavedBibleSelection() {
  savedBibleSelectionOffsets = null;
  savedBibleSelectionTimestamp = 0;
}

function getLiveBibleSelectionRange() {
  const selection = window.getSelection();
  const bibleText = document.getElementById("bible-text");

  if (!selection || !selection.rangeCount || selection.isCollapsed || !bibleText) {
    return null;
  }

  const range = selection.getRangeAt(0);

  if (!bibleText.contains(range.commonAncestorContainer)) {
    return null;
  }

  return range.cloneRange();
}

function getRecentSavedBibleSelectionRange(maxAgeMs = 60000) {
  const bibleText = document.getElementById("bible-text");

  if (!savedBibleSelectionOffsets || !bibleText) {
    return null;
  }

  if (Date.now() - savedBibleSelectionTimestamp > maxAgeMs) {
    return null;
  }

  const range = getRangeFromTextOffsets(
    bibleText,
    savedBibleSelectionOffsets.start,
    savedBibleSelectionOffsets.end
  );

  if (!range || range.collapsed) {
    return null;
  }

  return range;
}

function getClearTargetBibleSelectionRange() {
  return getLiveBibleSelectionRange() || getRecentSavedBibleSelectionRange();
}

document.addEventListener("selectionchange", saveBibleSelection);

// ----------------------------------------------------
// Mini-editor text formatting
// ----------------------------------------------------
function applyBibleFormat(className) {
  restoreBibleSelection();

  const selection = window.getSelection();
  const bibleText = document.getElementById("bible-text");

  if (!selection || !selection.rangeCount || selection.isCollapsed || !bibleText) {
    return;
  }

  const range = selection.getRangeAt(0);

  if (!bibleText.contains(range.commonAncestorContainer)) {
    return;
  }

  saveBibleSelection();
  wrapSelectedTextNodes(range, className);
  restoreBibleSelection();
  recordMiniEditorHistorySnapshot();
}

function wrapSelectedTextNodes(range, className) {
  const bibleText = document.getElementById("bible-text");
  if (!bibleText) return;

  const textNodes = [];
  const walker = document.createTreeWalker(
    bibleText,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.nodeValue.trim() || !range.intersectsNode(node)) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  while (walker.nextNode()) {
    textNodes.push(walker.currentNode);
  }

  textNodes.forEach((textNode) => {
    wrapTextNodePart(textNode, range, className);
  });
}

function wrapTextNodePart(textNode, range, className) {
  let startOffset = 0;
  let endOffset = textNode.nodeValue.length;

  if (textNode === range.startContainer) {
    startOffset = range.startOffset;
  }

  if (textNode === range.endContainer) {
    endOffset = range.endOffset;
  }

  if (startOffset >= endOffset) return;

  const selectedRange = document.createRange();
  selectedRange.setStart(textNode, startOffset);
  selectedRange.setEnd(textNode, endOffset);

  const span = document.createElement("span");
  span.classList.add("bible-user-format", className);
  selectedRange.surroundContents(span);
}

function clearBibleSelectionFormat() {
  const bibleText = document.getElementById("bible-text");
  const range = getClearTargetBibleSelectionRange();

  if (!bibleText || !range || range.collapsed) {
    return false;
  }

  const selectedOffsets = {
    start: getTextOffsetWithinElement(
      bibleText,
      range.startContainer,
      range.startOffset
    ),
    end: getTextOffsetWithinElement(
      bibleText,
      range.endContainer,
      range.endOffset
    )
  };

  let changed = false;

  if (window.AnchoredAnnotations?.clearIntersectingRange?.(range.cloneRange())) {
    changed = true;
  }

  const formattingRange = getRangeFromTextOffsets(
    bibleText,
    selectedOffsets.start,
    selectedOffsets.end
  );

  if (
    formattingRange &&
    removeBibleUserFormattingFromRange(formattingRange)
  ) {
    changed = true;
  }

  savedBibleSelectionOffsets = null;
  savedBibleSelectionTimestamp = 0;

  const selection = window.getSelection();

  if (selection) {
    selection.removeAllRanges();
  }

  if (changed) {
    recordMiniEditorHistorySnapshot();
    scheduleMiniEditorSave();
  }

  return changed;
}

function removeBibleUserFormattingFromRange(range) {
  const bibleText = document.getElementById("bible-text");

  if (!bibleText || !range || range.collapsed) {
    return false;
  }

  const formattedSpans = Array.from(
    bibleText.querySelectorAll(".bible-user-format")
  ).filter((span) => {
    try {
      return range.intersectsNode(span);
    } catch (error) {
      return false;
    }
  });

  if (!formattedSpans.length) {
    return false;
  }

  formattedSpans.forEach(unwrapElement);
  bibleText.normalize();

  return true;
}

function unwrapElement(element) {
  const parent = element.parentNode;
  if (!parent) return;

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }

  parent.removeChild(element);
  parent.normalize();
}

// ----------------------------------------------------
// Mini-editor drawing tools
// ----------------------------------------------------
let activeDrawingTool = null;
let isDrawing = false;
let startX = 0;
let startY = 0;
let currentShape = null;
let selectedDrawnAnnotation = null;
let freehandPoints = [];
let currentFreehandGroup = null;
let freehandSessionHasChanges = false;
let freehandGroupCounter = 0;
let activePointerId = null;
let activePointerType = null;

const ANCHORED_DRAWING_TOOL_LABELS = {
  circle: "Circle",
  square: "Square",
  line: "Line",
  "arrow-left": "Arrow Left",
  "arrow-right": "Arrow Right",
  "arrow-both": "Arrow Both Directions"
};

const ANCHORED_DRAWING_TOOLS =
  new Set(Object.keys(ANCHORED_DRAWING_TOOL_LABELS));

const FREEHAND_GROUP_TOUCH_PADDING = 10;
const FREEHAND_ACTIVE_SESSION_PADDING = 28;
const ANNOTATION_LAYOUT_WARNING_THRESHOLD = 40;
let annotationLayoutWarningDismissed = false;
let annotationLayoutBaselineWidth = null;
let annotationLayoutBaselineViewportWidth = null;
const LAYOUT_SENSITIVE_ANNOTATION_SELECTOR =
  ".freehand-group";

const ANNOTATION_METADATA_ATTRIBUTE_NAMES = new Set([
  "data-annotation-id",
  "data-annotation-type",
  "data-anchor-type",
  "data-created-width",
  "data-created-height",
  "data-created-viewport-width",
  "data-created-viewport-height",
  "data-created-pathname",
  "data-bounds-x",
  "data-bounds-y",
  "data-bounds-width",
  "data-bounds-height"
]);

function setDatasetValueIfChanged(element, key, value) {
  if (!element) return;

  const stringValue = String(value);

  if (element.dataset[key] !== stringValue) {
    element.dataset[key] = stringValue;
  }
}

function isAnnotationMetadataAttribute(attributeName) {
  return ANNOTATION_METADATA_ATTRIBUTE_NAMES.has(attributeName);
}

function isAnnotationMetadataOnlyMutation(mutation) {
  return (
    mutation.type === "attributes" &&
    isAnnotationMetadataAttribute(mutation.attributeName) &&
    mutation.target instanceof Element &&
    mutation.target.matches?.(LAYOUT_SENSITIVE_ANNOTATION_SELECTOR)
  );
}

const drawingArea = document.getElementById("bible-drawing-area");
const annotationLayer = document.getElementById("bible-annotation-layer");

function getBibleTextLayoutMetrics() {
  const bibleText = document.getElementById("bible-text");

  if (!bibleText) {
    return { width: 0, height: 0 };
  }

  const rect = bibleText.getBoundingClientRect();

  return {
    width: Math.round(rect.width || bibleText.clientWidth || bibleText.scrollWidth || 0),
    height: Math.round(bibleText.scrollHeight || rect.height || bibleText.clientHeight || 0)
  };
}

function getAnnotationIdPrefix(type) {
  if (type === "freehand") return "freehand";
  if (type === "circle") return "circle";
  if (type === "square") return "square";
  return "annotation";
}

function createAnnotationId(type) {
  return `${getAnnotationIdPrefix(type)}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function getAnnotationType(element) {
  if (!element) return "annotation";
  if (element.classList.contains("freehand-group")) return "freehand";
  if (element.classList.contains("circle")) return "circle";
  if (element.classList.contains("square")) return "square";
  return element.dataset.annotationType || "annotation";
}

function addAnnotationMetadata(element, options = {}) {
  if (!element) return;

  const type = options.type || getAnnotationType(element);
  const metrics = getBibleTextLayoutMetrics();

  if (!element.dataset.annotationId) {
    setDatasetValueIfChanged(element, "annotationId", createAnnotationId(type));
  }

  setDatasetValueIfChanged(element, "annotationType", type);

  if (!element.dataset.anchorType) {
    setDatasetValueIfChanged(element, "anchorType", "chapter-canvas");
  }

  if (!element.dataset.createdWidth) {
    setDatasetValueIfChanged(element, "createdWidth", metrics.width);
  }

  if (!element.dataset.createdHeight) {
    setDatasetValueIfChanged(element, "createdHeight", metrics.height);
  }

  if (!element.dataset.createdViewportWidth) {
    setDatasetValueIfChanged(element, "createdViewportWidth", Math.round(window.innerWidth || 0));
  }

  if (!element.dataset.createdViewportHeight) {
    setDatasetValueIfChanged(element, "createdViewportHeight", Math.round(window.innerHeight || 0));
  }

  if (!element.dataset.createdPathname) {
    setDatasetValueIfChanged(element, "createdPathname", window.location.pathname);
  }

  updateAnnotationBoundsMetadata(element);
}

function updateAnnotationBoundsMetadata(element) {
  if (!element || typeof element.getBBox !== "function") return;

  try {
    const box = element.getBBox();

    if (!Number.isFinite(box.width) || !Number.isFinite(box.height)) return;

    setDatasetValueIfChanged(element, "boundsX", Math.round(box.x));
    setDatasetValueIfChanged(element, "boundsY", Math.round(box.y));
    setDatasetValueIfChanged(element, "boundsWidth", Math.round(box.width));
    setDatasetValueIfChanged(element, "boundsHeight", Math.round(box.height));
  } catch (error) {
    // getBBox can fail while an SVG object is detached or not rendered yet.
  }
}

function ensureAllAnnotationMetadata() {
  if (!annotationLayer) return;

  annotationLayer
    .querySelectorAll(LAYOUT_SENSITIVE_ANNOTATION_SELECTOR)
    .forEach((annotation) => {
      addAnnotationMetadata(annotation, {
        type: getAnnotationType(annotation)
      });
    });
}

function hasLayoutSensitiveAnnotations() {
  return Boolean(
    annotationLayer?.querySelector(LAYOUT_SENSITIVE_ANNOTATION_SELECTOR)
  );
}

function ensureAnnotationLayoutWarningElement() {
  let warning = document.getElementById("annotation-layout-warning");

  if (warning) return warning;

  warning = document.createElement("div");
  warning.id = "annotation-layout-warning";
  warning.className = "annotation-layout-warning";
  warning.setAttribute("role", "status");
  warning.setAttribute("aria-live", "polite");
  warning.hidden = true;

  const message = document.createElement("div");
  message.className = "annotation-layout-warning__message";
  message.textContent =
    "Visual annotations may not align at this display size. Return near the original window size for best alignment.";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "annotation-layout-warning__close";
  closeButton.setAttribute("aria-label", "Dismiss annotation alignment warning");
  closeButton.textContent = "×";
  closeButton.addEventListener("click", () => {
    annotationLayoutWarningDismissed = true;
    warning.hidden = true;
  });

  warning.appendChild(message);
  warning.appendChild(closeButton);

  document.body.appendChild(warning);

  return warning;
}

function getMaxAnnotationLayoutDifference(currentWidth) {
  if (!annotationLayer) return 0;

  const currentViewportWidth = Math.round(window.innerWidth || 0);

  return Array.from(
    annotationLayer.querySelectorAll(LAYOUT_SENSITIVE_ANNOTATION_SELECTOR)
  ).reduce((maxDifference, annotation) => {
    const createdContentWidth = Number(annotation.dataset.createdWidth);
    const createdViewportWidth = Number(annotation.dataset.createdViewportWidth);

    const contentDifference =
      Number.isFinite(createdContentWidth) && createdContentWidth > 0
        ? Math.abs(currentWidth - createdContentWidth)
        : 0;

    const viewportDifference =
      Number.isFinite(createdViewportWidth) && createdViewportWidth > 0
        ? Math.abs(currentViewportWidth - createdViewportWidth)
        : 0;

    return Math.max(maxDifference, contentDifference, viewportDifference);
  }, 0);
}

function updateAnnotationLayoutWarning() {
  const warning = ensureAnnotationLayoutWarningElement();

  if (warning) {
    warning.hidden = true;
  }

  annotationLayoutWarningDismissed = false;
}

function getCurrentBibleZoom() {
  const zoom = Number(window.currentBibleZoom);
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

function getDrawingCoordinates(event) {
  const layer = document.getElementById("bible-annotation-layer");

  if (layer) {
    const rect = layer.getBoundingClientRect();
    const viewBox = layer.viewBox && layer.viewBox.baseVal;

    if (rect.width > 0 && rect.height > 0 && viewBox) {
      return {
        x: viewBox.x + ((event.clientX - rect.left) / rect.width) * viewBox.width,
        y: viewBox.y + ((event.clientY - rect.top) / rect.height) * viewBox.height
      };
    }
  }

  if (!drawingArea) {
    return { x: 0, y: 0 };
  }

  const rect = drawingArea.getBoundingClientRect();
  const zoom = getCurrentBibleZoom();

  return {
    x: (event.clientX - rect.left) / zoom,
    y: (event.clientY - rect.top) / zoom
  };
}

function getAnnotationBaseSize(currentWidth, currentHeight) {
  const layer = document.getElementById("bible-annotation-layer");

  if (!layer) {
    return { width: currentWidth, height: currentHeight };
  }

  const annotations = Array.from(
    layer.querySelectorAll(LAYOUT_SENSITIVE_ANNOTATION_SELECTOR)
  );

  const widths = annotations
    .map((annotation) => Number(annotation.dataset.createdWidth))
    .filter((value) => Number.isFinite(value) && value > 0);

  const heights = annotations
    .map((annotation) => Number(annotation.dataset.createdHeight))
    .filter((value) => Number.isFinite(value) && value > 0);

  return {
    width: Math.max(currentWidth, ...widths),
    height: Math.max(currentHeight, ...heights)
  };
}

function resizeAnnotationLayer() {
  const bibleText = document.getElementById("bible-text");
  const layer = document.getElementById("bible-annotation-layer");

  if (!bibleText || !layer) return;

  const rect = bibleText.getBoundingClientRect();
  const currentWidth = Math.ceil(rect.width || bibleText.clientWidth || bibleText.scrollWidth || 1);
  const currentHeight = Math.ceil(bibleText.scrollHeight || rect.height || 1);
  const baseSize = getAnnotationBaseSize(currentWidth, currentHeight);

  // The displayed SVG follows the Bible text box. The viewBox can remain at
  // the original annotation size so coordinate-based drawings scale back when
  // the viewport returns to the original size instead of drifting off-screen.
  layer.setAttribute("width", String(currentWidth));
  layer.setAttribute("height", String(currentHeight));
  layer.setAttribute("viewBox", `0 0 ${Math.ceil(baseSize.width)} ${Math.ceil(baseSize.height)}`);
  layer.setAttribute("preserveAspectRatio", "none");
  layer.style.width = `${currentWidth}px`;
  layer.style.height = `${currentHeight}px`;
}

// ----------------------------------------------------
// The rest of the drawing engine remains perfectly intact...
// ----------------------------------------------------
function getExpandedBBox(element, padding = 0) {
  const box = element.getBBox();

  return {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + padding * 2,
    height: box.height + padding * 2,
    right: box.x + box.width + padding,
    bottom: box.y + box.height + padding
  };
}

function boxesOverlap(a, b) {
  return !(
    a.right < b.x ||
    a.x > b.right ||
    a.bottom < b.y ||
    a.y > b.bottom
  );
}

function freehandPathTouchesActiveSession(path) {
  if (!path || !currentFreehandGroup) return false;

  try {
    const pathBox = getExpandedBBox(path, FREEHAND_ACTIVE_SESSION_PADDING);
    const groupBox = getExpandedBBox(currentFreehandGroup, FREEHAND_ACTIVE_SESSION_PADDING);
    return boxesOverlap(pathBox, groupBox);
  } catch (error) {
    return false;
  }
}

function findTouchingFreehandGroups(path) {
  if (!annotationLayer) return [];

  const pathBox = getExpandedBBox(path, FREEHAND_GROUP_TOUCH_PADDING);

  return Array.from(annotationLayer.querySelectorAll(".freehand-group")).filter(
    (group) => {
      if (group.contains(path)) return false;

      const groupBox = getExpandedBBox(group, FREEHAND_GROUP_TOUCH_PADDING);
      return boxesOverlap(pathBox, groupBox);
    }
  );
}

function createFreehandGroup() {
  const newGroup = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "g"
  );

  newGroup.classList.add("drawn-annotation", "freehand-group");
  newGroup.dataset.groupId = `freehand-${freehandGroupCounter++}`;
  addAnnotationMetadata(newGroup, { type: "freehand" });
  annotationLayer.appendChild(newGroup);

  return newGroup;
}

function mergeFreehandGroups(targetGroup, groupsToMerge) {
  groupsToMerge.forEach((group) => {
    while (group.firstChild) {
      targetGroup.appendChild(group.firstChild);
    }

    group.remove();
  });

  updateAnnotationBoundsMetadata(targetGroup);
}

function attachFreehandPathToGroup(path) {
  if (currentFreehandGroup && freehandPathTouchesActiveSession(path)) {
    currentFreehandGroup.appendChild(path);
    updateAnnotationBoundsMetadata(currentFreehandGroup);
    updateAnnotationLayoutWarning();
    freehandSessionHasChanges = true;
    return;
  }

  if (currentFreehandGroup) {
    finalizeFreehandGroup({ recordHistory: true });
  }

  const touchingGroups = findTouchingFreehandGroups(path);

  if (touchingGroups.length === 0) {
    const group = createFreehandGroup();
    group.appendChild(path);
    updateAnnotationBoundsMetadata(group);
    updateAnnotationLayoutWarning();
    currentFreehandGroup = group;
    freehandSessionHasChanges = true;
    return;
  }

  const targetGroup = touchingGroups[0];
  targetGroup.appendChild(path);

  if (touchingGroups.length > 1) {
    mergeFreehandGroups(targetGroup, touchingGroups.slice(1));
  }

  updateAnnotationBoundsMetadata(targetGroup);
  updateAnnotationLayoutWarning();
  currentFreehandGroup = targetGroup;
  freehandSessionHasChanges = true;
}

function finalizeFreehandGroup(options = {}) {
  const shouldRecordHistory = Boolean(options.recordHistory);

  if (currentFreehandGroup) {
    updateAnnotationBoundsMetadata(currentFreehandGroup);
  }

  currentFreehandGroup = null;
  updateAnnotationLayoutWarning();

  if (shouldRecordHistory && freehandSessionHasChanges) {
    freehandSessionHasChanges = false;
    recordMiniEditorHistorySnapshot();
  } else if (!currentFreehandGroup) {
    freehandSessionHasChanges = false;
  }
}

const FREEHAND_WARNING_STORAGE_KEY =
  "boi-hide-freehand-warning";

let pendingFreehandWarningTool = null;

function shouldShowFreehandWarning() {
  if (window.UserPreferences?.read) {
    return (
      window.UserPreferences.read()
        .freehandWarningEnabled !== false
    );
  }

  try {
    return (
      window.localStorage.getItem(
        FREEHAND_WARNING_STORAGE_KEY
      ) !== "true"
    );
  } catch (error) {
    return true;
  }
}

function rememberFreehandWarningChoice(shouldHide) {
  if (!shouldHide) return;

  if (window.UserPreferences?.write) {
    window.UserPreferences.write({
      freehandWarningEnabled: false
    });
  }

  try {
    window.localStorage.setItem(
      FREEHAND_WARNING_STORAGE_KEY,
      "true"
    );
  } catch (error) {
    console.warn(
      "Could not save freehand warning preference:",
      error
    );
  }
}

function closeFreehandWarningDialog() {
  const dialog =
    document.getElementById(
      "freehandWarningDialog"
    );

  if (dialog) {
    dialog.classList.remove("is-open");
    dialog.setAttribute("hidden", "hidden");
  }

  pendingFreehandWarningTool = null;
}

function ensureFreehandWarningDialog() {
  let dialog =
    document.getElementById(
      "freehandWarningDialog"
    );

  if (dialog) {
    return dialog;
  }

  dialog = document.createElement("div");
  dialog.id = "freehandWarningDialog";
  dialog.className = "freehand-warning-dialog";
  dialog.setAttribute("hidden", "hidden");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute(
    "aria-labelledby",
    "freehandWarningTitle"
  );

  dialog.innerHTML = `
    <div class="freehand-warning-card">
      <button
        type="button"
        class="freehand-warning-close"
        aria-label="Close freehand warning"
      >
        ×
      </button>
      <h3 id="freehandWarningTitle">Freehand drawing</h3>
      <p>
        Freehand drawings work best on the screen size where they were created.
        Alignment may vary on other devices.
      </p>
      <label class="freehand-warning-check">
        <input type="checkbox" id="freehandWarningDontShowAgain" />
        <span>Do not show this again</span>
      </label>
      <div class="freehand-warning-actions">
        <button
          type="button"
          class="freehand-warning-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          class="freehand-warning-continue"
        >
          Continue
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  dialog
    .querySelector(".freehand-warning-close")
    ?.addEventListener("click", () => {
      closeFreehandWarningDialog();
    });

  dialog
    .querySelector(".freehand-warning-cancel")
    ?.addEventListener("click", () => {
      closeFreehandWarningDialog();
    });

  dialog
    .querySelector(".freehand-warning-continue")
    ?.addEventListener("click", () => {
      const dontShowAgain =
        dialog.querySelector(
          "#freehandWarningDontShowAgain"
        )?.checked;

      rememberFreehandWarningChoice(
        Boolean(dontShowAgain)
      );

      const toolToActivate =
        pendingFreehandWarningTool;

      closeFreehandWarningDialog();

      if (toolToActivate === "freehand") {
        setDrawingTool(
          "freehand",
          { skipFreehandWarning: true }
        );
      }
    });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeFreehandWarningDialog();
    }
  });

  return dialog;
}

function showFreehandWarningDialog() {
  const dialog = ensureFreehandWarningDialog();

  pendingFreehandWarningTool = "freehand";

  dialog.removeAttribute("hidden");
  dialog.classList.add("is-open");

  const checkbox =
    dialog.querySelector(
      "#freehandWarningDontShowAgain"
    );

  if (checkbox) {
    checkbox.checked = false;
  }

  const continueButton =
    dialog.querySelector(
      ".freehand-warning-continue"
    );

  continueButton?.focus();
}

function setDrawingTool(tool, options = {}) {
  if (!drawingArea) return;

  if (ANCHORED_DRAWING_TOOLS.has(tool)) {
    if (!window.AnchoredAnnotations?.createFromCurrentSelection) {
      window.alert(
        "The responsive annotation tool is not loaded yet. Please refresh the page and try again."
      );
      return;
    }

    window.AnchoredAnnotations?.rememberCurrentSelection?.();

    const anchoredResult =
      window.AnchoredAnnotations.createFromCurrentSelection(tool);

    if (!anchoredResult?.created) {
      const toolLabel =
        ANCHORED_DRAWING_TOOL_LABELS[tool] || "this tool";

      window.alert(
        `Select Bible text first, then click ${toolLabel}.`
      );

      activeDrawingTool = null;
      drawingArea.classList.remove("drawing-mode");

      document.querySelectorAll("[data-drawing-tool]").forEach((button) => {
        button.classList.remove("active-tool");
      });

      const textButton = document.querySelector(
        '[data-drawing-tool="text"]'
      );

      textButton?.classList.add("active-tool");

      closeDrawMenu();
      closeMobileToolbarMenus();
      return;
    }

    if (currentFreehandGroup) {
      finalizeFreehandGroup({ recordHistory: true });
    }

    activeDrawingTool = null;
    drawingArea.classList.remove("drawing-mode");

    document.querySelectorAll("[data-drawing-tool]").forEach((button) => {
      button.classList.remove("active-tool");
    });

    const textButton = document.querySelector(
      '[data-drawing-tool="text"]'
    );

    textButton?.classList.add("active-tool");

    closeDrawMenu();
    closeMobileToolbarMenus();
    recordMiniEditorHistorySnapshot();
    scheduleMiniEditorSave();
    return;
  }

  const skipFreehandWarning =
    Boolean(options.skipFreehandWarning);

  if (
    tool === "freehand" &&
    activeDrawingTool !== "freehand" &&
    !skipFreehandWarning &&
    shouldShowFreehandWarning()
  ) {
    showFreehandWarningDialog();
    return;
  }

  if (activeDrawingTool === "freehand" && tool !== "freehand") {
    finalizeFreehandGroup({ recordHistory: true });
  }

  activeDrawingTool = tool === "freehand" ? "freehand" : null;

  document.querySelectorAll("[data-drawing-tool]").forEach((button) => {
    button.classList.remove("active-tool");
  });

  if (tool) {
    drawingArea.classList.add("drawing-mode");

    const activeButton = document.querySelector(
      `[data-drawing-tool="${tool}"]`
    );

    activeButton?.classList.add("active-tool");
  } else {
    drawingArea.classList.remove("drawing-mode");

    const textButton = document.querySelector(
      '[data-drawing-tool="text"]'
    );

    textButton?.classList.add("active-tool");
  }
}

window.isBibleDrawingActive = function () {
  return Boolean(activeDrawingTool);
};

function clearSelectedDrawnAnnotation() {
  if (currentFreehandGroup) {
    finalizeFreehandGroup({ recordHistory: true });
  }

  if (!selectedDrawnAnnotation) {
    if (window.AnchoredAnnotations?.clearSelected?.()) {
      recordMiniEditorHistorySnapshot();
      scheduleMiniEditorSave();
      return true;
    }

    return false;
  }

  const annotationToRemove =
    selectedDrawnAnnotation.closest?.(".freehand-group") ||
    selectedDrawnAnnotation;

  annotationToRemove.remove();
  selectedDrawnAnnotation = null;
  updateAnnotationLayoutWarning();
  recordMiniEditorHistorySnapshot();
  scheduleMiniEditorSave();

  return true;
}

function clearSelectedBibleAnnotation() {
  if (clearBibleSelectionFormat()) {
    return true;
  }

  return clearSelectedDrawnAnnotation();
}

function clearDrawnAnnotations() {
  if (currentFreehandGroup) {
    finalizeFreehandGroup({ recordHistory: true });
  }

  if (!annotationLayer) return;

  annotationLayer.innerHTML = "";
  window.AnchoredAnnotations?.clear?.();

  selectedDrawnAnnotation = null;
  currentFreehandGroup = null;
  freehandSessionHasChanges = false;
  annotationLayoutWarningDismissed = false;
  updateAnnotationLayoutWarning();
  recordMiniEditorHistorySnapshot();
  scheduleMiniEditorSave();
}

function handleDrawingPointerDown(event) {
  if (activeDrawingTool !== "freehand" || !drawingArea || !annotationLayer) {
    return;
  }

  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  if (activePointerId !== null) {
    return;
  }

  event.preventDefault();

  activePointerId = event.pointerId;
  activePointerType = event.pointerType;

  try {
    drawingArea.setPointerCapture(event.pointerId);
  } catch (error) {
    console.warn("Could not capture pointer:", error);
  }

  isDrawing = true;
  selectedDrawnAnnotation = null;

  document
    .querySelectorAll(".drawn-annotation, .freehand-group")
    .forEach((shape) => {
      shape.classList.remove("selected-annotation");
    });

  const point = getDrawingCoordinates(event);
  startX = point.x;
  startY = point.y;
  freehandPoints = [`M ${startX} ${startY}`];

  currentShape = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path"
  );

  currentShape.classList.add("freehand");
  currentShape.setAttribute("d", freehandPoints.join(" "));
  annotationLayer.appendChild(currentShape);
}

function handleDrawingPointerMove(event) {
  if (!isDrawing || !currentShape) return;
  if (event.pointerId !== activePointerId) return;
  if (activeDrawingTool !== "freehand") return;

  event.preventDefault();

  const point = getDrawingCoordinates(event);
  freehandPoints.push(`L ${point.x} ${point.y}`);
  currentShape.setAttribute("d", freehandPoints.join(" "));
}

function releaseActivePointer(event) {
  if (
    drawingArea &&
    activePointerId !== null &&
    event &&
    drawingArea.hasPointerCapture(event.pointerId)
  ) {
    try {
      drawingArea.releasePointerCapture(event.pointerId);
    } catch (error) {
      console.warn("Could not release pointer capture:", error);
    }
  }

  activePointerId = null;
  activePointerType = null;
}

function finishDrawingStroke(event) {
  if (!isDrawing) return;

  if (
    event &&
    activePointerId !== null &&
    event.pointerId !== activePointerId
  ) {
    return;
  }

  const completedFreehandStroke = activeDrawingTool === "freehand" && currentShape;

  if (completedFreehandStroke) {
    attachFreehandPathToGroup(currentShape);
  } else if (currentShape) {
    updateAnnotationBoundsMetadata(currentShape);
    updateAnnotationLayoutWarning();
  }

  if (!completedFreehandStroke) {
    recordMiniEditorHistorySnapshot();
  }

  isDrawing = false;
  currentShape = null;
  freehandPoints = [];

  releaseActivePointer(event);
}

function cancelDrawingStroke(event) {
  if (
    activePointerId !== null &&
    event.pointerId !== activePointerId
  ) {
    return;
  }

  currentShape?.remove();
  updateAnnotationLayoutWarning();

  isDrawing = false;
  currentShape = null;
  freehandPoints = [];

  releaseActivePointer(event);
}

if (drawingArea && annotationLayer) {
  setDrawingTool(null);

  annotationLayer.addEventListener("click", function (event) {
    if (currentFreehandGroup) {
      finalizeFreehandGroup({ recordHistory: true });
    }

    const clickedAnnotation =
      event.target.closest(".drawn-annotation, .freehand-group") ||
      (event.target.classList?.contains("freehand") ? event.target : null);

    if (!clickedAnnotation) return;

    selectedDrawnAnnotation =
      clickedAnnotation.closest?.(".freehand-group") || clickedAnnotation;

    clearSavedBibleSelection();

    document
      .querySelectorAll(".drawn-annotation, .freehand-group, .freehand")
      .forEach((shape) => {
        shape.classList.remove("selected-annotation");
      });

    selectedDrawnAnnotation.classList.add("selected-annotation");
  });

  drawingArea.addEventListener("pointerdown", handleDrawingPointerDown);
  drawingArea.addEventListener("pointermove", handleDrawingPointerMove);
  drawingArea.addEventListener("pointerup", finishDrawingStroke);
  drawingArea.addEventListener("pointercancel", cancelDrawingStroke);

  drawingArea.addEventListener("lostpointercapture", function (event) {
    if (isDrawing && event.pointerId === activePointerId) {
      finishDrawingStroke(event);
    }
  });
}

// ----------------------------------------------------
// Mini-toolbar and dropdowns
// ----------------------------------------------------
const miniToolbar = document.getElementById("bible-mini-toolbar");

if (miniToolbar) {
  miniToolbar.addEventListener("pointerdown", function (event) {
    const control = event.target.closest("button, select");

    if (control) {
      rememberCurrentSelectionOffsets();
    }
  });
}

function toggleMenu(id) {
  document.getElementById(id)?.classList.toggle("show");
}

function closeMenu(id) {
  document.getElementById(id)?.classList.remove("show");
}

function toggleHighlightMenu() {
  toggleMenu("highlight-menu");
}

function closeHighlightMenu() {
  closeMenu("highlight-menu");
}

function toggleFontMenu() {
  toggleMenu("font-menu");
}

function closeFontMenu() {
  closeMenu("font-menu");
}

function toggleFontColorMenu() {
  toggleMenu("font-color-menu");
}

function closeFontColorMenu() {
  closeMenu("font-color-menu");
}

function toggleDrawMenu() {
  toggleMenu("draw-menu");
}

function closeDrawMenu() {
  closeMenu("draw-menu");
}

document.addEventListener("click", function (event) {
  const menuIds = [
    "font-menu",
    "highlight-menu",
    "font-color-menu",
    "draw-menu"
  ];

  menuIds.forEach((menuId) => {
    const menu = document.getElementById(menuId);
    const dropdown = menu?.closest(".toolbar-dropdown");

    if (dropdown && !dropdown.contains(event.target)) {
      closeMenu(menuId);
    }
  });
});


// ----------------------------------------------------
// Keep the fixed mini-toolbar below the sticky navbar
// ----------------------------------------------------
function updateStickyEditorLayoutVars() {
  const root = document.documentElement;
  const stickyHeader = document.getElementById("stickyHeader");
  const miniToolbar = document.getElementById("bible-mini-toolbar");

  if (stickyHeader) {
    const headerHeight = Math.ceil(stickyHeader.getBoundingClientRect().height);
    if (headerHeight > 0) {
      root.style.setProperty("--sticky-header-height", `${headerHeight}px`);
    }
  }

  if (miniToolbar) {
    const toolbarHeight = Math.ceil(miniToolbar.getBoundingClientRect().height);
    if (toolbarHeight > 0) {
      root.style.setProperty("--mini-toolbar-height", `${toolbarHeight}px`);
    }
  }
}

function scheduleStickyEditorLayoutUpdate() {
  requestAnimationFrame(updateStickyEditorLayoutVars);
}

window.addEventListener("load", scheduleStickyEditorLayoutUpdate);
window.addEventListener("resize", scheduleStickyEditorLayoutUpdate);
window.addEventListener("orientationchange", scheduleStickyEditorLayoutUpdate);

if (document.fonts?.ready) {
  document.fonts.ready.then(scheduleStickyEditorLayoutUpdate).catch(() => {});
}

if (typeof ResizeObserver !== "undefined") {
  const stickyEditorLayoutObserver = new ResizeObserver(scheduleStickyEditorLayoutUpdate);
  const stickyHeader = document.getElementById("stickyHeader");
  const miniToolbar = document.getElementById("bible-mini-toolbar");

  if (stickyHeader) stickyEditorLayoutObserver.observe(stickyHeader);
  if (miniToolbar) stickyEditorLayoutObserver.observe(miniToolbar);
}

scheduleStickyEditorLayoutUpdate();
setTimeout(scheduleStickyEditorLayoutUpdate, 250);
setTimeout(scheduleStickyEditorLayoutUpdate, 1000);


function closeMobileToolbarMenus() {
  const menus = document.querySelectorAll(".mobile-toolbar-menu");
  const toggles = document.querySelectorAll(".mobile-toolbar-toggle");

  menus.forEach((menu) => {
    menu.classList.remove("show");
  });

  toggles.forEach((toggle) => {
    toggle.setAttribute("aria-expanded", "false");
  });
}

function toggleMobileToolbarMenu(menuId) {
  const menu = document.getElementById(menuId);

  if (!menu) return;

  const wasOpen = menu.classList.contains("show");
  closeMobileToolbarMenus();

  if (!wasOpen) {
    menu.classList.add("show");

    const toggle = document.querySelector(
      `.mobile-toolbar-toggle[onclick*="${menuId}"]`
    );

    if (toggle) {
      toggle.setAttribute("aria-expanded", "true");
    }
  }
}

document.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof Element)) return;

  if (!target.closest("#bible-mini-toolbar")) {
    closeMobileToolbarMenus();
  }
});

function isTypingOrFormTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], .ql-editor'
    )
  );
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMobileToolbarMenus();
    closeFreehandWarningDialog();
    return;
  }

  if (event.key === "Delete") {
    if (isTypingOrFormTarget(event.target)) {
      return;
    }

    if (clearSelectedDrawnAnnotation()) {
      event.preventDefault();
    }
  }
});

// ----------------------------------------------------
// Expose functions used by inline HTML onclick attributes
// ----------------------------------------------------
window.setDrawingTool = setDrawingTool;
window.rememberCurrentSelectionOffsets = rememberCurrentSelectionOffsets;
window.clearSavedBibleSelection = clearSavedBibleSelection;
window.clearBibleSelectionFormat = clearBibleSelectionFormat;
window.clearSelectedDrawnAnnotation = clearSelectedDrawnAnnotation;
window.clearSelectedBibleAnnotation = clearSelectedBibleAnnotation;
window.clearDrawnAnnotations = clearDrawnAnnotations;
window.applyBibleFormat = applyBibleFormat;
window.toggleHighlightMenu = toggleHighlightMenu;
window.closeHighlightMenu = closeHighlightMenu;
window.toggleFontMenu = toggleFontMenu;
window.closeFontMenu = closeFontMenu;
window.toggleFontColorMenu = toggleFontColorMenu;
window.closeFontColorMenu = closeFontColorMenu;
window.toggleDrawMenu = toggleDrawMenu;
window.closeDrawMenu = closeDrawMenu;
window.resizeAnnotationLayer = resizeAnnotationLayer;
window.refreshBibleAnnotationLayout = refreshBibleAnnotationLayout;
window.updateAnnotationLayoutWarning = updateAnnotationLayoutWarning;
window.undoMiniEditorChange = undoMiniEditorChange;
window.redoMiniEditorChange = redoMiniEditorChange;
window.toggleMobileToolbarMenu = toggleMobileToolbarMenu;
window.closeMobileToolbarMenus = closeMobileToolbarMenus;

// ----------------------------------------------------
// Start editor auth check after all functions are loaded
// ----------------------------------------------------
checkEditorAuth();

// Run observer setup once content is ready
waitForBibleTextContent().then((ready) => {
  if (ready) {
    startMiniEditorObserver();
  }
});
