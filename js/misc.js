"use strict";

/*
 * Landing-page controller.
 *
 * The home page is a discovery page, not a second reading workspace.
 * The shared passage picker opens only from the Open a Passage action.
 */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    initializeLandingNavigation();
    initializeLandingPassagePicker();
    initializeImageSwaps();
  }
);

function getLandingUrlState() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  return {
    bibleId:
      params.get("bible") || "",
    bibleAbbr:
      params.get("bibleAbbr") ||
      params.get("abbr") ||
      "",
    bibleName:
      params.get("bibleName") ||
      "",
    bookId:
      params.get("book") || "",
    bookName:
      params.get("bookName") ||
      params.get("name") ||
      "",
    chapterId:
      params.get("chapter") || ""
  };
}

function initializeLandingPassagePicker() {
  const root =
    document.getElementById(
      "passage-picker"
    );

  if (!root) {
    return;
  }

  if (
    !window.BibleSelector ||
    typeof window.BibleSelector
      .createPassagePicker !== "function"
  ) {
    console.error(
      "The shared Bible passage picker is unavailable."
    );

    return;
  }

  const current =
    getLandingUrlState();

  window.indexPassagePicker =
    window.BibleSelector
      .createPassagePicker({
        root,
        languageController:
          window.BibleLanguage,
        current
      });
}

function initializeLandingNavigation() {
  const state =
    getLandingUrlState();

  const homeLink =
    document.getElementById(
      "homeMenuLink"
    );

  const booksLink =
    document.getElementById(
      "booksMenuLink"
    );

  const chapterLink =
    document.getElementById(
      "chapterMenuLink"
    );

  const searchLink =
    document.getElementById(
      "searchMenuLink"
    );

  const searchAction =
    document.getElementById(
      "landing-search-action"
    );

  if (homeLink) {
    homeLink.href =
      "./index.html";
  }

  if (searchLink) {
    searchLink.href =
      buildPageUrl(
        "./search.html",
        state
      );
  }

  if (searchAction) {
    searchAction.href =
      buildPageUrl(
        "./search.html",
        state
      );
  }

  if (state.bibleId) {
    enableLink(
      booksLink,
      buildPageUrl(
        "./book.html",
        state
      )
    );
  } else {
    disableLink(booksLink);
  }

  if (
    state.bibleId &&
    state.bookId
  ) {
    enableLink(
      chapterLink,
      buildPageUrl(
        "./chapter.html",
        state
      )
    );
  } else {
    disableLink(chapterLink);
  }

  document.addEventListener(
    "click",
    (event) => {
      const disabledLink =
        event.target.closest(
          "a.disabled"
        );

      if (!disabledLink) {
        return;
      }

      event.preventDefault();
    }
  );
}

function buildPageUrl(
  page,
  state = {}
) {
  const params =
    new URLSearchParams();

  if (state.bibleId) {
    params.set(
      "bible",
      state.bibleId
    );
  }

  if (state.bibleAbbr) {
    params.set(
      "bibleAbbr",
      state.bibleAbbr
    );
  }

  if (state.bibleName) {
    params.set(
      "bibleName",
      state.bibleName
    );
  }

  if (state.bookId) {
    params.set(
      "book",
      state.bookId
    );
  }

  if (state.bookName) {
    params.set(
      "bookName",
      state.bookName
    );
  }

  if (state.chapterId) {
    params.set(
      "chapter",
      state.chapterId
    );
  }

  const query =
    params.toString();

  return query
    ? `${page}?${query}`
    : page;
}

function disableLink(link) {
  if (!link) {
    return;
  }

  link.href = "#";
  link.classList.add(
    "disabled"
  );

  link.setAttribute(
    "aria-disabled",
    "true"
  );

  link.setAttribute(
    "tabindex",
    "-1"
  );
}

function enableLink(
  link,
  href
) {
  if (!link) {
    return;
  }

  link.href = href;

  link.classList.remove(
    "disabled"
  );

  link.removeAttribute(
    "aria-disabled"
  );

  link.removeAttribute(
    "tabindex"
  );
}

function initializeImageSwaps() {
  const images =
    document.querySelectorAll(
      ".image-swap"
    );

  images.forEach(
    (image) => {
      const originalSource =
        image.getAttribute(
          "src"
        );

      const hoverSource =
        image.getAttribute(
          "data-hover"
        );

      if (!hoverSource) {
        return;
      }

      image.addEventListener(
        "mouseenter",
        () => {
          image.setAttribute(
            "src",
            hoverSource
          );
        }
      );

      image.addEventListener(
        "mouseleave",
        () => {
          image.setAttribute(
            "src",
            originalSource
          );
        }
      );
    }
  );
}
/*
 * misc.js
 *
 * Responsibilities on index.html:
 *
 * 1. Load Bible versions from API.Bible.
 * 2. Sort Bible versions by language.
 * 3. Display the available Bible versions.
 * 4. Send the selected Bible to book.html using URL parameters.
 * 5. Cache display labels in localStorage for backward compatibility.
 * 6. Handle image hover swapping.
 */

