"use strict";

/*
 * Verse of the Day controller.
 *
 * Responsibilities:
 * - choose one stable Scripture reference for the user's local calendar date
 * - load the wording from the preferred Bible
 * - show the modal on index.html
 * - copy the verse
 * - open the complete chapter in verse.html
 *
 * Holiday support is intentionally data-driven. The holiday lists are empty
 * until passages are reviewed and approved. Later additions can include:
 * - Christian observances
 * - biblical appointed times
 * - later Jewish observances
 * - overlapping-holiday overrides
 * - alternate-source passages such as books unavailable in some Bibles
 *
 * The resolver already supports primary and fallback references, so adding
 * alternate-source behavior later will not require rewriting the modal.
 */

window.VerseOfDay = (() => {
  const API_BASE_URL = "https://api.scripture.api.bible/v1";

  /*
   * Holiday definitions will be added gradually after review.
   *
   * Expected shape:
   * {
   *   key: "example-holiday",
   *   labels: ["Example Holiday"],
   *   category: "christian" | "biblical-appointed-time" | "later-jewish",
   *   primaryPassage: {
   *     verseId: "JHN.3.16",
   *     chapterId: "JHN.3"
   *   },
   *   fallbackPassages: [
   *     { verseId: "PSA.23.1", chapterId: "PSA.23" }
   *   ],
   *   alternateSources: []
   * }
   */
  const CHRISTIAN_HOLIDAYS = [];
  const BIBLICAL_APPOINTED_TIMES = [];
  const LATER_JEWISH_OBSERVANCES = [];

  /*
   * Smaller fixed-date and civic/cultural observances.
   *
   * Supported date rules:
   * - fixed-date: one Gregorian month and day
   * - nth-weekday: e.g. the first Thursday in May
   *
   * More rules can be added later without changing the modal or API logic.
   */
  const SPECIAL_OBSERVANCES = [
    {
      key: "valentines-day",
      labels: ["Valentine’s Day"],
      category: "special-observance",
      priority: 40,
      dateRule: {
        type: "fixed-date",
        month: 2,
        day: 14
      },
      references: ["1CO.13.13", "SNG.8.7"]
    },
    {
      key: "saint-patricks-day",
      labels: ["St. Patrick’s Day"],
      category: "special-observance",
      priority: 40,
      dateRule: {
        type: "fixed-date",
        month: 3,
        day: 17
      },
      references: ["ACT.1.8", "ISA.52.7"]
    },
    {
      key: "independence-day",
      labels: ["Independence Day"],
      category: "special-observance",
      priority: 40,
      dateRule: {
        type: "fixed-date",
        month: 7,
        day: 4
      },
      references: ["GAL.5.1", "PSA.33.12"]
    },
    {
      key: "national-day-of-prayer",
      labels: ["National Day of Prayer"],
      category: "special-observance",
      priority: 45,
      dateRule: {
        type: "nth-weekday",
        month: 5,
        weekday: 4,
        occurrence: 1
      },
      references: ["2CH.7.14", "PSA.5.3"]
    }
  ];

  /*
   * Optional overrides for dates where two or more observances overlap.
   *
   * Example:
   * {
   *   key: "christmas-hanukkah",
   *   keys: ["christmas-day", "hanukkah"],
   *   labels: ["Christmas Day", "Hanukkah"],
   *   category: "collision-override",
   *   priority: 1000,
   *   references: ["JHN.1.5", "ISA.9.2"],
   *   alternateSources: []
   * }
   */
  const HOLIDAY_COLLISION_OVERRIDES = [];

  /*
   * Ordinary daily rotation.
   *
   * A primary reference may include a fallback for Bibles that do not contain
   * the requested book. This matters, for example, when an Old Testament-only
   * Bible is selected and the primary daily reference is from the New Testament.
   */
  const DAILY_PASSAGES = [
    { primary: "PSA.23.1", fallbacks: ["ISA.40.31"] },
    { primary: "JHN.3.16", fallbacks: ["GEN.22.14"] },
    { primary: "ISA.41.10", fallbacks: ["PSA.46.1"] },
    { primary: "PHP.4.6", fallbacks: ["PSA.55.22"] },
    { primary: "ROM.8.28", fallbacks: ["GEN.50.20"] },
    { primary: "PRO.3.5", fallbacks: ["PSA.37.5"] },
    { primary: "MAT.11.28", fallbacks: ["ISA.40.29"] },
    { primary: "PSA.119.105", fallbacks: ["PRO.6.23"] },
    { primary: "JOS.1.9", fallbacks: ["DEU.31.8"] },
    { primary: "1CO.13.13", fallbacks: ["MIC.6.8"] },
    { primary: "ISA.40.31", fallbacks: ["PSA.27.14"] },
    { primary: "JHN.14.6", fallbacks: ["ISA.35.8"] },
    { primary: "PSA.46.1", fallbacks: ["NAH.1.7"] },
    { primary: "GAL.5.22", fallbacks: ["PSA.1.3"] },
    { primary: "HEB.11.1", fallbacks: ["HAB.2.4"] },
    { primary: "PSA.34.8", fallbacks: ["JER.17.7"] },
    { primary: "EPH.2.10", fallbacks: ["ISA.43.7"] },
    { primary: "LAM.3.22", fallbacks: ["PSA.103.8"] },
    { primary: "JHN.8.12", fallbacks: ["ISA.60.1"] },
    { primary: "PSA.121.2", fallbacks: ["PSA.124.8"] },
    { primary: "COL.3.15", fallbacks: ["ISA.26.3"] },
    { primary: "MIC.6.8", fallbacks: ["DEU.10.12"] },
    { primary: "1PE.5.7", fallbacks: ["PSA.55.22"] },
    { primary: "NUM.6.24", fallbacks: ["PSA.67.1"] },
    { primary: "REV.21.4", fallbacks: ["ISA.25.8"] },
    { primary: "PSA.19.14", fallbacks: ["PSA.51.10"] },
    { primary: "MAT.5.16", fallbacks: ["ISA.58.8"] },
    { primary: "ISA.43.2", fallbacks: ["PSA.66.12"] },
    { primary: "PHP.4.13", fallbacks: ["HAB.3.19"] },
    { primary: "PSA.118.24", fallbacks: ["ECC.3.12"] },
    { primary: "JER.29.11", fallbacks: ["DEU.30.9"] }
  ];

  const state = {
    loaded: false,
    loading: false,
    holidayLabels: [],
    bible: null,
    verse: null,
    openChapterUrl: ""
  };

  function getApiKey() {
    if (typeof API_KEY === "undefined" || !API_KEY) {
      throw new Error("The API.Bible key is unavailable.");
    }

    return API_KEY;
  }

  async function requestJson(url) {
    const response = await fetch(url, {
      headers: {
        "api-key": getApiKey()
      }
    });

    if (!response.ok) {
      throw new Error(`API.Bible request failed with status ${response.status}.`);
    }

    const result = await response.json();

    if (
      result?.meta?.fumsId &&
      window._BAPI &&
      typeof window._BAPI.t === "function"
    ) {
      try {
        window._BAPI.t(result.meta.fumsId);
      } catch (error) {
        console.warn("FUMS tracking failed:", error);
      }
    }

    return result;
  }

  function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function hashDateKey(value) {
    let hash = 0;

    for (let index = 0; index < value.length; index += 1) {
      hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }

    return Math.abs(hash);
  }

  function getOrdinaryDailyDefinition(date = new Date()) {
    const index = hashDateKey(getLocalDateKey(date)) % DAILY_PASSAGES.length;
    const item = DAILY_PASSAGES[index];

    return {
      labels: [],
      category: "ordinary",
      references: [item.primary, ...(item.fallbacks || [])],
      alternateSources: []
    };
  }

  function getEffectiveDate(date = new Date()) {
    const debugDate = new URLSearchParams(window.location.search).get("votdDate");

    if (/^\d{4}-\d{2}-\d{2}$/.test(debugDate || "")) {
      const [year, month, day] = debugDate.split("-").map(Number);
      const candidate = new Date(year, month - 1, day, 12, 0, 0);

      if (
        candidate.getFullYear() === year &&
        candidate.getMonth() === month - 1 &&
        candidate.getDate() === day
      ) {
        return candidate;
      }
    }

    return date;
  }

  function getNthWeekdayOfMonth(date) {
    return Math.floor((date.getDate() - 1) / 7) + 1;
  }

  function matchesDateRule(date, rule) {
    if (!rule || !rule.type) {
      return false;
    }

    if (rule.type === "fixed-date") {
      return (
        date.getMonth() + 1 === rule.month &&
        date.getDate() === rule.day
      );
    }

    if (rule.type === "nth-weekday") {
      return (
        date.getMonth() + 1 === rule.month &&
        date.getDay() === rule.weekday &&
        getNthWeekdayOfMonth(date) === rule.occurrence
      );
    }

    return false;
  }

  function normalizeObservance(observance) {
    return {
      key: observance.key,
      labels: observance.labels || [],
      category: observance.category || "special-observance",
      priority: Number(observance.priority || 0),
      references: observance.references || [],
      alternateSources: observance.alternateSources || []
    };
  }

  function normalizeCollisionOverride(override) {
    return {
      key: override.key || "",
      keys: Array.isArray(override.keys) ? override.keys : [],
      labels: Array.isArray(override.labels) ? override.labels : [],
      category: override.category || "collision-override",
      priority: Number(override.priority || 0),
      references: Array.isArray(override.references)
        ? override.references
        : [],
      alternateSources: Array.isArray(override.alternateSources)
        ? override.alternateSources
        : []
    };
  }

  function findCollisionOverride(matchedKeys) {
    const keySet = new Set(matchedKeys);

    return HOLIDAY_COLLISION_OVERRIDES
      .map(normalizeCollisionOverride)
      .filter((override) => (
        override.keys.length >= 2 &&
        override.keys.every((key) => keySet.has(key))
      ))
      .sort((a, b) => (
        b.keys.length - a.keys.length ||
        b.priority - a.priority
      ))[0] || null;
  }

  /*
   * Holiday and observance selection engine.
   *
   * Every observance group participates in the same resolver. All matching
   * labels are preserved. An exact collision override supplies the verse when
   * one exists; otherwise the highest-priority observance supplies the verse.
   */
  function getHolidayDefinition(date = new Date()) {
    const allObservances = [
      ...CHRISTIAN_HOLIDAYS,
      ...BIBLICAL_APPOINTED_TIMES,
      ...LATER_JEWISH_OBSERVANCES,
      ...SPECIAL_OBSERVANCES
    ];

    const matches = allObservances
      .filter((observance) => matchesDateRule(date, observance.dateRule))
      .map(normalizeObservance)
      .sort((a, b) => b.priority - a.priority);

    if (!matches.length) {
      return null;
    }

    const matchedKeys = matches.map((item) => item.key);
    const collisionOverride = findCollisionOverride(matchedKeys);
    const primary = collisionOverride || matches[0];
    const observedLabels = matches.flatMap((item) => item.labels);
    const labels = [...new Set([
      ...(collisionOverride?.labels || []),
      ...observedLabels
    ])];

    return {
      labels,
      category: primary.category,
      references: primary.references,
      alternateSources: primary.alternateSources,
      matchedObservances: matchedKeys,
      collisionOverride: collisionOverride?.key || null
    };
  }

  function getTodayDefinition(date = new Date()) {
    const effectiveDate = getEffectiveDate(date);

    return (
      getHolidayDefinition(effectiveDate) ||
      getOrdinaryDailyDefinition(effectiveDate)
    );
  }

  async function resolveBible() {
    const preferences = window.UserPreferences?.getAll?.() ||
      window.UserPreferences?.read?.() ||
      null;

    const saved = preferences || {};
    const preferredState =
      window.UserPreferences?.getPreferredBibleState?.() || {};

    if (preferredState.bibleId) {
      return {
        id: preferredState.bibleId,
        abbreviation:
          preferredState.bibleAbbr ||
          saved.bibleAbbr ||
          preferredState.bibleName ||
          "",
        name:
          preferredState.bibleName ||
          saved.bibleName ||
          preferredState.bibleAbbr ||
          ""
      };
    }

    const language =
      window.UserPreferences?.getPreferredLanguage?.() ||
      window.BibleSelector?.getSavedLanguage?.() ||
      window.BibleSelector?.languageOptions?.[0];

    const bibles = await window.BibleSelector.loadBibles(language?.apiUrl);
    const firstBible = bibles[0];

    if (!firstBible) {
      throw new Error("No Bible is available for the selected language.");
    }

    return firstBible;
  }

  function htmlToPlainText(html) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html || "";

    wrapper.querySelectorAll(".v, .verse-number, sup").forEach((item) => {
      item.remove();
    });

    return wrapper.textContent
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .trim();
  }

  async function loadVerse(bibleId, verseId) {
    const query = new URLSearchParams({
      "content-type": "html",
      "include-notes": "false",
      "include-titles": "false",
      "include-chapter-numbers": "false",
      "include-verse-numbers": "false",
      "include-verse-spans": "false"
    });

    const result = await requestJson(
      `${API_BASE_URL}/bibles/${encodeURIComponent(
        bibleId
      )}/verses/${encodeURIComponent(verseId)}?${query.toString()}`
    );

    if (!result?.data) {
      throw new Error("The selected verse could not be loaded.");
    }

    return {
      ...result.data,
      plainText: htmlToPlainText(result.data.content)
    };
  }

  async function resolveVerseForBible(bible, definition) {
    const references = Array.isArray(definition.references)
      ? definition.references
      : [];

    let lastError = null;

    for (const verseId of references) {
      try {
        const verse = await loadVerse(bible.id, verseId);

        if (verse.plainText) {
          return verse;
        }
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error(
      "None of today’s verse choices are available in the preferred Bible."
    );
  }

  function buildOpenChapterUrl(bible, verse) {
    const book = {
      id: verse.bookId,
      name:
        String(verse.reference || "")
          .replace(/\s+\d+.*$/, "")
          .trim() ||
        verse.bookId
    };

    return window.BibleSelector.buildVerseUrl({
      bible,
      book,
      chapterId: verse.chapterId
    });
  }

  function getElements() {
    return {
      action: document.getElementById("verse-of-day-action"),
      modal: document.getElementById("verse-of-day-modal"),
      close: document.getElementById("verse-of-day-close"),
      cancel: document.getElementById("verse-of-day-cancel"),
      holiday: document.getElementById("verse-of-day-holiday"),
      status: document.getElementById("verse-of-day-status"),
      content: document.getElementById("verse-of-day-content"),
      reference: document.getElementById("verse-of-day-reference"),
      text: document.getElementById("verse-of-day-text"),
      version: document.getElementById("verse-of-day-version"),
      copy: document.getElementById("verse-of-day-copy"),
      openChapter: document.getElementById("verse-of-day-open-chapter")
    };
  }

  function setModalOpen(isOpen) {
    const elements = getElements();

    if (!elements.modal) {
      return;
    }

    elements.modal.style.display = isOpen ? "flex" : "none";
    elements.modal.classList.toggle("is-open", isOpen);
    elements.modal.setAttribute("aria-hidden", String(!isOpen));
    document.body.classList.toggle("verse-of-day-is-open", isOpen);

    if (isOpen) {
      elements.close?.focus();
    }
  }

  function renderLoading() {
    const elements = getElements();

    elements.status.hidden = false;
    elements.status.textContent = "Loading today’s verse...";
    elements.status.classList.remove("is-error");
    elements.content.hidden = true;
    elements.copy.disabled = true;
    elements.openChapter.disabled = true;
    elements.holiday.hidden = true;
  }

  function renderError(message) {
    const elements = getElements();

    elements.status.hidden = false;
    elements.status.textContent = message;
    elements.status.classList.add("is-error");
    elements.content.hidden = true;
    elements.copy.disabled = true;
    elements.openChapter.disabled = true;
    elements.holiday.hidden = true;
  }

  function renderVerse() {
    const elements = getElements();

    elements.status.hidden = true;
    elements.content.hidden = false;
    elements.reference.textContent = state.verse.reference || "";
    elements.text.textContent = state.verse.plainText || "";
    elements.version.textContent =
      state.bible.name ||
      state.bible.abbreviation ||
      "";

    if (state.holidayLabels.length) {
      elements.holiday.textContent = state.holidayLabels.join(" • ");
      elements.holiday.hidden = false;
    } else {
      elements.holiday.hidden = true;
    }

    elements.copy.disabled = false;
    elements.openChapter.disabled = !state.openChapterUrl;
  }

  async function ensureLoaded() {
    if (state.loaded || state.loading) {
      return;
    }

    state.loading = true;
    renderLoading();

    try {
      const definition = getTodayDefinition();
      const bible = await resolveBible();
      const verse = await resolveVerseForBible(bible, definition);

      state.holidayLabels = definition.labels || [];
      state.bible = bible;
      state.verse = verse;
      state.openChapterUrl = buildOpenChapterUrl(bible, verse);
      state.loaded = true;

      renderVerse();
    } catch (error) {
      console.error("Verse of the Day failed:", error);
      renderError(
        "Today’s verse could not be loaded. Please try again in a moment."
      );
    } finally {
      state.loading = false;
    }
  }

  async function openModal() {
    setModalOpen(true);

    if (state.loaded) {
      renderVerse();
      return;
    }

    await ensureLoaded();
  }

  async function copyVerse() {
    if (!state.verse?.plainText) {
      return;
    }

    const elements = getElements();
    const originalText = elements.copy.querySelector("span")?.textContent || "Copy Verse";
    const copyText = [
      state.holidayLabels.join(" • "),
      state.verse.reference,
      state.verse.plainText,
      state.bible.name || state.bible.abbreviation
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await navigator.clipboard.writeText(copyText);

      const label = elements.copy.querySelector("span");

      if (label) {
        label.textContent = "Copied!";
        window.setTimeout(() => {
          label.textContent = originalText;
        }, 1500);
      }
    } catch (error) {
      console.error("Copy failed:", error);
      renderError("The verse could not be copied on this browser.");
    }
  }

  function openFullChapter() {
    if (state.openChapterUrl) {
      window.location.href = state.openChapterUrl;
    }
  }

  function initialize() {
    const elements = getElements();

    if (!elements.action || !elements.modal) {
      return;
    }

    elements.action.addEventListener("click", openModal);
    elements.close?.addEventListener("click", () => setModalOpen(false));
    elements.cancel?.addEventListener("click", () => setModalOpen(false));
    elements.copy?.addEventListener("click", copyVerse);
    elements.openChapter?.addEventListener("click", openFullChapter);

    elements.modal.addEventListener("click", (event) => {
      if (event.target === elements.modal) {
        setModalOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        elements.modal.style.display !== "none"
      ) {
        setModalOpen(false);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", initialize);

  return {
    getTodayDefinition,
    getHolidayDefinition,
    openModal
  };
})();
