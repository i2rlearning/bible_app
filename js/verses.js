"use strict";

// Page-level Bible loading, zoom, chapter navigation, and swipe navigation.
// Load this file before editor.js.

const searchInput = document.querySelector("#search-input");
const bibleSectionList = document.querySelector("#section-list");
const chapterText = document.querySelector("#chapter-text");

const urlParams = new URLSearchParams(window.location.search);

const bibleVersionID =
  urlParams.get("bible") ||
  urlParams.get("version") ||
  "";

const bibleChapterID =
  urlParams.get("chapter") ||
  "";

const bibleBookID =
  urlParams.get("book") ||
  (bibleChapterID.includes(".")
    ? bibleChapterID.split(".")[0]
    : "");

let bibleName =
  urlParams.get("bibleName") ||
  "";

const bibleBookName =
  urlParams.get("bookName") ||
  urlParams.get("name") ||
  bibleBookID ||
  "";

let abbreviation =
  urlParams.get("bibleAbbr") ||
  urlParams.get("abbr") ||
  "";


function getCurrentChapterNumberForDisplay() {
  const chapterParts = bibleChapterID.split(".");
  return chapterParts[chapterParts.length - 1] || "";
}

function getCurrentPassageShortLabel() {
  const chapterNumber = getCurrentChapterNumberForDisplay();
  const bookName = bibleBookName || bibleBookID || "";

  return `${bookName} ${chapterNumber}`.trim() || "Current Passage";
}

function updateCurrentPassageLocationLabels() {
  const shortLabel = getCurrentPassageShortLabel();
  const fullLabel = [
    abbreviation || "",
    shortLabel
  ].filter(Boolean).join(" • ");

  const mobileLabel =
    document.getElementById(
      "mobile-current-passage-label"
    );

  const mobileButton =
    document.getElementById(
      "mobile-current-passage-button"
    );

  const menuLabel =
    document.getElementById(
      "menu-current-passage-label"
    );

  if (mobileLabel) {
    mobileLabel.textContent = shortLabel;
  }

  if (mobileButton) {
    mobileButton.title = `Open ${fullLabel}`;
    mobileButton.setAttribute(
      "aria-label",
      `Open ${fullLabel}`
    );
  }

  if (menuLabel) {
    menuLabel.textContent = fullLabel;
  }
}

function normalizeCurrentVerseUrl() {
    if (!bibleVersionID || !bibleChapterID) {
      return;
  }

  const normalizedParams =
    new URLSearchParams();

  normalizedParams.set(
    "bible",
    bibleVersionID
  );

  if (abbreviation) {
    normalizedParams.set(
      "bibleAbbr",
      abbreviation
    );
  }

  if (bibleName) {
    normalizedParams.set(
      "bibleName",
      bibleName
    );
  }

  if (bibleBookID) {
    normalizedParams.set(
      "book",
      bibleBookID
    );
  }

  if (bibleBookName) {
    normalizedParams.set(
      "bookName",
      bibleBookName
    );
  }

  normalizedParams.set(
    "chapter",
    bibleChapterID
  );

  const normalizedUrl =
    `./verse.html?${normalizedParams.toString()}`;

  const currentRelativeUrl =
    `${window.location.pathname.split("/").pop()}${window.location.search}`;

  const normalizedRelativeUrl =
    normalizedUrl.replace("./", "");

  if (
    currentRelativeUrl !==
    normalizedRelativeUrl
  ) {
    window.history.replaceState(
      {},
      "",
      normalizedUrl
    );
  }
}

async function initializeBibleIdentity() {
  if (!bibleVersionID) {
    return;
  }

  try {
    const bibleDetails =
      await getBibleDetails(bibleVersionID);

    /*
     * The Bible ID is the source of truth.
     * Always use the API details for the abbreviation and full name.
     */

    abbreviation =
      bibleDetails.abbreviation ||
      bibleDetails.abbreviationLocal ||
      abbreviation ||
      "";

    bibleName =
      bibleDetails.name ||
      bibleDetails.nameLocal ||
      abbreviation ||
      bibleVersionID;

    const bibleTitle =
      document.getElementById("bible");

    const bibleFullNameElement =
      document.getElementById("biblefullname");

    if (bibleTitle) {
      bibleTitle.textContent =
        abbreviation || "Bible";
    }

    if (bibleFullNameElement) {
      bibleFullNameElement.textContent =
        bibleName;
    }

    normalizeCurrentVerseUrl();

    /*
     * Rebuild menu URLs after the correct Bible identity
     * has been received from the API.
     */

    configureVerseMenuLinks();
  } catch (error) {
    console.error(
      "Unable to retrieve Bible identity:",
      error
    );

    normalizeCurrentVerseUrl();
    configureVerseMenuLinks();
  }
}

