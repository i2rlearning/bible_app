"use strict";

(function () {
  const REFERENCE_SELECTOR =
    ".eb-container .r span[id], .scripture-styles .r span[id]";

  const passageCache = new Map();
  let popup = null;
  let activeReferenceElement = null;
  let activePlainText = "";
  let activeReferenceTitle = "";

  function getCurrentBibleId() {
    const params = new URLSearchParams(window.location.search);

    return (
      params.get("bible") ||
      params.get("version") ||
      params.get("bibleId") ||
      ""
    );
  }

  function getCurrentBibleAbbreviation() {
    const params = new URLSearchParams(window.location.search);

    return (
      params.get("bibleAbbr") ||
      params.get("abbr") ||
      ""
    );
  }

  function getReferenceLabel(referenceElement) {
    return (referenceElement.textContent || "").trim();
  }

  function getReferenceId(referenceElement) {
    return (referenceElement.id || "").trim();
  }

  function getStartVerseId(passageId) {
    return passageId.split("-")[0] || passageId;
  }

  function getChapterIdFromPassageId(passageId) {
    const startVerseId = getStartVerseId(passageId);
    const parts = startVerseId.split(".");

    if (parts.length < 2) return "";

    return `${parts[0]}.${parts[1]}`;
  }

  function getBookIdFromPassageId(passageId) {
    const startVerseId = getStartVerseId(passageId);
    const parts = startVerseId.split(".");

    return parts[0] || "";
  }

  function buildChapterUrl(passageId) {
    const bibleId = getCurrentBibleId();
    const chapterId = getChapterIdFromPassageId(passageId);
    const bookId = getBookIdFromPassageId(passageId);

    if (!bibleId || !chapterId) return "#";

    const url = new URL(window.location.href);

    url.searchParams.delete("version");
    url.searchParams.delete("bibleId");
    url.searchParams.delete("name");
    url.searchParams.delete("bookName");

    url.searchParams.set("bible", bibleId);
    url.searchParams.set("chapter", chapterId);

    if (bookId) {
      url.searchParams.set("book", bookId);
    }

    const abbreviation = getCurrentBibleAbbreviation();

    if (abbreviation) {
      url.searchParams.set("bibleAbbr", abbreviation);
    }

    return url.toString();
  }

  function createPopup() {
    const element = document.createElement("section");

    element.className = "scripture-reference-popup";
    element.setAttribute("role", "dialog");
    element.setAttribute("aria-live", "polite");
    element.setAttribute("aria-modal", "false");
    element.hidden = true;

    element.innerHTML = `
      <div class="scripture-reference-popup-header">
        <h3 class="scripture-reference-popup-title"></h3>
        <button type="button" class="scripture-reference-popup-close" aria-label="Close reference popup">&times;</button>
      </div>
      <div class="scripture-reference-popup-body">
        <p class="scripture-reference-popup-status">Loading...</p>
      </div>
      <div class="scripture-reference-popup-actions">
        <button type="button" class="scripture-reference-popup-copy">Copy</button>
        <a class="scripture-reference-popup-chapter" href="#">View Chapter</a>
      </div>
    `;

    document.body.appendChild(element);

    element
      .querySelector(".scripture-reference-popup-close")
      ?.addEventListener("click", closePopup);

    element
      .querySelector(".scripture-reference-popup-copy")
      ?.addEventListener("click", copyActivePassage);

    element.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    return element;
  }

  function getPopup() {
    if (!popup) {
      popup = createPopup();
    }

    return popup;
  }

  function closePopup() {
    if (!popup) return;

    popup.hidden = true;
    activeReferenceElement = null;
    activePlainText = "";
    activeReferenceTitle = "";
  }

  function setPopupStatus(message, isError = false) {
    const element = getPopup();
    const body = element.querySelector(".scripture-reference-popup-body");

    if (!body) return;

    body.innerHTML = "";

    const status = document.createElement("p");
    status.className = isError
      ? "scripture-reference-popup-error"
      : "scripture-reference-popup-status";
    status.textContent = message;

    body.appendChild(status);
    activePlainText = "";
  }

  function setPopupContent(html) {
    const element = getPopup();
    const body = element.querySelector(".scripture-reference-popup-body");

    if (!body) return;

    body.innerHTML = html || "<p>No passage text was returned.</p>";
    activePlainText = body.innerText.trim();
  }

  function positionPopup(referenceElement) {
    const element = getPopup();
    const rect = referenceElement.getBoundingClientRect();
    const margin = 12;

    element.hidden = false;
    element.style.left = "0px";
    element.style.top = "0px";

    const popupRect = element.getBoundingClientRect();

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

    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
  }

  async function fetchPassage(passageId) {
    const bibleId = getCurrentBibleId();

    if (!bibleId) {
      throw new Error("No Bible version is selected.");
    }

    if (typeof API_KEY === "undefined" || !API_KEY) {
      throw new Error("The Bible API key is not available.");
    }

    const cacheKey = `${bibleId}::${passageId}`;

    if (passageCache.has(cacheKey)) {
      return passageCache.get(cacheKey);
    }

    const url =
      `https://api.scripture.api.bible/v1/bibles/${encodeURIComponent(bibleId)}` +
      `/passages/${encodeURIComponent(passageId)}` +
      "?content-type=html" +
      "&include-notes=false" +
      "&include-titles=false" +
      "&include-chapter-numbers=false" +
      "&include-verse-numbers=true" +
      "&include-verse-spans=false";

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "api-key": API_KEY
      }
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Could not load the referenced passage.");
    }

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

    const passage = {
      reference: result.data?.reference || "",
      content: result.data?.content || ""
    };

    passageCache.set(cacheKey, passage);

    return passage;
  }

  function getActiveCopyText() {
    return [activeReferenceTitle, activePlainText]
      .map((part) => (part || "").trim())
      .filter(Boolean)
      .join("\n\n");
  }

  async function copyActivePassage() {
    const copyText = getActiveCopyText();

    if (!copyText) return;

    try {
      await navigator.clipboard.writeText(copyText);
      updateCopyButton("Copied");
    } catch (error) {
      fallbackCopyText(copyText);
      updateCopyButton("Copied");
    }
  }

  function fallbackCopyText(text) {
    const textarea = document.createElement("textarea");

    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";

    document.body.appendChild(textarea);
    textarea.select();

    try {
      document.execCommand("copy");
    } finally {
      textarea.remove();
    }
  }

  function updateCopyButton(label) {
    const button = getPopup().querySelector(".scripture-reference-popup-copy");

    if (!button) return;

    const originalText = button.textContent;

    button.textContent = label;

    window.setTimeout(() => {
      button.textContent = originalText || "Copy";
    }, 1200);
  }

  async function openReferencePopup(referenceElement) {
    const passageId = getReferenceId(referenceElement);
    const label = getReferenceLabel(referenceElement);
    const element = getPopup();
    const title = element.querySelector(".scripture-reference-popup-title");
    const chapterLink = element.querySelector(".scripture-reference-popup-chapter");

    if (!passageId) return;

    activeReferenceElement = referenceElement;

    activeReferenceTitle = label || passageId;

    if (title) {
      title.textContent = activeReferenceTitle;
    }

    if (chapterLink) {
      chapterLink.href = buildChapterUrl(passageId);
    }

    setPopupStatus("Loading...");
    positionPopup(referenceElement);

    try {
      const passage = await fetchPassage(passageId);

      if (activeReferenceElement !== referenceElement) return;

      if (passage.reference) {
        activeReferenceTitle = passage.reference;
      }

      if (title) {
        title.textContent = activeReferenceTitle;
      }

      setPopupContent(passage.content);
      positionPopup(referenceElement);
    } catch (error) {
      if (activeReferenceElement !== referenceElement) return;

      console.error("Reference popup failed:", error);
      setPopupStatus(error.message || "Could not load the referenced passage.", true);
      positionPopup(referenceElement);
    }
  }

  function handleDocumentClick(event) {
    const referenceElement = event.target.closest?.(REFERENCE_SELECTOR);

    if (referenceElement) {
      event.preventDefault();
      event.stopPropagation();
      openReferencePopup(referenceElement);
      return;
    }

    if (!popup || popup.hidden) return;

    if (!event.target.closest?.(".scripture-reference-popup")) {
      closePopup();
    }
  }

  document.addEventListener("click", handleDocumentClick, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePopup();
    }
  });

  window.addEventListener("resize", () => {
    if (!popup || popup.hidden || !activeReferenceElement) return;

    positionPopup(activeReferenceElement);
  });

  window.addEventListener(
    "scroll",
    () => {
      if (!popup || popup.hidden || !activeReferenceElement) return;

      positionPopup(activeReferenceElement);
    },
    true
  );

  function enhanceReferenceElements(root = document) {
    root.querySelectorAll(REFERENCE_SELECTOR).forEach((referenceElement) => {
      referenceElement.setAttribute("tabindex", "0");
      referenceElement.setAttribute("role", "button");

      const label = getReferenceLabel(referenceElement);

      if (label) {
        referenceElement.setAttribute("aria-label", `Open reference ${label}`);
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    const referenceElement = event.target.closest?.(REFERENCE_SELECTOR);

    if (
      referenceElement &&
      (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      openReferencePopup(referenceElement);
    }
  });

  function initializeReferenceEnhancements() {
    enhanceReferenceElements();

    const bibleText = document.getElementById("bible-text");

    if (!bibleText) return;

    const observer = new MutationObserver(() => {
      enhanceReferenceElements(bibleText);
    });

    observer.observe(bibleText, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeReferenceEnhancements);
  } else {
    initializeReferenceEnhancements();
  }
})();
