"use strict";

// Page-level Bible loading, zoom, chapter navigation, and swipe navigation.
// Load this file before editor.js.

const searchInput = document.querySelector("#search-input");
const bibleSectionList = document.querySelector("#section-list");
const chapterText = document.querySelector("#chapter-text");

const languageSelect = document.getElementById("language-select");
const bibleSelect = document.getElementById("bible-select");
const bookSelect = document.getElementById("book-select");
const chapterSelect = document.getElementById("chapter-select");

let availableBibles = [];

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

function resetDropdown(
  selectElement,
  message,
  disabled = true
) {
  if (!selectElement) {
    return;
  }

  selectElement.innerHTML = "";

  const option =
    document.createElement("option");

  option.value = "";
  option.textContent = message;

  selectElement.appendChild(option);
  selectElement.disabled = disabled;
}

async function loadBibleDropdownOptions(
  apiUrl =
    window.BibleLanguage
      ?.getSelectedApiUrl()
) {
  if (!bibleSelect || !apiUrl) {
    return;
  }

  resetDropdown(
    bibleSelect,
    "Loading Bibles...",
    true
  );

  try {
    const response = await fetch(
      apiUrl,
      {
        headers: {
          "api-key": API_KEY
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        `Bible list request failed with status ${response.status}.`
      );
    }

    const result =
      await response.json();

    availableBibles =
      Array.isArray(result.data)
        ? result.data
        : [];

    availableBibles.sort(
      (a, b) => {
        const labelA =
          a.abbreviation ||
          a.abbreviationLocal ||
          a.name ||
          "";

        const labelB =
          b.abbreviation ||
          b.abbreviationLocal ||
          b.name ||
          "";

        return labelA.localeCompare(
          labelB
        );
      }
    );

    bibleSelect.innerHTML = "";

    for (const bible of availableBibles) {
      const option =
        document.createElement("option");
    
      option.value =
        bible.id;
    
      const bibleTitle =
        bible.name ||
        bible.nameLocal ||
        bible.abbreviation ||
        bible.abbreviationLocal ||
        bible.id;
    
      const bibleDescription =
        bible.description ||
        bible.descriptionLocal ||
        "";
    
      option.textContent =
        bible.abbreviation ||
        bible.abbreviationLocal ||
        bible.name ||
        bible.nameLocal ||
        bible.id;
    
      const normalizedTitle =
        bibleTitle.trim().toLowerCase();
    
      const normalizedDescription =
        bibleDescription.trim().toLowerCase();
    
      option.title =
        bibleDescription &&
        normalizedDescription !== normalizedTitle
          ? `${bibleTitle} (${bibleDescription})`
          : bibleTitle;
    
      bibleSelect.appendChild(option);
    }

    const currentBibleExists =
      availableBibles.some(
        (bible) =>
          bible.id === bibleVersionID
      );

    if (currentBibleExists) {
      bibleSelect.value =
        bibleVersionID;
    }

    bibleSelect.disabled =
      availableBibles.length === 0;

    updateBibleSelectDescription();
  } catch (error) {
    console.error(
      "Unable to load Bible dropdown:",
      error
    );

    resetDropdown(
      bibleSelect,
      "Unable to load Bibles",
      true
    );
  }
}

function updateBibleSelectDescription() {
  if (!bibleSelect) {
    return;
  }

  const selectedBible =
    availableBibles.find(
      (bible) =>
        bible.id === bibleSelect.value
    );

  bibleSelect.title =
    selectedBible?.description ||
    selectedBible?.descriptionLocal ||
    selectedBible?.name ||
    selectedBible?.nameLocal ||
    "";
}

async function loadBookDropdownOptions(
  selectedBibleId =
    bibleVersionID
) {
  if (!bookSelect || !selectedBibleId) {
    return;
  }

  resetDropdown(
    bookSelect,
    "Loading Books...",
    true
  );

  resetDropdown(
    chapterSelect,
    "Loading Chapters...",
    true
  );

  try {
    const response = await fetch(
      `https://api.scripture.api.bible/v1/bibles/${encodeURIComponent(
        selectedBibleId
      )}/books`,
      {
        headers: {
          "api-key": API_KEY
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        `Book list request failed with status ${response.status}.`
      );
    }

    const result =
      await response.json();

    const books =
      Array.isArray(result.data)
        ? result.data
        : [];

    bookSelect.innerHTML = "";

    const placeholder =
      document.createElement("option");

    placeholder.value = "";
    placeholder.textContent =
      "Select a Book...";

    bookSelect.appendChild(
      placeholder
    );

    for (const bookItem of books) {
      const option =
        document.createElement("option");

      option.value =
        bookItem.id;

      option.textContent =
        bookItem.name ||
        bookItem.nameLong ||
        bookItem.abbreviation ||
        bookItem.id;

      bookSelect.appendChild(option);
    }

    const currentBookExists =
      books.some(
        (bookItem) =>
          bookItem.id === bibleBookID
      );

    if (currentBookExists) {
      bookSelect.value =
        bibleBookID;
    } else {
      bookSelect.value = "";
    }

    bookSelect.disabled =
      books.length === 0;

    if (currentBookExists) {
      await loadChapterDropdownOptions(
        selectedBibleId,
        bibleBookID
      );
    } else {
      resetDropdown(
        chapterSelect,
        "Select a book first",
        true
      );
    }
  } catch (error) {
    console.error(
      "Unable to load Book dropdown:",
      error
    );

    resetDropdown(
      bookSelect,
      "Unable to load Books",
      true
    );

    resetDropdown(
      chapterSelect,
      "Unable to load Chapters",
      true
    );
  }
}

async function loadChapterDropdownOptions(
  selectedBibleId =
    bibleVersionID,
  selectedBookId =
    bookSelect?.value ||
    bibleBookID
) {
  if (
    !chapterSelect ||
    !selectedBibleId ||
    !selectedBookId
  ) {
    resetDropdown(
      chapterSelect,
      "Select a book first",
      true
    );

    return;
  }

  resetDropdown(
    chapterSelect,
    "Loading Chapters...",
    true
  );

  try {
    const response = await fetch(
      `https://api.scripture.api.bible/v1/bibles/${encodeURIComponent(
        selectedBibleId
      )}/books/${encodeURIComponent(
        selectedBookId
      )}/chapters`,
      {
        headers: {
          "api-key": API_KEY
        }
      }
    );

    if (!response.ok) {
      throw new Error(
        `Chapter list request failed with status ${response.status}.`
      );
    }

    const result =
      await response.json();

    const chapters =
      Array.isArray(result.data)
        ? result.data
        : [];

    chapterSelect.innerHTML = "";

    const placeholder =
      document.createElement("option");

    placeholder.value = "";
    placeholder.textContent =
      "Select a Chapter...";

    chapterSelect.appendChild(
      placeholder
    );

    for (const chapterItem of chapters) {
      const option =
        document.createElement("option");

      option.value =
        chapterItem.id;

      option.textContent =
        chapterItem.number ||
        chapterItem.id.split(".").pop() ||
        chapterItem.id;

      chapterSelect.appendChild(
        option
      );
    }

    const currentChapterExists =
      selectedBibleId === bibleVersionID &&
      selectedBookId === bibleBookID &&
      chapters.some(
        (chapterItem) =>
          chapterItem.id ===
          bibleChapterID
      );

    chapterSelect.value =
      currentChapterExists
        ? bibleChapterID
        : "";

    chapterSelect.disabled =
      chapters.length === 0;
  } catch (error) {
    console.error(
      "Unable to load Chapter dropdown:",
      error
    );

    resetDropdown(
      chapterSelect,
      "Unable to load Chapters",
      true
    );
  }
}

function navigateToSelectedBible() {
  if (!bibleSelect?.value) {
    return;
  }

  const selectedBible =
    availableBibles.find(
      (bible) =>
        bible.id === bibleSelect.value
    );

  if (!selectedBible) {
    return;
  }

  const url =
    new URL(window.location.href);

  url.searchParams.delete("version");
  url.searchParams.delete("abbr");
  url.searchParams.delete("name");

  url.searchParams.set(
    "bible",
    selectedBible.id
  );

  const selectedAbbreviation =
    selectedBible.abbreviation ||
    selectedBible.abbreviationLocal ||
    selectedBible.name ||
    selectedBible.id;

  const selectedFullName =
    selectedBible.name ||
    selectedBible.nameLocal ||
    selectedAbbreviation;

  url.searchParams.set(
    "bibleAbbr",
    selectedAbbreviation
  );

  url.searchParams.set(
    "bibleName",
    selectedFullName
  );

  /*
   * Book, bookName and chapter remain untouched.
   */

  window.location.assign(
    url.toString()
  );
}

function navigateToSelectedChapter() {
  const selectedBookId =
    bookSelect?.value || "";

  const selectedChapterId =
    chapterSelect?.value || "";

  if (
    !selectedBookId ||
    !selectedChapterId
  ) {
    return;
  }

  const selectedBookName =
    bookSelect.options[
      bookSelect.selectedIndex
    ]?.textContent?.trim() ||
    selectedBookId;

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
    selectedBookId
  );

  url.searchParams.set(
    "bookName",
    selectedBookName
  );

  url.searchParams.set(
    "chapter",
    selectedChapterId
  );

  window.location.assign(
    url.toString()
  );
}

function initializeLanguageAndBibleDropdowns() {
  if (
    languageSelect &&
    window.BibleLanguage
  ) {
    window.BibleLanguage.setupSelect(
      languageSelect,
      {
        async onChange({ apiUrl }) {
          await loadBibleDropdownOptions(
            apiUrl
          );

          resetDropdown(
            bookSelect,
            "Current page unchanged",
            true
          );

          resetDropdown(
            chapterSelect,
            "Current page unchanged",
            true
          );
        }
      }
    );
  }

  loadBibleDropdownOptions().then(
    () => {
      loadBookDropdownOptions(
        bibleVersionID
      );
    }
  );
}

bibleSelect?.addEventListener(
  "change",
  () => {
    updateBibleSelectDescription();
    navigateToSelectedBible();
  }
);

bookSelect?.addEventListener(
  "change",
  async () => {
    await loadChapterDropdownOptions(
      bibleVersionID,
      bookSelect.value
    );
  }
);

chapterSelect?.addEventListener(
  "change",
  () => {
    navigateToSelectedChapter();
  }
);

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
        initializeLanguageAndBibleDropdowns();
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

    
      // ******************* Bible zoom state *********************
      const fontSizeSlider = document.getElementById("font-size-slider");
    
      window.currentBibleZoom = 1;
    
      fontSizeSlider.min = 18;
      fontSizeSlider.max = 35;
      fontSizeSlider.value = 18;
    
      function updateBibleZoomLayout() {
        const displayText = document.getElementById("display-text");
        const drawingArea = document.getElementById("bible-drawing-area");
    
        if (!displayText || !drawingArea) return;
    
        drawingArea.style.transform = `scale(${window.currentBibleZoom})`;
        drawingArea.style.transformOrigin = "top left";
    
        const displayStyles = window.getComputedStyle(displayText);
    
        const paddingTop = parseFloat(displayStyles.paddingTop) || 0;
        const paddingBottom = parseFloat(displayStyles.paddingBottom) || 0;
    
        const originalHeight = drawingArea.scrollHeight;
        const originalWidth = drawingArea.scrollWidth;
    
        const zoomedHeight = originalHeight * window.currentBibleZoom;
        const zoomedWidth = originalWidth * window.currentBibleZoom;
    
        const totalHeight = zoomedHeight + paddingTop + paddingBottom + 10;
    
        displayText.style.height = `${totalHeight}px`;
        displayText.style.minHeight = `${totalHeight}px`;
    
        drawingArea.style.width = `${originalWidth}px`;
    
        displayText.style.overflowX =
          zoomedWidth > displayText.clientWidth ? "auto" : "hidden";
    
        displayText.style.overflowY = "hidden";
      }
    
      window.updateBibleZoomLayout = updateBibleZoomLayout;

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
    
      // ******************* Load chapter text *********************
      getChapterText(bibleChapterID)
          .then((content) => {
            document.getElementById("bible-text").innerHTML = content;
        
            requestAnimationFrame(() => {
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
              `https://api.scripture.api.bible/v1/bibles/${bibleVersionID}/chapters/${bibleChapterID}`
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
    
      const currentBookId = bibleBookID || chapterParts[0];
      const currentChapterNumber = Number(chapterParts[1]);
    
      const maxChapterStorageKey = `maxchapnum:${bibleVersionID}:${currentBookId}`;
    
      let maxChapterNumber = Number(sessionStorage.getItem(maxChapterStorageKey)) || null;
    
      function buildChapterUrl(newChapterNumber) {
        const url = new URL(window.location.href);

        url.searchParams.delete("version");
        url.searchParams.delete("abbr");
        url.searchParams.delete("name");

        url.searchParams.set("bible", bibleVersionID);

        if (abbreviation) {
          url.searchParams.set("bibleAbbr", abbreviation);
        }

        if (bibleName) {
          url.searchParams.set("bibleName", bibleName);
        }

        url.searchParams.set("book", currentBookId);

        if (bibleBookName) {
          url.searchParams.set("bookName", bibleBookName);
        }

        url.searchParams.set(
          "chapter",
          `${currentBookId}.${newChapterNumber}`
        );

        return `${url.pathname}?${url.searchParams.toString()}`;
      }
    
      function canGoPreviousChapter() {
        return Number.isFinite(currentChapterNumber) && currentChapterNumber > 1;
      }
    
      function canGoNextChapter() {
        return (
          Number.isFinite(currentChapterNumber) &&
          Number.isFinite(maxChapterNumber) &&
          currentChapterNumber < maxChapterNumber
        );
      }
    
      function updateArrowCursorStates() {
        if (imageLeft) {
          imageLeft.style.cursor = canGoPreviousChapter() ? "pointer" : "default";
        }
    
        if (imageRight) {
          imageRight.style.cursor = canGoNextChapter() ? "pointer" : "default";
        }
    
        console.log("Arrow state:", {
          bibleVersionID,
          currentBookId,
          currentChapterNumber,
          maxChapterNumber,
          canGoPrevious: canGoPreviousChapter(),
          canGoNext: canGoNextChapter()
        });
      }
    
      function loadMaxChapterNumberFromApi() {
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.withCredentials = false;
    
          xhr.addEventListener("readystatechange", function () {
            if (this.readyState === this.DONE) {
              try {
                const { data } = JSON.parse(this.responseText);
    
                const numericChapterNumbers = data
                  .map((chapter) => {
                    const chapterIdParts = chapter.id.split(".");
                    return Number(chapterIdParts[chapterIdParts.length - 1]);
                  })
                  .filter((chapterNumber) => Number.isFinite(chapterNumber));
    
                const detectedMaxChapter = numericChapterNumbers.length
                  ? Math.max(...numericChapterNumbers)
                  : null;
    
                resolve(detectedMaxChapter);
              } catch (error) {
                reject(error);
              }
            }
          });
    
          xhr.open(
            "GET",
            `https://api.scripture.api.bible/v1/bibles/${bibleVersionID}/books/${currentBookId}/chapters`
          );
    
          xhr.setRequestHeader("api-key", API_KEY);
          xhr.onerror = () => reject(xhr.statusText);
          xhr.send();
        });
      }
    
      async function initializeChapterArrows() {
        try {
          const detectedMaxChapter = await loadMaxChapterNumberFromApi();
    
          if (detectedMaxChapter) {
            maxChapterNumber = detectedMaxChapter;
            sessionStorage.setItem(maxChapterStorageKey, String(maxChapterNumber));
          }
        } catch (error) {
          console.error("Could not load max chapter number:", error);
        }
    
        updateArrowCursorStates();
      }
    
      if (imageLeft) {
        imageLeft.addEventListener("mouseover", function () {
          if (canGoPreviousChapter()) {
            imageLeft.src = "./img/left_stamp_on.png";
            imageLeft.style.cursor = "pointer";
          } else {
            imageLeft.style.cursor = "default";
          }
        });
    
        imageLeft.addEventListener("mouseout", function () {
          imageLeft.src = "./img/orig_left_stamp.png";
        });
    
        imageLeft.addEventListener("click", function () {
          if (canGoPreviousChapter()) {
            window.location.href = buildChapterUrl(currentChapterNumber - 1);
          } else {
            console.warn("Cannot go previous chapter", {
              currentChapterNumber,
              maxChapterNumber,
              bibleChapterID,
              currentBookId
            });
          }
        });

        let initialTouchX = null;
        let initialTouchY = null;
        
        window.addEventListener("touchstart", function (event) {
          if (
            typeof window.isBibleDrawingActive === "function" &&
            window.isBibleDrawingActive()
          ) {
            initialTouchX = null;
            initialTouchY = null;
            return;
          }

          if (event.touches.length === 1) {
            initialTouchX = event.touches[0].clientX;
            initialTouchY = event.touches[0].clientY;
          }
        }, { passive: true });
        
        window.addEventListener("touchend", function (event) {
          if (
            typeof window.isBibleDrawingActive === "function" &&
            window.isBibleDrawingActive()
          ) {
            initialTouchX = null;
            initialTouchY = null;
            return;
          }

          if (initialTouchX === null || initialTouchY === null) return;
        
          const finalTouchX = event.changedTouches[0].clientX;
          const finalTouchY = event.changedTouches[0].clientY;
        
          const diffX = finalTouchX - initialTouchX;
          const diffY = finalTouchY - initialTouchY;
        
          // ignore vertical swipes
          if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 30) { 
            if (diffX > 0) {
              // swipe right → go previous chapter
              if (canGoPreviousChapter()) {
                window.location.href = buildChapterUrl(currentChapterNumber - 1);
              }
            } else {
              // swipe left → go next chapter
              if (canGoNextChapter()) {
                window.location.href = buildChapterUrl(currentChapterNumber + 1);
              }
            }
          }
        
          // reset
          initialTouchX = null;
          initialTouchY = null;
        });   
      }
    
      if (imageRight) {
        imageRight.addEventListener("mouseover", function () {
          if (canGoNextChapter()) {
            imageRight.src = "./img/right_stamp_on.png";
            imageRight.style.cursor = "pointer";
          } else {
            imageRight.style.cursor = "default";
          }
        });
    
        imageRight.addEventListener("mouseout", function () {
          imageRight.src = "./img/orig_right_stamp.png";
        });
    
        imageRight.addEventListener("click", function () {
          if (canGoNextChapter()) {
            window.location.href = buildChapterUrl(currentChapterNumber + 1);
          } else {
            console.warn("Cannot go next chapter", {
              currentChapterNumber,
              maxChapterNumber,
              bibleChapterID,
              currentBookId
            });
          }
        });
      }
    
      initializeChapterArrows();