function getBibleDetails(bibleId) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.withCredentials = false;

    xhr.addEventListener(
      "readystatechange",
      function () {
        if (
          this.readyState !==
          XMLHttpRequest.DONE
        ) {
          return;
        }

        if (
          this.status < 200 ||
          this.status >= 300
        ) {
          reject(
            new Error(
              `Bible details request failed with status ${this.status}.`
            )
          );

          return;
        }

        try {
          const response =
            JSON.parse(this.responseText);

          resolve(response.data || {});
        } catch (error) {
          reject(error);
        }
      }
    );

    xhr.addEventListener(
      "error",
      () => {
        reject(
          new Error(
            "A network error occurred while loading Bible details."
          )
        );
      }
    );

    xhr.open(
      "GET",
      `https://api.scripture.api.bible/v1/bibles/${encodeURIComponent(
        bibleId
      )}`
    );

    xhr.setRequestHeader(
      "api-key",
      API_KEY
    );

    xhr.send();
  });
}

let verseHTML = "";

const preloadedArrowImages = [
          "./img/left_stamp_on.png",
          "./img/right_stamp_on.png",
          "./img/orig_left_stamp.png",
          "./img/orig_right_stamp.png"
        ];
        
        preloadedArrowImages.forEach((src) => {
          const image = new Image();
          image.src = src;
        });  
        
      if (!bibleVersionID) {
        window.location.replace("./");
      } else if (!bibleBookID) {
        const bookPageParams = buildBibleParams();
      
        window.location.replace(
          `./book.html?${bookPageParams.toString()}`
        );
      } else if (!bibleChapterID) {
        const chapterPageParams = buildBibleParams();
      
        chapterPageParams.set("book", bibleBookID);
      
        if (bibleBookName) {
          chapterPageParams.set("bookName", bibleBookName);
        }
      
        window.location.replace(
          `./chapter.html?${chapterPageParams.toString()}`
        );
      } else {
        initializeBibleIdentity();
        updateCurrentPassageLocationLabels();
      }

const chapterParts = bibleChapterID.split(".");
const book = bibleBookID || chapterParts[0] || "";
const chapter = chapterParts[chapterParts.length - 1] || "";

const bibleTitle = document.getElementById("bible");
const bookChapTitle = document.getElementById("bookChap");
const bibleFullName = document.getElementById("biblefullname");

if (bibleTitle) {
  bibleTitle.textContent = abbreviation || "Bible";
}

if (bookChapTitle) {
  bookChapTitle.textContent =
    `${bibleBookName || book} ${chapter}`.trim();
}

if (bibleFullName) {
  bibleFullName.textContent =
    bibleName ||
    abbreviation ||
    bibleVersionID;
}

function buildBibleParams() {
  const params = new URLSearchParams();

  params.set("bible", bibleVersionID);

  if (abbreviation) {
    params.set("bibleAbbr", abbreviation);
  }

  if (bibleName) {
    params.set("bibleName", bibleName);
  }

  return params;
}

function configureVerseMenuLinks() {
  const homeLink = document.querySelector(
    '.overlay-content a[href="./index.html"]'
  );

  const bookLink = document.getElementById("bookurl");
  const chapterLink = document.getElementById("chapterurl");

  const searchLink = document.querySelector(
    '.overlay-content a[href="./search.html"]'
  );

  const bibleParams = buildBibleParams();

  if (homeLink) {
    homeLink.href =
      `./index.html?${bibleParams.toString()}`;
  }

  if (bookLink) {
    bookLink.href =
      `./book.html?${bibleParams.toString()}`;
  }

  if (chapterLink) {
    const chapterParams =
      new URLSearchParams(bibleParams);

    chapterParams.set("book", bibleBookID);

    if (bibleBookName) {
      chapterParams.set("bookName", bibleBookName);
    }

    chapterLink.href =
      `./chapter.html?${chapterParams.toString()}`;
  }

  if (searchLink) {
    searchLink.href =
      `./search.html?${bibleParams.toString()}`;
  }
}

// ********* Hide API.Bible footnotes and make them clickable *********
const API_BIBLE_INLINE_MARKER_SELECTOR =
  ".api-footnote-marker, .api-crossref-marker";

const API_BIBLE_SOURCE_MARKER_SELECTOR = ".f, .x";

const API_BIBLE_INLINE_MARKER_SAFE_WRAPPER_SELECTOR =
  ".anchored-inline-annotation, .bible-user-format";

let latestApiBibleInlineMarkerSourceHtml = "";
let apiBibleInlineMarkerObserver = null;
let apiBibleInlineMarkerRestoreQueued = false;
let apiBibleInlineMarkerRestoring = false;
let activeApiBibleInlineMarker = null;

function getApiBibleFootnotePopup() {
  let popup = document.getElementById("apiBibleFootnotePopup");

  if (popup) {
    return popup;
  }

  popup = document.createElement("div");
  popup.id = "apiBibleFootnotePopup";
  popup.className = "api-footnote-popup";
  popup.hidden = true;

  document.body.appendChild(popup);

  return popup;
}

function getApiBibleSourceMarkerType(sourceMarker) {
  return sourceMarker.classList.contains("x") ? "crossref" : "footnote";
}

function getApiBibleSourceMarkerText(sourceMarker) {
  if (sourceMarker.classList.contains("x")) {
    return sourceMarker.querySelector(".xt")?.textContent?.trim() || "";
  }

  return sourceMarker.querySelector(".ft")?.textContent?.trim() || "";
}

function getApiBibleSourceVerseId(sourceMarker) {
  const verseId = sourceMarker.getAttribute("data-verse-id");

  if (verseId) {
    return verseId;
  }

  const markerId = sourceMarker.id || "";

  return markerId.split("!")[0] || "";
}

