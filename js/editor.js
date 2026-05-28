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
      alert("Direct image pasting is disabled. Please save the image to your computer and use the 'Insert Image' button to insert it.");
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
    startMiniEditorObserver();
  } catch (error) {
    console.error("Load mini-editor page error:", error);
    miniEditorLoaded = true;
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
// Start editor auth check after all functions are loaded
// ----------------------------------------------------
checkEditorAuth();
