import BlotFormatter from "quill-blot-formatter";

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

Quill.register("modules/blotFormatter", BlotFormatter);

// ----------------------------------------------------
// Toolbar Configuration
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
    blotFormatter: {},
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
      // 1. Stop the browser from pasting ANYTHING (text or image)
      e.preventDefault();
      e.stopPropagation();

      // 2. Alert the user
      alert("Direct image pasting is not allowed. Please save the image to your computer and use the 'Insert Image' button to insert it.");
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

  clearTimeout(editorSaveStatusClearTimer);

  if (message === "Saved") {
    editorSaveStatusClearTimer = setTimeout(() => {
      status.textContent = "";
      status.classList.remove("editor-save-status-saved");
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
const sizeSelect = toolbar?.container.querySelector("select.ql-size");

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
  toolbar.container.querySelector(`button.${cls}`)?.setAttribute("title", btnTitles[cls]);
});

toolbar.container.querySelector("select.ql-align")?.parentElement.setAttribute("title", "Align Text");
toolbar.container.querySelector(".ql-color")?.setAttribute("title", "Font Color");
toolbar.container.querySelector(".ql-background")?.setAttribute("title", "Background Color");
toolbar.container.querySelector('button.ql-list[value="ordered"]')?.setAttribute("title", "Ordered List");
toolbar.container.querySelector('button.ql-list[value="bullet"]')?.setAttribute("title", "Bullet List");
toolbar.container.querySelector('button.ql-list[value="check"]')?.setAttribute("title", "Checkbox List");
toolbar.container.querySelector('button.ql-indent[value="-1"]')?.setAttribute("title", "Outdent");
toolbar.container.querySelector('button.ql-indent[value="+1"]')?.setAttribute("title", "Indent");
toolbar.container.querySelector('button.ql-script[value="sub"]')?.setAttribute("title", "Subscript");
toolbar.container.querySelector('button.ql-script[value="super"]')?.setAttribute("title", "Superscript");

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
    resizeAnnotationLayer();

    if (typeof updateBibleZoomLayout === "function") {
      updateBibleZoomLayout();
    }

    bibleLayoutRefreshFrame = null;
  });
}

let bibleLayoutObserverStarted = false;
let bibleTextResizeObserver = null;