document.addEventListener("DOMContentLoaded", () => {
  initializeBibleVersionList();
  initializeImageSwaps();
});


/*
 * Load and display Bible versions.
 */

async function initializeBibleVersionList() {
  const versionList = document.querySelector(
    "#bible-version-list"
  );

  /*
   * misc.js is also loaded on other pages.
   *
   * If the current page does not contain the Bible version list,
   * stop here without causing an error.
   */

  if (!versionList) {
    return;
  }

  const defaultApiUrl =
    "https://api.scripture.api.bible/v1/bibles?include-full-details=false";

  const selectedApiUrl =
    localStorage.getItem("selectedBibleApi") ||
    document.querySelector("#optVal")?.value ||
    defaultApiUrl;

  versionList.innerHTML =
    '<p class="bible-list-status">Loading Bible versions...</p>';

  try {
    const bibleVersions =
      await getBibleVersions(selectedApiUrl);

    const sortedVersions =
      sortVersionsByLanguage(bibleVersions);

    renderBibleVersions(
      versionList,
      sortedVersions
    );
  } catch (error) {
    console.error(
      "Unable to load Bible versions:",
      error
    );

    versionList.innerHTML = "";

    const errorMessage =
      document.createElement("p");

    errorMessage.className =
      "bible-list-status bible-list-error";

    errorMessage.textContent =
      "Unable to load Bible versions. Please try again.";

    versionList.appendChild(errorMessage);
  }
}


/*
 * Request Bible versions from API.Bible.
 */

function getBibleVersions(apiUrl) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.withCredentials = false;

    xhr.addEventListener(
      "readystatechange",
      function () {
        if (this.readyState !== XMLHttpRequest.DONE) {
          return;
        }

        if (this.status < 200 || this.status >= 300) {
          reject(
            new Error(
              `Bible API request failed with status ${this.status}.`
            )
          );

          return;
        }

        try {
          const response =
            JSON.parse(this.responseText);

          if (!Array.isArray(response.data)) {
            reject(
              new Error(
                "Bible API returned an unexpected response."
              )
            );

            return;
          }

          const versions =
            response.data.map((bible) => {
              return {
                id: bible.id || "",
                name:
                  bible.name ||
                  bible.nameLocal ||
                  bible.abbreviation ||
                  "Unknown Bible",

                abbreviation:
                  bible.abbreviation ||
                  bible.abbreviationLocal ||
                  bible.name ||
                  "",

                description:
                  bible.description ||
                  bible.descriptionLocal ||
                  "",

                language:
                  bible.language?.name ||
                  bible.language?.nameLocal ||
                  bible.language?.id ||
                  "Other"
              };
            });

          resolve(versions);
        } catch (error) {
          reject(
            new Error(
              `Unable to read Bible API response: ${error.message}`
            )
          );
        }
      }
    );

    xhr.addEventListener("error", () => {
      reject(
        new Error(
          "A network error occurred while loading Bible versions."
        )
      );
    });

    xhr.addEventListener("timeout", () => {
      reject(
        new Error(
          "The Bible API request timed out."
        )
      );
    });

    xhr.open("GET", apiUrl);

    xhr.setRequestHeader(
      "api-key",
      API_KEY
    );

    xhr.timeout = 20000;

    xhr.send();
  });
}


/*
 * Display Bible versions grouped by language.
 */

function renderBibleVersions(
  versionList,
  sortedVersions
) {
  versionList.innerHTML = "";

  const languageGroups =
    Object.keys(sortedVersions);

  if (languageGroups.length === 0) {
    const emptyMessage =
      document.createElement("p");

    emptyMessage.className =
      "bible-list-status";

    emptyMessage.textContent =
      "No Bible versions were found.";

    versionList.appendChild(emptyMessage);

    return;
  }

  for (const language of languageGroups) {
    const heading =
      document.createElement("h4");

    heading.className =
      "list-heading";

    const headingText =
      document.createElement("span");

    headingText.textContent =
      language;

    heading.appendChild(headingText);

    const list =
      document.createElement("ul");

    const versions =
      sortedVersions[language];

    for (const version of versions) {
      const listItem =
        createBibleVersionItem(version);

      list.appendChild(listItem);
    }

    versionList.appendChild(heading);
    versionList.appendChild(list);
  }
}


/*
 * Create one Bible version item.
 */