function getApiBibleSourceMarkerKey(sourceMarker, type, verseId, offset) {
  return [
    type,
    sourceMarker.id || "",
    verseId || "",
    String(offset)
  ].join("|");
}

function createApiBibleInlineMarker(type, text, markerKey) {
  const marker = document.createElement("button");

  marker.type = "button";

  if (type === "crossref") {
    marker.className = "api-crossref-marker";
    marker.textContent = "x";
    marker.dataset.footnoteText = text;
    marker.setAttribute("aria-label", "Show cross-reference");
  } else {
    marker.className = "api-footnote-marker";
    marker.textContent = "+";
    marker.dataset.footnoteText = text;
    marker.setAttribute("aria-label", "Show footnote");
  }

  if (markerKey) {
    marker.dataset.apiMarkerKey = markerKey;
  }

  marker.setAttribute("aria-expanded", "false");

  return marker;
}

function getApiBibleLiveSourceMarkerKey(sourceMarker, type, verseId) {
  const bibleText = document.getElementById("bible-text");
  const verseStart = bibleText
    ? findSourceVerseStart(bibleText, verseId)
    : null;

  const offset = verseStart && bibleText
    ? getTextOffsetFromVerseStart(bibleText, verseStart, sourceMarker)
    : 0;

  return getApiBibleSourceMarkerKey(
    sourceMarker,
    type,
    verseId,
    offset
  );
}

function prepareApiBibleFootnotes() {
  document.querySelectorAll(".eb-container .f").forEach((footnote) => {
    const text = getApiBibleSourceMarkerText(footnote);

    if (!text) {
      footnote.remove();
      return;
    }

    const verseId = getApiBibleSourceVerseId(footnote);
    const markerKey = getApiBibleLiveSourceMarkerKey(
      footnote,
      "footnote",
      verseId
    );

    footnote.replaceWith(
      createApiBibleInlineMarker("footnote", text, markerKey)
    );
  });
}

function prepareApiBibleCrossReferences() {
  document.querySelectorAll(".eb-container .x").forEach((crossReference) => {
    const text = getApiBibleSourceMarkerText(crossReference);

    if (!text) {
      crossReference.remove();
      return;
    }

    const verseId = getApiBibleSourceVerseId(crossReference);
    const markerKey = getApiBibleLiveSourceMarkerKey(
      crossReference,
      "crossref",
      verseId
    );

    crossReference.replaceWith(
      createApiBibleInlineMarker("crossref", text, markerKey)
    );
  });
}

function prepareApiBibleInlineMarkers() {
  bindApiBibleInlineMarkerClicks();
  prepareApiBibleFootnotes();
  prepareApiBibleCrossReferences();
}

window.prepareApiBibleInlineMarkers = prepareApiBibleInlineMarkers;

