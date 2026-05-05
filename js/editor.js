// ----------------------------------------------------
// Quill font-size setup
// ----------------------------------------------------
const Size = Quill.import("attributors/class/size");

Size.whitelist = ["8px", "10px", "12px", "14px", "18px", "24px", "32px"];
Quill.register(Size, true);

const toolbarOptions = [
  [{ size: [false, "8px", "10px", "12px", "14px", "18px", "24px", "32px"] }],
  ["bold", "italic", "underline", "strike"],
  [{ color: [] }, { background: [] }],
  [{ list: "ordered" }, { list: "bullet" }, { list: "check" }],
  [{ align: [] }],
  [{ script: "sub" }, { script: "super" }],
  [{ indent: "-1" }, { indent: "+1" }],
  [{ direction: "rtl" }],
  ["link", "image"],
  ["clean"]
];

const quill = new Quill("#editor", {
  placeholder: "Notes...",
  theme: "snow",
  modules: {
    toolbar: toolbarOptions
  }
});

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

    const logoutButton = document.getElementById("logout");
    const loginButton = document.getElementById("login");

    if (logoutButton && logoutButton.parentNode) {
      logoutButton.parentNode.insertBefore(status, logoutButton.nextSibling);
    } else if (loginButton && loginButton.parentNode) {
      loginButton.parentNode.insertBefore(status, loginButton.nextSibling);
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
  "ql-clean": "Clear Format"
};

Object.keys(btnTitles).forEach((cls) => {
  toolbar.container.querySelector(`button.${cls}`)?.setAttribute("title", btnTitles[cls]);
});

toolbar.container.querySelector("select.ql-align")?.parentElement.setAttribute("title", "Align Text");
toolbar.container.querySelector(".ql-picker.ql-color")?.setAttribute("title", "Font Color");
toolbar.container.querySelector(".ql-picker.ql-background")?.setAttribute("title", "Background Color");
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

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Failed to load notes");
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

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Failed to save notes");
    }

    console.log("Quill notes saved");
    setEditorSaveStatus("Saved");
  } catch (error) {
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
      bibleTextHtml.includes("bible-bold") ||
      bibleTextHtml.includes("underline") ||
      bibleTextHtml.includes("strike")
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

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Failed to load mini-editor page");
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
        bibleName: new URLSearchParams(window.location.search).get("name") || "",
        bookChapterLabel: document.querySelector(".subheadings .column:nth-child(3)")?.textContent?.trim() || "",
        miniEditorJson,
        hasHighlights: flags.hasHighlights,
        hasDrawings: flags.hasDrawings,
        hasTextFormats: flags.hasTextFormats
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Failed to save mini-editor page");
    }

    console.log("Mini-editor page saved");
    setEditorSaveStatus("Saved");
  } catch (error) {
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
