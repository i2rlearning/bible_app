// 1. Switch from 'style' to 'class' (This stops the inline style conflicts)
const Size = Quill.import('attributors/class/size');
Size.whitelist = ['8px', '10px', '12px', '14px', '18px', '24px', '32px'];
Quill.register(Size, true);

const toolbarOptions = [
  [{ size: [false, '8px', '10px', '12px', '14px', '18px', '24px', '32px'] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ color: [] }, { background: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }, { list: 'check' }],
  [{ align: [] }],
  [{ script: 'sub' }, { script: 'super' }],
  [{ indent: '-1' }, { indent: '+1' }],
  [{ direction: 'rtl' }],
  ['link', 'image'],
  ['clean']
];

const quill = new Quill('#editor', {
  placeholder: 'Notes...',
  theme: 'snow',
  modules: { toolbar: toolbarOptions }
});

const toolbar = quill.getModule('toolbar');

// ----------------------------------------------------
// Formatting Logic (CLEANED UP)
// ----------------------------------------------------
// We no longer manually run quill.format('size', '14px') here.
// The CSS handles the 16px default automatically.

// ----------------------------------------------------
// Tooltips & UI
// ----------------------------------------------------
const sizeSelect = toolbar?.container.querySelector('select.ql-size');
if (sizeSelect) {
  sizeSelect.setAttribute('title', 'Change Font Size');
  // We do NOT dispatch a 'change' event here anymore.
  // We let the picker sit at its default state.
}

// Simple Tooltips
const btnTitles = {
  'ql-bold': 'Bold',
  'ql-italic': 'Italic',
  'ql-underline': 'Underline',
  'ql-strike': 'Strikethrough',
  'ql-link': 'Insert Link',
  'ql-image': 'Insert Image',
  'ql-direction': 'Text Direction',
  'ql-clean': 'Clear Format'
};

Object.keys(btnTitles).forEach(cls => {
  toolbar.container.querySelector(`button.${cls}`)?.setAttribute('title', btnTitles[cls]);
});

// Selectors (Align, Color, BG, Lists, Indent)
toolbar.container.querySelector('select.ql-align')?.parentElement.setAttribute('title', 'Align Text');
toolbar.container.querySelector('.ql-picker.ql-color')?.setAttribute('title', 'Font Color');
toolbar.container.querySelector('.ql-picker.ql-background')?.setAttribute('title', 'Background Color');
toolbar.container.querySelector('button.ql-list[value="ordered"]')?.setAttribute('title', 'Ordered List');
toolbar.container.querySelector('button.ql-list[value="bullet"]')?.setAttribute('title', 'Bullet List');
toolbar.container.querySelector('button.ql-list[value="check"]')?.setAttribute('title', 'Checkbox List');
toolbar.container.querySelector('button.ql-indent[value="-1"]')?.setAttribute('title', 'Outdent');
toolbar.container.querySelector('button.ql-indent[value="+1"]')?.setAttribute('title', 'Indent');
toolbar.container.querySelector('button.ql-script[value="sub"]')?.setAttribute('title', 'Subscript');
toolbar.container.querySelector('button.ql-script[value="super"]')?.setAttribute('title', 'Superscript');

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
  } else {
    lockEditorTools();
  }
  catch (error) {
    lockEditorTools();
  }
}

function lockEditorTools() {
  editorToolsUnlocked = false;

  document.body.classList.add("editor-locked-state");

  if (typeof quill !== "undefined") {
    quill.disable();
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

  let message = document.getElementById("editor-login-message");

  if (!message) {
    message = document.createElement("div");
    message.id = "editor-login-message";
    message.textContent = "Log in to use notes and editor tools.";

    const editor = document.getElementById("editor");

    if (editor) {
      editor.parentNode.insertBefore(message, editor);
    }
  }
}

function unlockEditorTools() {
  editorToolsUnlocked = true;

  document.body.classList.remove("editor-locked-state");

  if (typeof quill !== "undefined") {
    quill.enable();
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
}

checkEditorAuth();

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
        quillDelta,
        plainText
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Failed to save notes");
    }

    console.log("Quill notes saved");
  } catch (error) {
    console.error("Save Quill notes error:", error);
  }
}

function scheduleQuillNotesSave() {
  if (!editorToolsUnlocked) return;
  if (!quillNotesLoaded) return;

  clearTimeout(quillSaveTimer);

  quillSaveTimer = setTimeout(() => {
    saveQuillNotes();
  }, 1200);
}

if (typeof quill !== "undefined") {
  loadQuillNotes();

  quill.on("text-change", function () {
    scheduleQuillNotesSave();
  });
}