function positionApiBibleFootnotePopup(marker, popup) {
  const margin = 12;

  popup.style.left = "0px";
  popup.style.top = "0px";

  const markerRect = marker.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();

  let left =
    markerRect.left +
    markerRect.width / 2 -
    popupRect.width / 2;

  left = Math.max(
    margin,
    Math.min(
      left,
      window.innerWidth - popupRect.width - margin
    )
  );

  const belowTop =
    markerRect.bottom + 8;

  const aboveTop =
    markerRect.top - popupRect.height - 8;

  const hasRoomBelow =
    belowTop + popupRect.height <=
    window.innerHeight - margin;

  const top = hasRoomBelow
    ? belowTop
    : Math.max(margin, aboveTop);

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

function closeApiBibleFootnotes() {
  activeApiBibleInlineMarker = null;

  const popup = document.getElementById("apiBibleFootnotePopup");

  if (popup) {
    popup.hidden = true;
    popup.textContent = "";
    popup.style.left = "";
    popup.style.top = "";
  }
}

function toggleApiBibleInlineMarker(marker) {
  const text = marker.dataset.footnoteText || "";

  if (!text) {
    return;
  }

  const wasOpen = activeApiBibleInlineMarker === marker;

  closeApiBibleFootnotes();

  if (wasOpen) {
    return;
  }

  activeApiBibleInlineMarker = marker;

  const popup = getApiBibleFootnotePopup();

  popup.textContent = text;
  popup.hidden = false;

  positionApiBibleFootnotePopup(marker, popup);
}

function bindApiBibleInlineMarkerClicks() {
  const bibleText = document.getElementById("bible-text");

  if (!bibleText || bibleText.dataset.apiInlineMarkerClicksBound === "true") {
    return;
  }

  bibleText.dataset.apiInlineMarkerClicksBound = "true";

  bibleText.addEventListener("pointerdown", (event) => {
    const marker = event.target.closest(
      API_BIBLE_INLINE_MARKER_SELECTOR
    );

    if (!marker || !bibleText.contains(marker)) {
      return;
    }

    event.stopPropagation();
  });

  bibleText.addEventListener("mousedown", (event) => {
    const marker = event.target.closest(
      API_BIBLE_INLINE_MARKER_SELECTOR
    );

    if (!marker || !bibleText.contains(marker)) {
      return;
    }

    event.stopPropagation();
  });

  bibleText.addEventListener("click", (event) => {
    const marker = event.target.closest(
      API_BIBLE_INLINE_MARKER_SELECTOR
    );

    if (!marker || !bibleText.contains(marker)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    toggleApiBibleInlineMarker(marker);
  });
}

function findSourceVerseStart(root, verseId) {
  if (!verseId) {
    return null;
  }

  const sid = apiBibleVerseIdToSid(verseId);

  return Array.from(root.querySelectorAll(".v")).find((verseNumber) => {
    return (
      verseNumber.getAttribute("data-sid") === sid ||
      verseNumber.getAttribute("id") === verseId ||
      verseNumber.getAttribute("data-verse-id") === verseId
    );
  }) || null;
}

function apiBibleVerseIdToSid(verseId) {
  const parts = String(verseId || "").split(".");

  if (parts.length < 3) {
    return verseId;
  }

  const bookId = parts[0];
  const chapterNumber = parts[1];
  const verseNumber = parts.slice(2).join("-");

  return `${bookId} ${chapterNumber}:${verseNumber}`;
}

function getTextOffsetFromVerseStart(root, verseStart, targetNode) {
  let active = false;
  let done = false;
  let offset = 0;

  function walk(node) {
    if (done) {
      return;
    }

    if (node === verseStart) {
      active = true;
      return;
    }

    if (node === targetNode) {
      done = true;
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      if (active) {
        offset += node.nodeValue.length;
      }

      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    if (active && node.matches(".v")) {
      done = true;
      return;
    }

    if (
      active &&
      node.matches(API_BIBLE_SOURCE_MARKER_SELECTOR)
    ) {
      return;
    }

    Array.from(node.childNodes).forEach(walk);
  }

  walk(root);

  return offset;
}

function getApiBibleInlineMarkerSourceItems(sourceHtml) {
  if (!sourceHtml) {
    return [];
  }

  const sourceRoot = document.createElement("div");
  sourceRoot.innerHTML = sourceHtml;

  return Array.from(
    sourceRoot.querySelectorAll(API_BIBLE_SOURCE_MARKER_SELECTOR)
  )
    .map((sourceMarker) => {
      const type = getApiBibleSourceMarkerType(sourceMarker);
      const text = getApiBibleSourceMarkerText(sourceMarker);
      const verseId = getApiBibleSourceVerseId(sourceMarker);
      const verseStart = findSourceVerseStart(sourceRoot, verseId);
      const offset = verseStart
        ? getTextOffsetFromVerseStart(
            sourceRoot,
            verseStart,
            sourceMarker
          )
        : 0;

      return {
        type,
        text,
        verseId,
        offset,
        key: getApiBibleSourceMarkerKey(
          sourceMarker,
          type,
          verseId,
          offset
        )
      };
    })
    .filter((item) => item.text && item.verseId)
    .sort((a, b) => {
      if (a.verseId !== b.verseId) {
        return a.verseId.localeCompare(b.verseId);
      }

      return b.offset - a.offset;
    });
}

function findLiveVerseStart(root, verseId) {
  return findSourceVerseStart(root, verseId);
}

function isFirstTextNodeInsideWrapper(textNode, wrapper) {
  let firstTextNode = null;

  const walker = document.createTreeWalker(
    wrapper,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        return node.nodeValue.length
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    }
  );

  firstTextNode = walker.nextNode();

  return firstTextNode === textNode;
}

function isLastTextNodeInsideWrapper(textNode, wrapper) {
  let lastTextNode = null;

  const walker = document.createTreeWalker(
    wrapper,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        return node.nodeValue.length
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    }
  );

  let currentNode = walker.nextNode();

  while (currentNode) {
    lastTextNode = currentNode;
    currentNode = walker.nextNode();
  }

  return lastTextNode === textNode;
}

function insertMarkerAtTextNodeOffset(textNode, offset, marker) {
  const wrapper = textNode.parentElement?.closest(
    API_BIBLE_INLINE_MARKER_SAFE_WRAPPER_SELECTOR
  );

  if (
    wrapper &&
    offset <= 0 &&
    isFirstTextNodeInsideWrapper(textNode, wrapper)
  ) {
    wrapper.before(marker);
    return true;
  }

  if (
    wrapper &&
    offset >= textNode.nodeValue.length &&
    isLastTextNodeInsideWrapper(textNode, wrapper)
  ) {
    wrapper.after(marker);
    return true;
  }

  if (offset <= 0) {
    textNode.parentNode.insertBefore(marker, textNode);
    return true;
  }

  if (offset >= textNode.nodeValue.length) {
    textNode.parentNode.insertBefore(marker, textNode.nextSibling);
    return true;
  }

  const afterText = textNode.splitText(offset);
  textNode.parentNode.insertBefore(marker, afterText);

  return true;
}

function insertMarkerInLiveVerse(root, item, marker) {
  const verseStart = findLiveVerseStart(root, item.verseId);

  if (!verseStart) {
    return false;
  }

  let active = false;
  let currentOffset = 0;
  let inserted = false;

  function walk(node) {
    if (inserted) {
      return;
    }

    if (node === verseStart) {
      active = true;
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      if (!active) {
        return;
      }

      const textLength = node.nodeValue.length;
      const nextOffset = currentOffset + textLength;

      if (item.offset <= nextOffset) {
        const localOffset = Math.max(
          0,
          Math.min(textLength, item.offset - currentOffset)
        );

        inserted = insertMarkerAtTextNodeOffset(
          node,
          localOffset,
          marker
        );
        return;
      }

      currentOffset = nextOffset;
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    if (active && node.matches(".v")) {
      inserted = true;
      return;
    }

    if (active && node.matches(API_BIBLE_INLINE_MARKER_SELECTOR)) {
      return;
    }

    Array.from(node.childNodes).forEach(walk);
  }

  walk(root);

  if (inserted) {
    return marker.isConnected;
  }

  const nextVerseNumber = Array.from(root.querySelectorAll(".v")).find(
    (verseNumber) =>
      verseNumber !== verseStart &&
      Boolean(
        verseStart.compareDocumentPosition(verseNumber) &
          Node.DOCUMENT_POSITION_FOLLOWING
      )
  );

  if (nextVerseNumber) {
    nextVerseNumber.before(marker);
    return true;
  }

  verseStart.parentNode.appendChild(marker);
  return true;
}

function hasApiBibleInlineMarkerKey(root, markerKey) {
  return Array.from(
    root.querySelectorAll(API_BIBLE_INLINE_MARKER_SELECTOR)
  ).some((marker) => marker.dataset.apiMarkerKey === markerKey);
}

function removeLegacyApiBibleInlineMarkers(root) {
  root
    .querySelectorAll(API_BIBLE_INLINE_MARKER_SELECTOR)
    .forEach((marker) => {
      if (marker.dataset.apiMarkerKey) {
        return;
      }

      marker.remove();
    });
}

function getApiBibleInlineMarkerIdentityFromKey(markerKey) {
  const keyParts = String(markerKey || "").split("|");
  const type = keyParts[0] || "";
  const sourceId = keyParts[1] || "";
  const verseId = keyParts[2] || "";

  if (!type || !sourceId || !verseId) {
    return "";
  }

  return `${type}|${sourceId}|${verseId}`;
}

function getApiBibleInlineMarkerIdentity(marker) {
  return getApiBibleInlineMarkerIdentityFromKey(
    marker.dataset.apiMarkerKey || ""
  );
}

function getApiBibleSourceItemIdentity(item) {
  return getApiBibleInlineMarkerIdentityFromKey(item.key || "");
}

function hasApiBibleInlineMarkerIdentity(root, item) {
  const itemIdentity = getApiBibleSourceItemIdentity(item);

  if (!itemIdentity) {
    return false;
  }

  return Array.from(
    root.querySelectorAll(API_BIBLE_INLINE_MARKER_SELECTOR)
  ).some((marker) => {
    return getApiBibleInlineMarkerIdentity(marker) === itemIdentity;
  });
}

function removeDuplicateApiBibleInlineMarkers(root) {
  const seenKeys = new Set();
  const seenIdentities = new Set();

  root
    .querySelectorAll(API_BIBLE_INLINE_MARKER_SELECTOR)
    .forEach((marker) => {
      const markerKey = marker.dataset.apiMarkerKey || "";

      if (!markerKey) {
        return;
      }

      const markerIdentity =
        getApiBibleInlineMarkerIdentity(marker);

      if (
        seenKeys.has(markerKey) ||
        (markerIdentity && seenIdentities.has(markerIdentity))
      ) {
        marker.remove();
        return;
      }

      seenKeys.add(markerKey);

      if (markerIdentity) {
        seenIdentities.add(markerIdentity);
      }
    });
}

function restoreApiBibleInlineMarkersFromSource() {
  if (
    apiBibleInlineMarkerRestoring ||
    !latestApiBibleInlineMarkerSourceHtml
  ) {
    return;
  }

  const bibleText = document.getElementById("bible-text");

  if (!bibleText) {
    return;
  }

  apiBibleInlineMarkerRestoring = true;

  try {
    prepareApiBibleInlineMarkers();
    removeLegacyApiBibleInlineMarkers(bibleText);
    removeDuplicateApiBibleInlineMarkers(bibleText);

    const sourceItems = getApiBibleInlineMarkerSourceItems(
      latestApiBibleInlineMarkerSourceHtml
    );

    sourceItems.forEach((item) => {
      if (
        hasApiBibleInlineMarkerKey(bibleText, item.key) ||
        hasApiBibleInlineMarkerIdentity(bibleText, item)
      ) {
        return;
      }

      const marker = createApiBibleInlineMarker(
        item.type,
        item.text,
        item.key
      );

      insertMarkerInLiveVerse(bibleText, item, marker);
    });

    removeDuplicateApiBibleInlineMarkers(bibleText);
  } finally {
    apiBibleInlineMarkerRestoring = false;
  }
}

function queueApiBibleInlineMarkerRestore() {
  if (
    apiBibleInlineMarkerRestoreQueued ||
    apiBibleInlineMarkerRestoring
  ) {
    return;
  }

  apiBibleInlineMarkerRestoreQueued = true;

  requestAnimationFrame(() => {
    apiBibleInlineMarkerRestoreQueued = false;
    restoreApiBibleInlineMarkersFromSource();
  });
}

function observeApiBibleInlineMarkerContainer() {
  const bibleText = document.getElementById("bible-text");

  if (!bibleText) {
    return;
  }

  if (apiBibleInlineMarkerObserver) {
    apiBibleInlineMarkerObserver.disconnect();
  }

  apiBibleInlineMarkerObserver = new MutationObserver(() => {
    queueApiBibleInlineMarkerRestore();
  });

  apiBibleInlineMarkerObserver.observe(bibleText, {
    childList: true,
    subtree: true
  });
}

window.restoreApiBibleInlineMarkersFromSource =
  restoreApiBibleInlineMarkersFromSource;

document.addEventListener("click", closeApiBibleFootnotes);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeApiBibleFootnotes();
  }
});

