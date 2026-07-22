"use strict";

// Page-level Bible loading, zoom, chapter navigation, and swipe navigation.
// Load this file before editor.js.

const searchInput = document.querySelector("#search-input");
const bibleSectionList = document.querySelector("#section-list");
const chapterText = document.querySelector("#chapter-text");

let versePassagePicker = null;

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

function openCurrentPassagePickerFromCompactButton() {
  if (
    typeof window.closeMobileToolbarMenus ===
    "function"
  ) {
    window.closeMobileToolbarMenus();
  }

  window.setTimeout(
    () => {
      if (
        versePassagePicker &&
        typeof versePassagePicker.setOpen ===
          "function"
      ) {
        versePassagePicker.setOpen(true);
      }
    },
    0
  );
}

function configureCompactCurrentPassageButton() {
  const mobileButton =
    document.getElementById(
      "mobile-current-passage-button"
    );

  if (!mobileButton) {
    return;
  }

  mobileButton.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      openCurrentPassagePickerFromCompactButton();
    }
  );
}


function initializePassagePicker() {
  if (!window.BibleSelector) {
    console.error(
      "BibleSelector is unavailable."
    );

    return;
  }

  versePassagePicker =
    window.BibleSelector.createPassagePicker({
      root:
        document.getElementById(
          "passage-picker"
        ),
      languageController:
        window.BibleLanguage,
      current: {
        bibleId: bibleVersionID,
        bibleAbbr: abbreviation,
        bibleName,
        bookId: bibleBookID,
        bookName: bibleBookName,
        chapterId: bibleChapterID
      }
    });
}

function configureMobilePassagePickerMenu() {
  const menuPassageLink =
    document.getElementById(
      "openPassagePickerFromMenu"
    );

  if (!menuPassageLink) {
    return;
  }

  menuPassageLink.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (
        typeof window.closeNav ===
        "function"
      ) {
        window.closeNav();
      }

      if (
        typeof window.closeMobileToolbarMenus ===
        "function"
      ) {
        window.closeMobileToolbarMenus();
      }

      window.setTimeout(
        () => {
          if (
            versePassagePicker &&
            typeof versePassagePicker.setOpen ===
              "function"
          ) {
            versePassagePicker.setOpen(true);
          }
        },
        0
      );
    }
  );
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
        initializePassagePicker();
        updateCurrentPassageLocationLabels();
        configureMobilePassagePickerMenu();
        configureCompactCurrentPassageButton();
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

// ********* Hide footnotes and make viewable *********
// ********* when the user clicks on "+"      *********
function prepareApiBibleFootnotes() {
  document.querySelectorAll(".eb-container .f").forEach((footnote) => {
    const text = footnote.querySelector(".ft")?.textContent?.trim();

    if (!text) {
      footnote.remove();
      return;
    }

    const wrapper = document.createElement("span");
    wrapper.className = "api-footnote";

    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "api-footnote-marker";
    marker.textContent = "+";
    marker.setAttribute("aria-label", "Show footnote");
    marker.setAttribute("aria-expanded", "false");

    const popup = document.createElement("span");
    popup.className = "api-footnote-popup";
    popup.textContent = text;
    popup.hidden = true;

    marker.addEventListener("click", (event) => {
      event.stopPropagation();

      const isOpen = marker.classList.contains("is-open");

      closeApiBibleFootnotes();

      if (!isOpen) {
        marker.classList.add("is-open");
        marker.textContent = "−";
        marker.setAttribute("aria-label", "Hide footnote");
        marker.setAttribute("aria-expanded", "true");
        popup.hidden = false;
        positionApiBibleFootnotePopup(marker, popup);
      }
    });

    wrapper.append(marker, popup);
    footnote.replaceWith(wrapper);
  });
}

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
  document.querySelectorAll(".api-footnote-marker.is-open").forEach((marker) => {
    marker.classList.remove("is-open");
    marker.textContent = "+";
    marker.setAttribute("aria-label", "Show footnote");
    marker.setAttribute("aria-expanded", "false");

    const popup = marker.parentElement?.querySelector(".api-footnote-popup");
    if (popup) {
      popup.hidden = true;
      popup.style.left = "";
      popup.style.top = "";
    }
  });
}

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
            document.getElementById("bible-text").innerHTML = content;
            prepareApiBibleFootnotes();
        
            requestAnimationFrame(() => {
              if (typeof window.reloadMiniEditorPageAfterChapterRender === "function") {
                window.reloadMiniEditorPageAfterChapterRender();
                return;
              }

              if (typeof window.refreshBibleAnnotationLayout === "function") {
                window.refreshBibleAnnotationLayout();
              } else {
                updateBibleZoomLayout();
              }
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
          versePassagePicker &&
          versePassagePicker.isOpen()
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
