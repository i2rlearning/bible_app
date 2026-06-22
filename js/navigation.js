// navigation.js

export function getNavigationState() {
    const params = new URLSearchParams(window.location.search);

    return {
        bible: params.get("bible") || "",
        book: params.get("book") || "",
        chapter: params.get("chapter") || ""
    };
}

export function buildPageUrl(page, state = {}) {
    const params = new URLSearchParams();

    if (state.bible) {
        params.set("bible", state.bible);
    }

    if (state.book) {
        params.set("book", state.book);
    }

    if (state.chapter) {
        params.set("chapter", state.chapter);
    }

    const queryString = params.toString();

    return queryString
        ? `${page}?${queryString}`
        : page;
}

export function updateCurrentUrl(state, useReplaceState = false) {
    const params = new URLSearchParams();

    if (state.bible) {
        params.set("bible", state.bible);
    }

    if (state.book) {
        params.set("book", state.book);
    }

    if (state.chapter) {
        params.set("chapter", state.chapter);
    }

    const queryString = params.toString();
    const newUrl = queryString
        ? `${window.location.pathname}?${queryString}`
        : window.location.pathname;

    if (useReplaceState) {
        window.history.replaceState(state, "", newUrl);
    } else {
        window.history.pushState(state, "", newUrl);
    }
}

export function configureMenuLinks() {
    const state = getNavigationState();

    const homeLink = document.querySelector("[data-nav='home']");
    const booksLink = document.querySelector("[data-nav='books']");
    const chapterLink = document.querySelector("[data-nav='chapter']");
    const verseLink = document.querySelector("[data-nav='verse']");

    if (homeLink) {
        homeLink.href = buildPageUrl("index.html", {
            bible: state.bible
        });
    }

    if (booksLink) {
        booksLink.href = buildPageUrl("book.html", {
            bible: state.bible
        });
    }

    if (chapterLink) {
        if (state.bible && state.book) {
            chapterLink.href = buildPageUrl("chapter.html", {
                bible: state.bible,
                book: state.book
            });

            chapterLink.classList.remove("disabled-link");
            chapterLink.removeAttribute("aria-disabled");
        } else {
            chapterLink.href = "#";
            chapterLink.classList.add("disabled-link");
            chapterLink.setAttribute("aria-disabled", "true");
        }
    }

    if (verseLink) {
        if (state.bible && state.book && state.chapter) {
            verseLink.href = buildPageUrl("verse.html", state);

            verseLink.classList.remove("disabled-link");
            verseLink.removeAttribute("aria-disabled");
        } else {
            verseLink.href = "#";
            verseLink.classList.add("disabled-link");
            verseLink.setAttribute("aria-disabled", "true");
        }
    }
}