function createBibleVersionItem(version) {
  const listItem =
    document.createElement("li");

  const link =
    document.createElement("a");

  const paragraph =
    document.createElement("p");

  const name =
    document.createElement("span");

  const strongName =
  document.createElement("strong");

  name.className =
    "bible-version-name";
  
  strongName.textContent =
    version.name;
  
  name.appendChild(strongName);
  paragraph.appendChild(name);
  
  /*
   * The browser's native title tooltip displays the
   * Bible's full name when hovering over the link.
   */

  link.title =
    version.name;

  /*
   * Give the link a real destination.
   *
   * This allows:
   * - Opening in a new tab
   * - Copying the link
   * - Browser navigation
   * - JavaScript-disabled fallback
   */

  link.href =
    buildBookPageUrl(version);

  if (version.description) {
    const description =
      document.createElement("span");

    const descriptionLabel =
      document.createElement("strong");

    description.className =
      "bible-version-desc";

    description.appendChild(
      document.createElement("br")
    );

    descriptionLabel.textContent =
      "Description:";

    description.appendChild(
      descriptionLabel
    );

    description.appendChild(
      document.createTextNode(
        ` ${version.description}`
      )
    );

    paragraph.appendChild(description);
  }

  link.appendChild(paragraph);

  link.addEventListener(
    "click",
    (event) => {
      /*
       * Allow normal browser behavior when the user:
       * - Ctrl-clicks
       * - Command-clicks
       * - Shift-clicks
       * - Uses the middle mouse button
       */

      if (
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        cacheSelectedBible(version);
        return;
      }

      event.preventDefault();

      selectBible(version);
    }
  );

  listItem.appendChild(link);

  return listItem;
}


/*
 * Build the URL for book.html.
 *
 * bible:
 * The API.Bible Bible ID. This is required for API requests.
 *
 * bibleAbbr:
 * The short visible abbreviation, such as WMB.
 *
 * bibleName:
 * The complete Bible name used for hover text.
 *
 * book and chapter are not included because they are not
 * known yet on index.html.
 */

function buildBookPageUrl(version) {
  const params =
    new URLSearchParams();

  params.set(
    "bible",
    version.id
  );

  if (version.abbreviation) {
    params.set(
      "bibleAbbr",
      version.abbreviation
    );
  }

  if (version.name) {
    params.set(
      "bibleName",
      version.name
    );
  }

  return `./book.html?${params.toString()}`;
}


/*
 * Handle Bible selection.
 */

function selectBible(version) {
  if (!version?.id) {
    console.error(
      "Unable to select Bible because its API ID is missing."
    );

    return;
  }

  cacheSelectedBible(version);

  /*
   * Use the shared navigation helper from index.html when
   * it is available.
   */

  if (
    window.BibleNavigation &&
    typeof window.BibleNavigation.selectBible ===
      "function"
  ) {
    window.BibleNavigation.selectBible({
      id: version.id,
      abbreviation:
        version.abbreviation,
      name:
        version.name
    });

    return;
  }

  /*
   * Fallback in case BibleNavigation has not been loaded.
   */

  window.location.assign(
    buildBookPageUrl(version)
  );
}


/*
 * Keep labels in localStorage as a display cache.
 *
 * The Bible ID in the URL remains the navigation source
 * of truth.
 */

function cacheSelectedBible(version) {
  localStorage.setItem(
    "selectedBibleId",
    version.id
  );

  localStorage.setItem(
    "selectedBibleAbbreviation",
    version.abbreviation || ""
  );

  localStorage.setItem(
    "selectedBibleAbbr",
    version.abbreviation || ""
  );

  localStorage.setItem(
    "selectedBibleName",
    version.name || ""
  );
}


/*
 * Sort Bible versions by language and abbreviation.
 */

function sortVersionsByLanguage(
  bibleVersionList
) {
  const sortedVersions = {};

  for (const version of bibleVersionList) {
    const language =
      version.language || "Other";

    if (!sortedVersions[language]) {
      sortedVersions[language] = [];
    }

    sortedVersions[language].push(version);
  }

  for (const language in sortedVersions) {
    sortedVersions[language].sort(
      (a, b) => {
        const abbreviationA =
          (
            a.abbreviation ||
            a.name ||
            ""
          ).toLocaleUpperCase();

        const abbreviationB =
          (
            b.abbreviation ||
            b.name ||
            ""
          ).toLocaleUpperCase();

        return abbreviationA.localeCompare(
          abbreviationB
        );
      }
    );
  }

  return sortedVersions;
}


/*
 * Swap images on hover.
 */

function initializeImageSwaps() {
  const images =
    document.querySelectorAll(
      ".image-swap"
    );

  images.forEach((image) => {
    const originalSource =
      image.getAttribute("src");

    const hoverSource =
      image.getAttribute("data-hover");

    if (!hoverSource) {
      return;
    }

    image.addEventListener(
      "mouseenter",
      () => {
        image.setAttribute(
          "src",
          hoverSource
        );
      }
    );

    image.addEventListener(
      "mouseleave",
      () => {
        image.setAttribute(
          "src",
          originalSource
        );
      }
    );
  });
}