window.addEventListener("resize", closeApiBibleFootnotes);
window.addEventListener("scroll", closeApiBibleFootnotes, true);



// ******************* Bible zoom state *********************
      // The visible navbar zoom slider has been removed for now.
      // Keep this logic optional so a future zoom control can reuse it
      // without breaking chapter loading when #font-size-slider is absent.
      const fontSizeSlider = document.getElementById("font-size-slider");

      window.currentBibleZoom = 1;

      function updateBibleZoomLayout() {
        const displayText = document.getElementById("display-text");
        const drawingArea = document.getElementById("bible-drawing-area");

        if (!displayText || !drawingArea) return;

        const zoom = Number(window.currentBibleZoom) || 1;

        // Important: never let a previous smaller viewport permanently lock
        // the drawing/text wrapper width. The CSS should recalculate the
        // natural width whenever the browser grows again.
        drawingArea.style.width = "";
        drawingArea.style.maxWidth = "100%";

        drawingArea.style.transform = zoom > 1.001 ? `scale(${zoom})` : "";
        drawingArea.style.transformOrigin = "top left";

        const displayStyles = window.getComputedStyle(displayText);

        const paddingTop = parseFloat(displayStyles.paddingTop) || 0;
        const paddingBottom = parseFloat(displayStyles.paddingBottom) || 0;

        const naturalRect = drawingArea.getBoundingClientRect();
        const naturalWidth = naturalRect.width || drawingArea.clientWidth || drawingArea.scrollWidth;
        const naturalHeight = drawingArea.scrollHeight;

        const zoomedHeight = naturalHeight * zoom;
        const zoomedWidth = naturalWidth * zoom;

        if (zoom <= 1.001) {
          // At normal zoom, let the document height and width be automatic.
          // This prevents the smaller responsive layout from getting stuck
          // when the window returns to a larger size.
          displayText.style.height = "";
          displayText.style.minHeight = "";
          displayText.style.overflowX = "hidden";
          displayText.style.overflowY = "visible";
          return;
        }

        const totalHeight = zoomedHeight + paddingTop + paddingBottom + 10;

        displayText.style.height = `${totalHeight}px`;
        displayText.style.minHeight = `${totalHeight}px`;

        displayText.style.overflowX =
          zoomedWidth > displayText.clientWidth ? "auto" : "hidden";

        displayText.style.overflowY = "hidden";
      }

      window.updateBibleZoomLayout = updateBibleZoomLayout;

      if (fontSizeSlider) {
        fontSizeSlider.min = 18;
        fontSizeSlider.max = 35;
        fontSizeSlider.value = 18;

        fontSizeSlider.addEventListener("input", () => {
          const sliderValue = Number(fontSizeSlider.value);

          // 18 = 100%, 35 = about 194%
          window.currentBibleZoom = sliderValue / 18;

          if (typeof window.refreshBibleAnnotationLayout === "function") {
            window.refreshBibleAnnotationLayout();
          } else {
            updateBibleZoomLayout();
          }
        });
      }
    
      // ******************* Load chapter text *********************
      getChapterText(bibleChapterID)
          .then((content) => {
            const bibleText = document.getElementById("bible-text");

            latestApiBibleInlineMarkerSourceHtml = content;
            bibleText.innerHTML = content;

            prepareApiBibleInlineMarkers();
            observeApiBibleInlineMarkerContainer();

            const restoreMarkersAndRefreshLayout = () => {
              restoreApiBibleInlineMarkersFromSource();

              if (typeof window.refreshBibleAnnotationLayout === "function") {
                window.refreshBibleAnnotationLayout();
              } else {
                updateBibleZoomLayout();
              }
            };

            requestAnimationFrame(() => {
              restoreApiBibleInlineMarkersFromSource();

              if (typeof window.reloadMiniEditorPageAfterChapterRender === "function") {
                const reloadResult =
                  window.reloadMiniEditorPageAfterChapterRender();

                Promise
                  .resolve(reloadResult)
                  .then(restoreMarkersAndRefreshLayout)
                  .catch((error) => {
                    console.error(
                      "Failed to reload saved editor markings:",
                      error
                    );

                    restoreMarkersAndRefreshLayout();
                  });

                setTimeout(restoreMarkersAndRefreshLayout, 0);
                setTimeout(restoreMarkersAndRefreshLayout, 150);
                setTimeout(restoreMarkersAndRefreshLayout, 600);
                return;
              }

              restoreMarkersAndRefreshLayout();

              setTimeout(restoreMarkersAndRefreshLayout, 0);
              setTimeout(restoreMarkersAndRefreshLayout, 150);
            });
          })
          .catch((error) => {
            console.error("Failed to load chapter text:", error);
            document.getElementById("bible-text").innerHTML =
              "<p>Could not load chapter text. Please try again later.</p>";
          });

      /**
       * Gets verses from API.Bible
       */
      function getVerses(bibleVersionID, bibleChapterID) {
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.withCredentials = false;
    
          xhr.addEventListener(`readystatechange`, function () {
            if (this.readyState === this.DONE) {
              const { data } = JSON.parse(this.responseText);
              const verses = data.map(({ id }) => {
                return { id };
              });
    
              resolve(verses);
            }
          });
    
          xhr.open(
            `GET`,
            `https://api.scripture.api.bible/v1/bibles/${bibleVersionID}/chapters/${bibleChapterID}/verses`
          );
          xhr.setRequestHeader(`api-key`, API_KEY);
    
          xhr.onerror = () => reject(xhr.statusText);
    
          xhr.send();
        });
      }
    
      /**
       * Gets chapter text from API.Bible
       */
      function getChapterText(bibleChapterID) {
          return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.withCredentials = false;
        
            xhr.addEventListener("readystatechange", function () {
              if (this.readyState === this.DONE) {
                try {
                  if (this.status < 200 || this.status >= 300) {
                    console.error("API.Bible chapter request failed:", this.status, this.responseText);
                    reject(new Error(`API.Bible request failed with status ${this.status}`));
                    return;
                  }
        
                  const { data, meta } = JSON.parse(this.responseText);
        
                  if (meta && meta.fumsId && window._BAPI && typeof window._BAPI.t === "function") {
                    try {
                      window._BAPI.t(meta.fumsId);
                    } catch (error) {
                      console.warn("FUMS tracking failed:", error);
                    }
                  }
        
                  resolve(data.content);
                } catch (error) {
                  console.error("Could not parse/load chapter text:", error);
                  reject(error);
                }
              }
            });
        
            xhr.open(
              "GET",
              `https://api.scripture.api.bible/v1/bibles/${bibleVersionID}/chapters/${bibleChapterID}?content-type=html&include-notes=true`
            );
        
            xhr.setRequestHeader("api-key", API_KEY);
        
            xhr.onerror = () => reject(new Error(xhr.statusText || "Network error"));
        
            xhr.send();
          });
        }
    
      function getSections(bibleVersionID, bibleBookID) {
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.withCredentials = false;
    
          xhr.addEventListener(`readystatechange`, function () {
            if (this.readyState === this.DONE) {
              const { data } = JSON.parse(this.responseText);
              const sections = data
                ? data.map(({ title, id }) => {
                    return { title, id };
                  })
                : null;
    
              resolve(sections);
            }
          });
    
          xhr.open(
            `GET`,
            `https://api.scripture.api.bible/v1/bibles/${bibleVersionID}/books/${bibleBookID}/sections`
          );
          xhr.setRequestHeader(`api-key`, API_KEY);
    
          xhr.onerror = () => reject(xhr.statusText);
    
          xhr.send();
        });
      }
    
      /**
       * Parses verse number from verseID
       */
      function getVerseNumber(verseID) {
        let verseNumber;
    
        if (verseID.includes(`-`)) {
          verseNumber =
            verseID.split(`-`).shift().split(`.`).pop() +
            `-` +
            verseID.split(`-`).pop().split(`.`).pop();
        } else {
          verseNumber = verseID.split(`.`).pop();
        }
    
        return verseNumber;
      }
    
      function getParameterByName(name) {
        return new URLSearchParams(
          window.location.search
        ).get(name);
      }    
         
      // ******************* Left/Right Seals *********************
      const imageLeft = document.getElementById("imgleft");
      const imageRight = document.getElementById("imgright");

      const currentBookId =
        bibleBookID ||
        chapterParts[0] ||
        "";

      let chapterNavigationState = {
        chapters: [],
        currentIndex: -1,
        previousChapter: null,
        nextChapter: null,
        firstChapter: null,
        lastChapter: null
      };

      function buildChapterUrl(chapterId) {
        const url =
          new URL(window.location.href);

        url.searchParams.delete("version");
        url.searchParams.delete("abbr");
        url.searchParams.delete("name");

        url.searchParams.set(
          "bible",
          bibleVersionID
        );

        if (abbreviation) {
          url.searchParams.set(
            "bibleAbbr",
            abbreviation
          );
        }

        if (bibleName) {
          url.searchParams.set(
            "bibleName",
            bibleName
          );
        }

        url.searchParams.set(
          "book",
          currentBookId
        );

        if (bibleBookName) {
          url.searchParams.set(
            "bookName",
            bibleBookName
          );
        }

        url.searchParams.set(
          "chapter",
          chapterId
        );

        return `${url.pathname}?${url.searchParams.toString()}`;
      }

      function canGoPreviousChapter() {
        return Boolean(
          chapterNavigationState.previousChapter
        );
      }

      function canGoNextChapter() {
        return Boolean(
          chapterNavigationState.nextChapter
        );
      }

      function goToPreviousChapter() {
        const previousChapter =
          chapterNavigationState.previousChapter;

        if (!previousChapter) {
          return;
        }

        window.location.href =
          buildChapterUrl(
            previousChapter.id
          );
      }

      function goToNextChapter() {
        const nextChapter =
          chapterNavigationState.nextChapter;

        if (!nextChapter) {
          return;
        }

        window.location.href =
          buildChapterUrl(
            nextChapter.id
          );
      }

      function updateArrowCursorStates() {
        if (imageLeft) {
          imageLeft.style.cursor =
            canGoPreviousChapter()
              ? "pointer"
              : "default";
        }

        if (imageRight) {
          imageRight.style.cursor =
            canGoNextChapter()
              ? "pointer"
              : "default";
        }
      }

      async function initializeChapterArrows() {
        if (
          !window.BibleSelector ||
          !bibleVersionID ||
          !currentBookId ||
          !bibleChapterID
        ) {
          updateArrowCursorStates();
          return;
        }

        try {
          const chapters =
            await window.BibleSelector.loadChapters(
              bibleVersionID,
              currentBookId
            );

          chapterNavigationState =
            window.BibleSelector.getChapterState(
              chapters,
              bibleChapterID
            );
        } catch (error) {
          console.error(
            "Could not initialize chapter navigation:",
            error
          );
        }

        updateArrowCursorStates();
      }

      if (imageLeft) {
        imageLeft.addEventListener(
          "mouseover",
          function () {
            if (canGoPreviousChapter()) {
              imageLeft.src =
                "./img/left_stamp_on.png";

              imageLeft.style.cursor =
                "pointer";
            } else {
              imageLeft.style.cursor =
                "default";
            }
          }
        );

        imageLeft.addEventListener(
          "mouseout",
          function () {
            imageLeft.src =
              "./img/orig_left_stamp.png";
          }
        );

        imageLeft.addEventListener(
          "click",
          function () {
            goToPreviousChapter();
          }
        );
      }

      if (imageRight) {
        imageRight.addEventListener(
          "mouseover",
          function () {
            if (canGoNextChapter()) {
              imageRight.src =
                "./img/right_stamp_on.png";

              imageRight.style.cursor =
                "pointer";
            } else {
              imageRight.style.cursor =
                "default";
            }
          }
        );

        imageRight.addEventListener(
          "mouseout",
          function () {
            imageRight.src =
              "./img/orig_right_stamp.png";
          }
        );

        imageRight.addEventListener(
          "click",
          function () {
            goToNextChapter();
          }
        );
      }

      let initialTouchX = null;
      let initialTouchY = null;

      window.addEventListener(
        "touchstart",
        function (event) {
          if (
            typeof window.isBibleDrawingActive ===
              "function" &&
            window.isBibleDrawingActive()
          ) {
            initialTouchX = null;
            initialTouchY = null;
            return;
          }

          if (event.touches.length === 1) {
            initialTouchX =
              event.touches[0].clientX;

            initialTouchY =
              event.touches[0].clientY;
          }
        },
        {
          passive: true
        }
      );

      window.addEventListener(
        "touchend",
        function (event) {
          if (
            typeof window.isBibleDrawingActive ===
              "function" &&
            window.isBibleDrawingActive()
          ) {
            initialTouchX = null;
            initialTouchY = null;
            return;
          }

          if (
            initialTouchX === null ||
            initialTouchY === null ||
            !event.changedTouches.length
          ) {
            return;
          }

          const finalTouchX =
            event.changedTouches[0].clientX;

          const finalTouchY =
            event.changedTouches[0].clientY;

          const diffX =
            finalTouchX - initialTouchX;

          const diffY =
            finalTouchY - initialTouchY;

          if (
            Math.abs(diffX) >
              Math.abs(diffY) &&
            Math.abs(diffX) > 30
          ) {
            if (diffX > 0) {
              goToPreviousChapter();
            } else {
              goToNextChapter();
            }
          }

          initialTouchX = null;
          initialTouchY = null;
        }
      );



      function isKeyboardNavigationBlocked(event) {
        if (
          window.PagePassagePicker?.isOpen?.()
        ) {
          return true;
        }

        if (
          event.defaultPrevented ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        ) {
          return true;
        }

        if (
          typeof window.isBibleDrawingActive ===
            "function" &&
          window.isBibleDrawingActive()
        ) {
          return true;
        }

        const target = event.target;

        if (!(target instanceof Element)) {
          return false;
        }

        const tagName =
          target.tagName.toLowerCase();

        if (
          tagName === "input" ||
          tagName === "textarea" ||
          tagName === "select" ||
          tagName === "button"
        ) {
          return true;
        }

        if (
          target.isContentEditable ||
          target.closest(
            '[contenteditable="true"], .ql-editor'
          )
        ) {
          return true;
        }

        return false;
      }

      window.addEventListener(
        "keydown",
        function (event) {
          if (
            event.key !== "ArrowLeft" &&
            event.key !== "ArrowRight"
          ) {
            return;
          }

          if (
            isKeyboardNavigationBlocked(
              event
            )
          ) {
            return;
          }

          if (
            event.key === "ArrowLeft" &&
            canGoPreviousChapter()
          ) {
            event.preventDefault();
            goToPreviousChapter();
            return;
          }

          if (
            event.key === "ArrowRight" &&
            canGoNextChapter()
          ) {
            event.preventDefault();
            goToNextChapter();
          }
        }
      );

      initializeChapterArrows();
