"use strict";

/*
 * Landing-page controller.
 *
 * The home page is a discovery page, not a second reading workspace.
 * The shared passage picker opens only from the Open a Passage action.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const redirected = await window.UserPreferences?.redirectFromIndexIfNeeded?.();

  if (redirected) {
    return;
  }

  initializeLandingNavigation();
  initializeLandingPassagePicker();
  initializePreferenceSync();
  initializeImageSwaps();
});

function getLandingUrlState() {
  const params = new URLSearchParams(window.location.search);
  const urlState = {
    bibleId: params.get("bible") || "",
    bibleAbbr: params.get("bibleAbbr") || params.get("abbr") || "",
    bibleName: params.get("bibleName") || "",
    bookId: params.get("book") || "",
    bookName: params.get("bookName") || params.get("name") || "",
    chapterId: params.get("chapter") || ""
  };

  if (urlState.bibleId) {
    return urlState;
  }

  return window.UserPreferences?.getPreferredBibleState?.() || urlState;
}

function initializeLandingPassagePicker() {
  const root = document.getElementById("passage-picker");

  if (!root) {
    return;
  }

  if (!window.BibleSelector?.createPassagePicker) {
    console.error("The shared Bible passage picker is unavailable.");
    return;
  }

  window.indexPassagePicker = window.BibleSelector.createPassagePicker({
    root,
    languageController: window.BibleLanguage,
    current: getLandingUrlState()
  });
}

function initializePreferenceSync() {
  window.addEventListener("bible-preferences-changed", async (event) => {
    const picker = window.indexPassagePicker;

    if (!picker?.applyPreferences) {
      return;
    }

    try {
      await picker.applyPreferences(event.detail || {});
    } catch (error) {
      console.error("Unable to refresh the passage picker from preferences:", error);
    }
  });
}

function initializeLandingNavigation() {
  const state = getLandingUrlState();
  const homeLink = document.getElementById("homeMenuLink");
  const booksLink = document.getElementById("booksMenuLink");
  const chapterLink = document.getElementById("chapterMenuLink");
  const searchLink = document.getElementById("searchMenuLink");
  const searchAction = document.getElementById("landing-search-action");

  if (homeLink) {
    homeLink.href = "./index.html?stay=home";
  }

  if (searchLink) {
    searchLink.href = buildPageUrl("./search.html", state);
  }

  if (searchAction) {
    searchAction.href = buildPageUrl("./search.html", state);
  }

  if (state.bibleId) {
    enableLink(booksLink, buildPageUrl("./book.html", state));
  } else {
    disableLink(booksLink);
  }

  if (state.bibleId && state.bookId) {
    enableLink(chapterLink, buildPageUrl("./chapter.html", state));
  } else {
    disableLink(chapterLink);
  }

  document.addEventListener("click", (event) => {
    const disabledLink = event.target.closest("a.disabled");

    if (disabledLink) {
      event.preventDefault();
    }
  });
}

function buildPageUrl(page, state = {}) {
  const params = new URLSearchParams();

  if (state.bibleId) params.set("bible", state.bibleId);
  if (state.bibleAbbr) params.set("bibleAbbr", state.bibleAbbr);
  if (state.bibleName) params.set("bibleName", state.bibleName);
  if (state.bookId) params.set("book", state.bookId);
  if (state.bookName) params.set("bookName", state.bookName);
  if (state.chapterId) params.set("chapter", state.chapterId);

  const query = params.toString();
  return query ? `${page}?${query}` : page;
}

function disableLink(link) {
  if (!link) return;

  link.href = "#";
  link.classList.add("disabled");
  link.setAttribute("aria-disabled", "true");
  link.setAttribute("tabindex", "-1");
}

function enableLink(link, href) {
  if (!link) return;

  link.href = href;
  link.classList.remove("disabled");
  link.removeAttribute("aria-disabled");
  link.removeAttribute("tabindex");
}

function initializeImageSwaps() {
  document.querySelectorAll(".image-swap").forEach((image) => {
    const originalSource = image.getAttribute("src");
    const hoverSource = image.getAttribute("data-hover");

    if (!hoverSource) return;

    image.addEventListener("mouseenter", () => image.setAttribute("src", hoverSource));
    image.addEventListener("mouseleave", () => image.setAttribute("src", originalSource));
  });
}
