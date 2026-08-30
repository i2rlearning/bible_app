"use strict";

/*
 * Shared page bootstrap for the Bible passage picker.
 *
 * BibleSelector owns the picker itself. This file:
 * - initializes #passage-picker,
 * - supplies URL or preferred-Bible state,
 * - connects page controls marked with data-open-passage,
 * - closes open navigation/tool menus before an external trigger opens it,
 * - keeps the picker in sync when Bible preferences change.
 *
 * Used by index.html, verse.html, and study-desk.html.
 */
(function () {
  const ROOT_ID = "passage-picker";
  const INITIALIZED_ATTRIBUTE = "data-passage-picker-initialized";
  const TRIGGER_BOUND_ATTRIBUTE = "data-passage-picker-bound";

  function readUrlState() {
    const params = new URLSearchParams(window.location.search);

    return {
      bibleId: params.get("bible") || params.get("version") || "",
      bibleAbbr: params.get("bibleAbbr") || params.get("abbr") || "",
      bibleName: params.get("bibleName") || "",
      bookId: params.get("book") || "",
      bookName: params.get("bookName") || params.get("name") || "",
      chapterId: params.get("chapter") || ""
    };
  }

  function hasPassageState(state) {
    return Boolean(
      state?.bibleId ||
      state?.bookId ||
      state?.chapterId
    );
  }

  function getInitialState() {
    const urlState = readUrlState();

    if (hasPassageState(urlState)) {
      return urlState;
    }

    return window.UserPreferences?.getPreferredBibleState?.() || urlState;
  }

  function closeTransientUi() {
    window.closeNav?.();
    window.closeMobileToolbarMenus?.();
  }

  function openFromExternalTrigger(picker) {
    closeTransientUi();

    window.setTimeout(() => {
      picker?.setOpen?.(true);
    }, 0);
  }

  function bindExternalTriggers(picker) {
    document.querySelectorAll("[data-open-passage]").forEach((trigger) => {
      if (trigger.getAttribute(TRIGGER_BOUND_ATTRIBUTE) === "true") {
        return;
      }

      trigger.setAttribute(TRIGGER_BOUND_ATTRIBUTE, "true");

      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openFromExternalTrigger(picker);
      });
    });
  }

  function initializePassagePicker() {
    const root = document.getElementById(ROOT_ID);

    if (!root) {
      return null;
    }

    if (root.getAttribute(INITIALIZED_ATTRIBUTE) === "true") {
      return window.PagePassagePicker || null;
    }

    if (!window.BibleSelector?.createPassagePicker) {
      console.error(
        "Unable to initialize passage picker: BibleSelector.createPassagePicker is unavailable."
      );
      return null;
    }

    try {
      const picker = window.BibleSelector.createPassagePicker({
        root,
        languageController: window.BibleLanguage,
        current: getInitialState(),
        openButtonLabel: root.dataset.passagePickerOpenLabel || "Open"
      });

      root.setAttribute(INITIALIZED_ATTRIBUTE, "true");
      window.PagePassagePicker = picker;
      bindExternalTriggers(picker);

      return picker;
    } catch (error) {
      console.error("Unable to initialize passage picker:", error);
      return null;
    }
  }

  window.PassagePicker = {
    getInstance() {
      return window.PagePassagePicker || null;
    },

    open() {
      openFromExternalTrigger(window.PagePassagePicker);
    },

    initialize: initializePassagePicker
  };

  window.addEventListener("bible-preferences-changed", (event) => {
    const picker = window.PagePassagePicker;

    if (!picker?.applyPreferences) {
      return;
    }

    picker.applyPreferences(event.detail || {}).catch((error) => {
      console.error("Unable to refresh passage picker from preferences:", error);
    });
  });

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializePassagePicker,
      { once: true }
    );
  } else {
    initializePassagePicker();
  }
})();