function startBibleLayoutObservers() {
  if (bibleLayoutObserverStarted) return;

  const bibleText = document.getElementById("bible-text");

  if (!bibleText) return;

  bibleLayoutObserverStarted = true;

  if (typeof ResizeObserver !== "undefined") {
    bibleTextResizeObserver = new ResizeObserver(() => {
      refreshBibleAnnotationLayout();
    });

    bibleTextResizeObserver.observe(bibleText);
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

  return {
    bibleTextHtml: bibleText.innerHTML,
    annotationLayerHtml: annotationLayer ? annotationLayer.innerHTML : ""
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

  // Important: recalculate the drawing layer after saved text/drawings are restored
  requestAnimationFrame(() => {
    if (typeof refreshBibleAnnotationLayout === "function") {
      refreshBibleAnnotationLayout();
    }
  });

  setTimeout(() => {
    miniEditorApplyingState = false;
  }, 300);
}

function getMiniEditorFlags(miniEditorJson) {
  const bibleTextHtml = miniEditorJson?.bibleTextHtml || "";
  const annotationLayerHtml = miniEditorJson?.annotationLayerHtml || "";

  return {
    hasHighlights: bibleTextHtml.includes("highlight-"),
    hasDrawings: annotationLayerHtml.trim().length > 0,
    hasTextFormats:
      bibleTextHtml.includes("bible-user-format bold") ||
      bibleTextHtml.includes("bible-user-format underline") ||
      bibleTextHtml.includes("bible-user-format double-underline") ||
      bibleTextHtml.includes("bible-user-format overline-underline") ||
      bibleTextHtml.includes("bible-user-format strike-through") ||
      bibleTextHtml.includes("bible-user-format uppercase") ||
      bibleTextHtml.includes("text-red") ||
      bibleTextHtml.includes("text-blue") ||
      bibleTextHtml.includes("text-green") ||
      bibleTextHtml.includes("text-purple") ||
      bibleTextHtml.includes("text-black")
  };
}

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
      applyMiniEditorState(result.page.mini_editor_json);
    }

    miniEditorLoaded = true;
    startBibleLayoutObservers();
    startMiniEditorObserver();
  } catch (error) {
    console.error("Load mini-editor page error:", error);
    miniEditorLoaded = true;
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
        throw new Error("Failed to delete empty mini-editor page");
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
        bibleName: new URLSearchParams(window.location.search).get("abbr") || "",
        bookChapterLabel: document.querySelector(".subheadings .column:nth-child(3)")?.textContent?.trim() || "",
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
  if (miniEditorObserver) return;

  const bibleText = document.getElementById("bible-text");
  const annotationLayer = document.getElementById("bible-annotation-layer");

  if (!bibleText) return;

  miniEditorObserver = new MutationObserver(() => {
    scheduleMiniEditorSave();
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
}


// ----------------------------------------------------
// Mini-editor selection memory
// ----------------------------------------------------
let savedBibleSelectionOffsets = null;

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

  savedBibleSelectionOffsets = {
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

  Array.from(bibleText.querySelectorAll(".bible-user-format"))
    .filter((span) => range.intersectsNode(span))
    .forEach(unwrapElement);

  restoreBibleSelection();
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
let freehandGroupCounter = 0;
let activePointerId = null;
let activePointerType = null;

const FREEHAND_GROUP_TOUCH_PADDING = 10;
const drawingArea = document.getElementById("bible-drawing-area");
const annotationLayer = document.getElementById("bible-annotation-layer");

function getCurrentBibleZoom() {
  const zoom = Number(window.currentBibleZoom);
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

function getDrawingCoordinates(event) {
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

function resizeAnnotationLayer() {
  const bibleText = document.getElementById("bible-text");
  const layer = document.getElementById("bible-annotation-layer");

  if (!bibleText || !layer) return;

  const width = Math.ceil(bibleText.scrollWidth);
  const height = Math.ceil(bibleText.scrollHeight);

  layer.setAttribute("width", String(width));
  layer.setAttribute("height", String(height));
  layer.setAttribute("viewBox", `0 0 ${width} ${height}`);
  layer.setAttribute("preserveAspectRatio", "none");
  layer.style.width = `${width}px`;
  layer.style.height = `${height}px`;
}

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
}

function attachFreehandPathToGroup(path) {
  const touchingGroups = findTouchingFreehandGroups(path);

  if (touchingGroups.length === 0) {
    const group = createFreehandGroup();
    group.appendChild(path);
    currentFreehandGroup = group;
    return;
  }

  const targetGroup = touchingGroups[0];
  targetGroup.appendChild(path);

  if (touchingGroups.length > 1) {
    mergeFreehandGroups(targetGroup, touchingGroups.slice(1));
  }

  currentFreehandGroup = targetGroup;
}

function finalizeFreehandGroup() {
  currentFreehandGroup = null;
}

function setDrawingTool(tool) {
  if (!drawingArea) return;

  if (activeDrawingTool === "freehand" && tool !== "freehand") {
    finalizeFreehandGroup();
  }

  activeDrawingTool = tool;

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
  if (!selectedDrawnAnnotation) return;

  selectedDrawnAnnotation.remove();
  selectedDrawnAnnotation = null;
}

function clearDrawnAnnotations() {
  if (!annotationLayer) return;

  annotationLayer.innerHTML = "";
  selectedDrawnAnnotation = null;
  currentFreehandGroup = null;
}

function handleDrawingPointerDown(event) {
  if (!activeDrawingTool || !drawingArea || !annotationLayer) return;

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

  document.querySelectorAll(".drawn-annotation").forEach((shape) => {
    shape.classList.remove("selected-annotation");
  });

  const point = getDrawingCoordinates(event);
  startX = point.x;
  startY = point.y;

  if (activeDrawingTool === "circle") {
    currentShape = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "ellipse"
    );
    currentShape.classList.add("drawn-annotation", "circle");
  } else if (activeDrawingTool === "square") {
    currentShape = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect"
    );
    currentShape.classList.add("drawn-annotation", "square");
  } else if (activeDrawingTool === "freehand") {
    freehandPoints = [`M ${startX} ${startY}`];
    currentShape = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path"
    );
    currentShape.classList.add("freehand");
    currentShape.setAttribute("d", freehandPoints.join(" "));
  }

  if (currentShape) {
    annotationLayer.appendChild(currentShape);
  }
}

function handleDrawingPointerMove(event) {
  if (!isDrawing || !currentShape) return;
  if (event.pointerId !== activePointerId) return;

  event.preventDefault();

  const point = getDrawingCoordinates(event);
  const currentX = point.x;
  const currentY = point.y;

  const x = Math.min(startX, currentX);
  const y = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);

  if (activeDrawingTool === "circle") {
    currentShape.setAttribute("cx", x + width / 2);
    currentShape.setAttribute("cy", y + height / 2);
    currentShape.setAttribute("rx", width / 2);
    currentShape.setAttribute("ry", height / 2);
  } else if (activeDrawingTool === "square") {
    currentShape.setAttribute("x", x);
    currentShape.setAttribute("y", y);
    currentShape.setAttribute("width", width);
    currentShape.setAttribute("height", height);
  } else if (activeDrawingTool === "freehand") {
    freehandPoints.push(`L ${currentX} ${currentY}`);
    currentShape.setAttribute("d", freehandPoints.join(" "));
  }
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

  if (activeDrawingTool === "freehand" && currentShape) {
    attachFreehandPathToGroup(currentShape);
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

  isDrawing = false;
  currentShape = null;
  freehandPoints = [];

  releaseActivePointer(event);
}

if (drawingArea && annotationLayer) {
  setDrawingTool(null);

  annotationLayer.addEventListener("click", function (event) {
    const clickedAnnotation = event.target.closest(".drawn-annotation");

    if (!clickedAnnotation) return;

    selectedDrawnAnnotation = clickedAnnotation;

    document.querySelectorAll(".drawn-annotation").forEach((shape) => {
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
// Expose functions used by inline HTML onclick attributes
// ----------------------------------------------------
window.setDrawingTool = setDrawingTool;
window.clearBibleSelectionFormat = clearBibleSelectionFormat;
window.clearSelectedDrawnAnnotation = clearSelectedDrawnAnnotation;
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

// ----------------------------------------------------
// Start editor auth check after all functions are loaded
// ----------------------------------------------------
checkEditorAuth();
