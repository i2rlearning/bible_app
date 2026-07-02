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

  const CHRISTIAN_HOLIDAYS = [
    {
      key: "palm-sunday",
      labels: ["Palm Sunday"],
      category: "christian",
      priority: 60,
      dateRule: {
        type: "relative-to-resurrection",
        offsetDays: -7
      },
      references: ["JHN.12.13", "ZEC.9.9"]
    },
    {
      key: "good-friday",
      labels: ["Good Friday"],
      category: "christian",
      priority: 65,
      dateRule: {
        type: "relative-to-resurrection",
        offsetDays: -2
      },
      references: ["ISA.53.5", "1PE.2.24"]
    },
    {
      key: "resurrection-sunday",
      labels: ["Resurrection Sunday"],
      category: "christian",
      priority: 70,
      dateRule: {
        type: "relative-to-resurrection",
        offsetDays: 0
      },
      references: ["MAT.28.6", "PSA.16.10"]
    },
    {
      key: "ascension-day",
      labels: ["Ascension Day"],
      category: "christian",
      priority: 60,
      dateRule: {
        type: "relative-to-resurrection",
        offsetDays: 39
      },
      references: ["ACT.1.9", "PSA.47.5"]
    },
    {
      key: "pentecost",
      labels: ["Pentecost"],
      category: "christian",
      priority: 65,
      dateRule: {
        type: "relative-to-resurrection",
        offsetDays: 49
      },
      references: ["ACT.2.4", "JOL.2.28"]
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

  const LEAP_DAY_PASSAGE = {
    primary: "ECC.3.1",
    fallbacks: ["PSA.90.12"]
  };

  const state = {
    loaded: false,
    loading: false,
    dateKey: "",
    holidayLabels: [],
    bible: null,
    verse: null,
    openChapterUrl: "",
    lastFocusedElement: null
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

  function isLeapYear(year) {
    return (
      year % 4 === 0 &&
      (year % 100 !== 0 || year % 400 === 0)
    );
  }

  /*
   * Returns a stable 1–365 calendar position.
   *
   * February 29 has its own dedicated passage. Dates after February 29
   * stay aligned with the same DAILY_PASSAGES entry every year.
   */
  function getStableDayOfYear(date = new Date()) {
    const start = new Date(date.getFullYear(), 0, 1);
    const current = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );

    let dayOfYear =
      Math.floor((current - start) / 86400000) + 1;

    if (
      isLeapYear(date.getFullYear()) &&
      date.getMonth() === 1 &&
      date.getDate() === 29
    ) {
      return 59;
    }

    if (
      isLeapYear(date.getFullYear()) &&
      date.getMonth() > 1
    ) {
      dayOfYear -= 1;
    }

    return dayOfYear;
  }

  function getOrdinaryDailyDefinition(date = new Date()) {
    if (
      date.getMonth() === 1 &&
      date.getDate() === 29
    ) {
      return {
        labels: [],
        category: "ordinary",
        references: [
          LEAP_DAY_PASSAGE.primary,
          ...(LEAP_DAY_PASSAGE.fallbacks || [])
        ],
        alternateSources: []
      };
    }

    if (!DAILY_PASSAGES.length) {
      throw new Error("The daily passage list is empty.");
    }

    const index =
      (getStableDayOfYear(date) - 1) %
      DAILY_PASSAGES.length;

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

  function getResurrectionSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);

    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;

    return new Date(year, month - 1, day, 12, 0, 0);
  }

  function addDays(date, numberOfDays) {
    const result = new Date(date);
    result.setDate(result.getDate() + numberOfDays);
    return result;
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
    
    if (rule.type === "relative-to-resurrection") {
      const resurrectionSunday =
        getResurrectionSunday(date.getFullYear());
    
      const targetDate =
        addDays(resurrectionSunday, rule.offsetDays || 0);
    
      return (
        date.getFullYear() === targetDate.getFullYear() &&
        date.getMonth() === targetDate.getMonth() &&
        date.getDate() === targetDate.getDate()
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

    wrapper.querySelectorAll("br").forEach((element) => {
      element.replaceWith(document.createTextNode("\n"));
    });

    wrapper.querySelectorAll("p, div, li").forEach((element) => {
      element.appendChild(document.createTextNode("\n"));
    });

    return wrapper.textContent
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n+ */g, "\n")
      .replace(/\s+([,.;:!?])/g, "$1")
      .trim();
  }

  function isPassageRange(referenceId) {
    return String(referenceId || "").includes("-");
  }

  function getFirstVerseId(referenceId) {
    return String(referenceId || "").split("-")[0].trim();
  }

  function getBookAndChapterFromReference(referenceId) {
    const firstVerseId = getFirstVerseId(referenceId);
    const parts = firstVerseId.split(".");

    return {
      bookId: parts[0] || "",
      chapterId:
        parts.length >= 2
          ? `${parts[0]}.${parts[1]}`
          : ""
    };
  }

  async function loadReference(bibleId, referenceId) {
    const query = new URLSearchParams({
      "content-type": "html",
      "include-notes": "false",
      "include-titles": "false",
      "include-chapter-numbers": "false",
      "include-verse-numbers": "false",
      "include-verse-spans": "false"
    });

    const endpoint = isPassageRange(referenceId)
      ? "passages"
      : "verses";

    const result = await requestJson(
      `${API_BASE_URL}/bibles/${encodeURIComponent(
        bibleId
      )}/${endpoint}/${encodeURIComponent(
        referenceId
      )}?${query.toString()}`
    );

    if (!result?.data) {
      throw new Error("The selected Scripture could not be loaded.");
    }

    const inferred = getBookAndChapterFromReference(referenceId);
    const chapterIds = Array.isArray(result.data.chapterIds)
      ? result.data.chapterIds
      : [];

    return {
      ...result.data,
      bookId: result.data.bookId || inferred.bookId,
      chapterId:
        result.data.chapterId ||
        chapterIds[0] ||
        inferred.chapterId,
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
        const verse = await loadReference(bible.id, verseId);

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

  function resetLoadedState() {
    state.loaded = false;
    state.loading = false;
    state.dateKey = "";
    state.holidayLabels = [];
    state.bible = null;
    state.verse = null;
    state.openChapterUrl = "";
  }

  function hasDateChanged() {
    const effectiveDate = getEffectiveDate();
    return (
      state.dateKey &&
      state.dateKey !== getLocalDateKey(effectiveDate)
    );
  }

  function scheduleMidnightReset() {
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      1
    );

    window.setTimeout(() => {
      resetLoadedState();
      scheduleMidnightReset();
    }, nextMidnight - now);
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
      state.lastFocusedElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : elements.action;

      elements.close?.focus();
    } else if (state.lastFocusedElement?.focus) {
      state.lastFocusedElement.focus();
      state.lastFocusedElement = null;
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
    if (hasDateChanged()) {
      resetLoadedState();
    }

    if (state.loaded || state.loading) {
      return;
    }

    state.loading = true;
    renderLoading();

    try {
      const effectiveDate = getEffectiveDate();
      const definition = getTodayDefinition(effectiveDate);
      const bible = await resolveBible();
      const verse = await resolveVerseForBible(bible, definition);

      state.dateKey = getLocalDateKey(effectiveDate);
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
    if (hasDateChanged()) {
      resetLoadedState();
    }

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

    window.addEventListener("bible-preferences-changed", () => {
      resetLoadedState();

      if (elements.modal.style.display !== "none") {
        ensureLoaded();
      }
    });

    scheduleMidnightReset();
  }

  document.addEventListener("DOMContentLoaded", initialize);

  return {
    getTodayDefinition,
    getHolidayDefinition,
    getStableDayOfYear,
    openModal,
    reset: resetLoadedState
  };
})();
