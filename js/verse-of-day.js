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
  const FIRST_TIME_FALLBACK_BIBLE = {
    id: "bba9f40183526463-01",
    abbreviation: "BSB",
    name: "Berean Standard Bible"
  };
  const PREFERRED_BIBLE_WAIT_ATTEMPTS = 6;
  const PREFERRED_BIBLE_WAIT_MS = 250;

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
  /*
   * Hebcal supplies the Gregorian dates for these observances.
   * This app remains responsible for the label, priority, and Scripture.
   *
   * The Israel schedule is enabled below. Set HEBCAL_USE_ISRAEL_SCHEDULE
   * to false to use the Diaspora schedule instead.
   */
  const BIBLICAL_APPOINTED_TIMES = [
    {
      key: "passover",
      labels: ["Passover"],
      category: "biblical-appointed-time",
      priority: 75,
      hebcalMatch: {
        titles: ["Pesach I"]
      },
      references: ["EXO.12.13", "1CO.5.7"]
    },
    {
      key: "shavuot",
      labels: ["Shavuot"],
      category: "biblical-appointed-time",
      priority: 75,
      hebcalMatch: {
        titles: ["Shavuot", "Shavuot I"]
      },
      references: ["EXO.19.5-EXO.19.6", "ACT.2.4"]
    },
    {
      key: "yom-teruah",
      labels: ["Yom Teruah"],
      category: "biblical-appointed-time",
      priority: 75,
      hebcalMatch: {
        titles: ["Rosh Hashana I"]
      },
      references: ["LEV.23.24", "NUM.29.1"]
    },
    {
      key: "yom-kippur",
      labels: ["Yom Kippur"],
      category: "biblical-appointed-time",
      priority: 80,
      hebcalMatch: {
        titles: ["Yom Kippur"]
      },
      references: ["LEV.16.30", "PSA.51.10"]
    },
    {
      key: "sukkot",
      labels: ["Sukkot"],
      category: "biblical-appointed-time",
      priority: 75,
      hebcalMatch: {
        titles: ["Sukkot I"]
      },
      references: ["LEV.23.42-LEV.23.43", "JHN.1.14"]
    },
    {
      key: "shemini-atzeret",
      labels: ["Shemini Atzeret"],
      category: "biblical-appointed-time",
      priority: 75,
      hebcalMatch: {
        titles: ["Shmini Atzeret"]
      },
      references: ["LEV.23.36", "NUM.29.35"]
    }
  ];

  const LATER_JEWISH_OBSERVANCES = [
    {
      key: "simchat-torah",
      labels: ["Simchat Torah"],
      category: "later-jewish",
      priority: 55,
      hebcalMatch: {
        titles: ["Simchat Torah"]
      },
      references: ["JOS.1.8", "PSA.119.105"]
    },
    {
      key: "hanukkah",
      labels: ["Chanukah"],
      category: "later-jewish",
      priority: 50,
      hebcalMatch: {
        titles: ["Chanukah: 1 Candle"]
      },
      references: ["JHN.10.22", "PSA.30.1"]
    },
    {
      key: "purim",
      labels: ["Purim"],
      category: "later-jewish",
      priority: 50,
      hebcalMatch: {
        titles: ["Purim"]
      },
      references: ["EST.9.22", "PSA.30.11"]
    },
    {
      key: "yom-haatzmaut",
      labels: ["Independence Day - Israel"],
      category: "later-jewish",
      priority: 50,
      hebcalMatch: {
        titles: ["Yom HaAtzma'ut", "Yom HaAtzma’ut"]
      },
      references: ["PSA.126.3", "ISA.66.8"]
    }
  ];

  const HEBCAL_API_URL = "https://www.hebcal.com/hebcal";
  const HEBCAL_CACHE_PREFIX = "branchOfIsraelHebcal:v1";
  const HEBCAL_USE_ISRAEL_SCHEDULE = true;

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
      labels: ["Independence Day - America"],
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
    // January
    { primary: "2CO.5.17", fallbacks: ["PSA.27.14"] },                 //JAN 1
    { primary: "JHN.3.16", fallbacks: ["GEN.22.14"] },                 //JAN 2
    { primary: "ROM.12.4-ROM.12.5", fallbacks: ["PSA.18.2"] },         //JAN 3
    { primary: "PHP.4.6", fallbacks: ["PSA.55.22"] },                  //JAN 4
    { primary: "ROM.8.28", fallbacks: ["GEN.50.20"] },                 //JAN 5
    { primary: "PRO.3.5", fallbacks: ["2TI.3.12"] },                   //JAN 6
    { primary: "MAT.11.28", fallbacks: ["PSA.68.35"] },                //JAN 7
    { primary: "PHP.4.7", fallbacks: ["PRO.6.23"] },                   //JAN 8
    { primary: "2CO.5.7", fallbacks: ["DEU.31.8"] },                   //JAN 9
    { primary: "1CO.13.13", fallbacks: ["MIC.6.8"] },                  //JAN 10
    { primary: "ISA.40.31", fallbacks: ["GAL.6.9"] },                  //JAN 11
    { primary: "JHN.14.6", fallbacks: ["ISA.35.8"] },                  //JAN 12
    { primary: "PSA.46.1", fallbacks: ["MRK.10.45"] },                 //JAN 13
    { primary: "GAL.5.22", fallbacks: ["PSA.1.1-PSA.1.3"] },           //JAN 14
    { primary: "HEB.11.1", fallbacks: ["HAB.2.4"] },                   //JAN 15
    { primary: "MAT.5.16", fallbacks: ["JER.17.7"] },                  //JAN 16
    { primary: "EPH.2.10", fallbacks: ["ISA.43.7"] },                  //JAN 17
    { primary: "MAT.21.9", fallbacks: ["PSA.103.8"] },                 //JAN 18
    { primary: "JHN.8.12", fallbacks: ["ISA.60.1"] },                  //JAN 19
    { primary: "PSA.121.2", fallbacks: ["JHN.3.17"] },                 //JAN 20
    { primary: "COL.3.15", fallbacks: ["ISA.26.3"] },                  //JAN 21
    { primary: "JHN.10.27", fallbacks: ["DEU.10.12"] },                //JAN 22
    { primary: "1PE.5.7", fallbacks: ["PSA.34.17"] },                  //JAN 23
    { primary: "JHN.7.16", fallbacks: ["PSA.67.1"] },                  //JAN 24
    { primary: "REV.21.4", fallbacks: ["ISA.25.8"] },                  //JAN 25
    { primary: "PSA.19.14", fallbacks: ["JAS.1.18"] },                 //JAN 26
    { primary: "EPH.5.8", fallbacks: ["ISA.58.8"] },                   //JAN 27
    { primary: "ISA.43.2", fallbacks: ["GAL.5.17"] },                  //JAN 28
    { primary: "PHP.4.13", fallbacks: ["HAB.3.19"] },                  //JAN 29
    { primary: "MRK.11.22-MRK.11.24", fallbacks: ["ECC.3.12"] },       //JAN 30
    { primary: "JAS.1.6", fallbacks: ["DEU.30.9"] },                   //JAN 31

    // February
    { primary: "ROM.5.3-ROM.5.4", fallbacks: ["NAM.1.7"] },            //FEB 1
    { primary: "MAT.7.3", fallbacks: ["PSA.139.23-PSA.139.24"] },      //FEB 2
    { primary: "ROM.8.31", fallbacks: ["PSA.91.2"] },                  //FEB 3
    { primary: "PRO.16.3", fallbacks: ["1JN.4.19"] },                  //FEB 4
    { primary: "PSA.119.105", fallbacks: ["COL.3.5"] },                //FEB 5
    { primary: "MAT.11.29", fallbacks: ["ISA.40.28"] },                //FEB 6
    { primary: "JHN.14.27", fallbacks: ["PSA.66.12"] },                //FEB 7
    { primary: "EPH.3.20", fallbacks: ["COL.3.23"] },                  //FEB 8
    { primary: "2TI.1.7", fallbacks: ["PSA.27.1"] },                   //FEB 9
    { primary: "DEU.31.6", fallbacks: ["PSA.23.4"] },                  //FEB 10
    { primary: "EPH.4.32", fallbacks: ["ROM.15.13"] },                 //FEB 11
    { primary: "JAS.1.5", fallbacks: ["PRO.4.7"] },                    //FEB 12
    { primary: "1CO.13.4-1CO.13.5", fallbacks: ["ROM.13.10"] },        //FEB 13
    { primary: "PSA.37.4", fallbacks: ["MAT.7.7"] },                   //FEB 14
    { primary: "MAT.6.31-MAT.6.32", fallbacks: ["PSA.37.24"] },        //FEB 15
    { primary: "COL.3.2", fallbacks: ["PHP.4.8"] },                    //FEB 16
    { primary: "HEB.12.1", fallbacks: ["ISA.41.13"] },                 //FEB 17
    { primary: "PRO.4.23", fallbacks: ["EPH.6.12"] },                  //FEB 18
    { primary: "HEB.4.16", fallbacks: ["PSA.62.1"] },                  //FEB 19
    { primary: "PSA.139.14", fallbacks: ["JHN.13.34"] },               //FEB 20
    { primary: "PSA.34.19", fallbacks: ["ROM.8.39"] },                 //FEB 21
    { primary: "PRO.18.10", fallbacks: ["EPH.4.15"] },                 //FEB 22
    { primary: "ACT.10.34", fallbacks: ["PSA.67.3"] },                 //FEB 23
    { primary: "ROM.12.12", fallbacks: ["ECC.2.13"] },                 //FEB 24
    { primary: "2CH.7.14", fallbacks: ["MAT.18.20"] },                 //FEB 25
    { primary: "PSA.37.5", fallbacks: ["ROM.3.23"] },                  //FEB 26
    { primary: "EPH.2.8-EPH.2.9", fallbacks: ["PRO.16.9"] },           //FEB 27
    { primary: "PSA.51.10", fallbacks: ["PHP.2.15"] },                 //FEB 28

    // March
    { primary: "ISA.40.29", fallbacks: ["MAT.22.37"] },                //MAR 1
    { primary: "1TI.6.17-1TI.6.19", fallbacks: ["PSA.103.5"] },        //MAR 2
    { primary: "GEN.12.2", fallbacks: ["1JN.4.21"] },                  //MAR 3
    { primary: "MRK.8.34-MRK.8.35", fallbacks: ["PSA.86.15"] },        //MAR 4
    { primary: "HEB.13.5", fallbacks: ["PRO.2.6"] },                   //MAR 5
    { primary: "3JN.1.2", fallbacks: ["PRO.11.18"] },                  //MAR 6
    { primary: "ROM.2.5-ROM.2.6", fallbacks: ["PSA.103.2"] },          //MAR 7
    { primary: "PSA.105.4", fallbacks: ["ACT.5.38-ACT.5.39"] },        //MAR 8
    { primary: "ISA.43.1", fallbacks: ["1TH.5.11"] },                  //MAR 9
    { primary: "MAT.5.9", fallbacks: ["HEB.12.14"] },                  //MAR 10
    { primary: "PSA.118.24", fallbacks: ["1PE.2.9"] },                 //MAR 11
    { primary: "JER.29.11", fallbacks: ["2CO.1.20"] },                 //MAR 12
    { primary: "ISA.41.10", fallbacks: ["1PE.5.10"] },                 //MAR 13
    { primary: "HEB.12.2", fallbacks: ["PSA.145.18-PSA.145.19"] },     //MAR 14
    { primary: "ISA.55.6-ISA.55.7", fallbacks: ["MAT.6.33"] },         //MAR 15
    { primary: "JOS.1.9", fallbacks: ["PHP.1.6"] },                    //MAR 16
    { primary: "MAT.6.34", fallbacks: ["ECC.5.19"] },                  //MAR 17
    { primary: "HEB.10.24-HEB.10.25", fallbacks: ["PRO.16.25"] },      //MAR 18
    { primary: "PSA.34.8", fallbacks: ["ROM.5.5"] },                   //MAR 19
    { primary: "LAM.3.22", fallbacks: ["2CO.12.9"] },                  //MAR 20
    { primary: "ISA.54.17", fallbacks: ["REV.12.11"] },                //MAR 21
    { primary: "MAT.5.14", fallbacks: ["PRO.16.32"] },                 //MAR 22
    { primary: "NUM.6.24", fallbacks: ["REV.1.3"] },                   //MAR 23
    { primary: "1TH.5.16-1TH.5.18", fallbacks: ["PRO.18.21"] },        //MAR 24
    { primary: "ROM.15.5", fallbacks: ["DEU.30.16"] },                 //MAR 25
    { primary: "PHP.4.4", fallbacks: ["PRO.11.2"] },                   //MAR 26
    { primary: "EPH.6.10", fallbacks: ["2SA.7.22"] },                  //MAR 27
    { primary: "1CO.16.13-1CO.16.14", fallbacks: ["PSA.119.130"] },    //MAR 28
    { primary: "1CO.9.24-1CO.9.25", fallbacks: ["PRO.29.25"] },        //MAR 29
    { primary: "PRO.24.30-PRO.24.34", fallbacks: ["1JN.4.18"] },       //MAR 30
    { primary: "PSA.25.6-PSA.25.7", fallbacks: ["ROM.12.2"] },          //MAR 31

    // April
    { primary: "LUK.24.6", fallbacks: ["PSA.16.10"] },                 //APR 1
    { primary: "PSA.139.17", fallbacks: ["ROM.11.33"] },               //APR 2
    { primary: "JHN.15.5", fallbacks: ["JER.17.8"] },                  //APR 3
    { primary: "ISA.53.5", fallbacks: ["1PE.2.24"] },                  //APR 4
    { primary: "JHN.11.25", fallbacks: ["JOB.19.25"] },                //APR 5
    { primary: "PSA.32.8", fallbacks: ["JHN.16.13"] },                 //APR 6
    { primary: "ROM.10.17", fallbacks: ["ISA.55.11"] },                //APR 7
    { primary: "PRO.17.17", fallbacks: ["JHN.15.13"] },                //APR 8
    { primary: "2CO.4.16", fallbacks: ["ISA.46.4"] },                  //APR 9
    { primary: "PSA.84.11", fallbacks: ["JAS.1.17"] },                 //APR 10
    { primary: "1JN.1.9", fallbacks: ["PSA.103.12"] },                 //APR 11
    { primary: "PRO.15.1", fallbacks: ["EPH.4.29"] },                  //APR 12
    { primary: "HEB.4.12", fallbacks: ["JER.23.29"] },                 //APR 13
    { primary: "PSA.90.12", fallbacks: ["EPH.5.15-EPH.5.16"] },        //APR 14
    { primary: "MAT.28.20", fallbacks: ["JOS.1.5"] },                  //APR 15
    { primary: "ISA.30.21", fallbacks: ["JHN.10.4"] },                 //APR 16
    { primary: "LUK.6.31", fallbacks: ["LEV.19.18"] },                 //APR 17
    { primary: "PSA.147.3", fallbacks: ["MAT.5.4"] },                  //APR 18
    { primary: "ROM.8.1", fallbacks: ["ISA.1.18"] },                   //APR 19
    { primary: "PRO.27.17", fallbacks: ["HEB.10.23"] },                //APR 20
    { primary: "1CO.10.13", fallbacks: ["PSA.119.11"] },               //APR 21
    { primary: "GEN.1.1", fallbacks: ["COL.1.16"] },                   //APR 22
    { primary: "MAT.6.20", fallbacks: ["PRO.11.4"] },                  //APR 23
    { primary: "PSA.42.11", fallbacks: ["HEB.6.19"] },                 //APR 24
    { primary: "1PE.3.15", fallbacks: ["PSA.96.3"] },                  //APR 25
    { primary: "MIC.7.18", fallbacks: ["TIT.3.5"] },                   //APR 26
    { primary: "PHP.3.14", fallbacks: ["PRO.4.18"] },                  //APR 27
    { primary: "ISA.26.4", fallbacks: ["2TH.3.3"] },                   //APR 28
    { primary: "JHN.4.24", fallbacks: ["PSA.95.6"] },                  //APR 29
    { primary: "ECC.12.13", fallbacks: ["COL.3.17"] }                  //APR 30     
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

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
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

  function getHebcalCacheKey(year) {
    const schedule = HEBCAL_USE_ISRAEL_SCHEDULE ? "israel" : "diaspora";
    return `${HEBCAL_CACHE_PREFIX}:${schedule}:${year}`;
  }

  function readHebcalCache(year) {
    try {
      const raw = localStorage.getItem(getHebcalCacheKey(year));

      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);

      return Array.isArray(parsed?.items)
        ? parsed.items
        : null;
    } catch (error) {
      console.warn("Unable to read the Hebcal cache:", error);
      return null;
    }
  }

  function writeHebcalCache(year, items) {
    try {
      localStorage.setItem(
        getHebcalCacheKey(year),
        JSON.stringify({
          year,
          schedule: HEBCAL_USE_ISRAEL_SCHEDULE ? "israel" : "diaspora",
          savedAt: new Date().toISOString(),
          items
        })
      );
    } catch (error) {
      console.warn("Unable to save the Hebcal cache:", error);
    }
  }

  async function loadHebcalYear(year) {
    const cached = readHebcalCache(year);

    if (cached) {
      return cached;
    }

    const query = new URLSearchParams({
      v: "1",
      cfg: "json",
      year: String(year),
      yt: "G",
      month: "x",
      maj: "on",
      min: "on",
      mod: "on",
      nx: "on"
    });

    if (HEBCAL_USE_ISRAEL_SCHEDULE) {
      query.set("i", "on");
    }

    const response = await fetch(`${HEBCAL_API_URL}?${query.toString()}`);

    if (!response.ok) {
      throw new Error(
        `Hebcal request failed with status ${response.status}.`
      );
    }

    const result = await response.json();
    const items = Array.isArray(result?.items)
      ? result.items
          .filter((item) => item?.date && item?.title)
          .map((item) => ({
            date: item.date,
            title: item.title,
            category: item.category || "",
            subcat: item.subcat || ""
          }))
      : [];

    writeHebcalCache(year, items);
    return items;
  }

  function matchesHebcalTitle(title, match = {}) {
    const normalizedTitle = String(title || "").trim();

    if (!normalizedTitle) {
      return false;
    }

    const exactTitles = Array.isArray(match.titles)
      ? match.titles
      : [];

    if (exactTitles.includes(normalizedTitle)) {
      return true;
    }

    const titlePrefixes = Array.isArray(match.titlePrefixes)
      ? match.titlePrefixes
      : [];

    return titlePrefixes.some((prefix) =>
      normalizedTitle.startsWith(prefix)
    );
  }

  async function getHebcalObservanceMatches(date) {
    const hebcalObservances = [
      ...BIBLICAL_APPOINTED_TIMES,
      ...LATER_JEWISH_OBSERVANCES
    ];

    if (!hebcalObservances.length) {
      return [];
    }

    let events;

    try {
      events = await loadHebcalYear(date.getFullYear());
    } catch (error) {
      console.warn(
        "Hebcal events are unavailable; continuing without them:",
        error
      );
      return [];
    }

    const dateKey = getLocalDateKey(date);
    const todayTitles = events
      .filter((event) => event.date === dateKey)
      .map((event) => event.title);

    if (!todayTitles.length) {
      return [];
    }

    const matched = hebcalObservances.filter((observance) =>
      todayTitles.some((title) =>
        matchesHebcalTitle(title, observance.hebcalMatch)
      )
    );

    const uniqueByKey = new Map();

    matched.forEach((observance) => {
      uniqueByKey.set(observance.key, observance);
    });

    return [...uniqueByKey.values()];
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
  async function getHolidayDefinition(date = new Date()) {
    const localObservances = [
      ...CHRISTIAN_HOLIDAYS,
      ...SPECIAL_OBSERVANCES
    ];

    const localMatches = localObservances.filter((observance) =>
      matchesDateRule(date, observance.dateRule)
    );

    const hebcalMatches = await getHebcalObservanceMatches(date);

    const matches = [
      ...localMatches,
      ...hebcalMatches
    ]
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

  async function getTodayDefinition(date = new Date()) {
    const effectiveDate = getEffectiveDate(date);
    const holiday = await getHolidayDefinition(effectiveDate);

    return (
      holiday ||
      getOrdinaryDailyDefinition(effectiveDate)
    );
  }

  function readStoredPreferencesDirectly() {
    try {
      return JSON.parse(
        localStorage.getItem("branchOfIsraelPreferences") || "{}"
      );
    } catch (error) {
      console.warn("Unable to read saved Bible preferences:", error);
      return {};
    }
  }

  function getPreferredBibleFromAvailableState() {
    const preferences =
      window.UserPreferences?.getAll?.() ||
      window.UserPreferences?.read?.() ||
      readStoredPreferencesDirectly();

    const saved = preferences || {};
    const preferredState =
      window.UserPreferences?.getPreferredBibleState?.() || {};

    const savedBible =
      saved.bible ||
      saved.preferredBible ||
      {};

    const bibleId =
      preferredState.bibleId ||
      saved.bibleId ||
      savedBible.bibleId ||
      savedBible.id ||
      "";

    if (!bibleId) {
      return null;
    }

    const bibleAbbr =
      preferredState.bibleAbbr ||
      saved.bibleAbbr ||
      savedBible.bibleAbbr ||
      savedBible.abbreviation ||
      preferredState.bibleName ||
      saved.bibleName ||
      savedBible.name ||
      "";

    const bibleName =
      preferredState.bibleName ||
      saved.bibleName ||
      savedBible.bibleName ||
      savedBible.name ||
      preferredState.bibleAbbr ||
      saved.bibleAbbr ||
      savedBible.abbreviation ||
      "";

    return {
      id: bibleId,
      abbreviation: bibleAbbr,
      name: bibleName
    };
  }

  async function resolveBible() {
    for (let attempt = 0; attempt < PREFERRED_BIBLE_WAIT_ATTEMPTS; attempt += 1) {
      const preferredBible = getPreferredBibleFromAvailableState();

      if (preferredBible?.id) {
        return preferredBible;
      }

      await wait(PREFERRED_BIBLE_WAIT_MS);
    }

    const preferredBible = getPreferredBibleFromAvailableState();

    if (preferredBible?.id) {
      return preferredBible;
    }

    return { ...FIRST_TIME_FALLBACK_BIBLE };
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

  async function loadVerseOfDayPayload() {
    const effectiveDate = getEffectiveDate();
    const definition = await getTodayDefinition(effectiveDate);
    const bible = await resolveBible();
    const verse = await resolveVerseForBible(bible, definition);

    return {
      effectiveDate,
      definition,
      bible,
      verse
    };
  }

  function applyLoadedVerseOfDay(payload) {
    const { effectiveDate, definition, bible, verse } = payload;

    state.dateKey = getLocalDateKey(effectiveDate);
    state.holidayLabels = definition.labels || [];
    state.bible = bible;
    state.verse = verse;
    state.openChapterUrl = buildOpenChapterUrl(bible, verse);
    state.loaded = true;

    renderVerse();
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
  
    window.setTimeout(async () => {
      resetLoadedState();
  
      const elements = getElements();
      const modalIsOpen =
        elements.modal &&
        elements.modal.style.display !== "none";
  
      if (modalIsOpen) {
        renderLoading();
        await ensureLoaded();
      }
  
      scheduleMidnightReset();
    }, nextMidnight.getTime() - now.getTime());
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
      applyLoadedVerseOfDay(await loadVerseOfDayPayload());
    } catch (error) {
      console.warn("Verse of the Day first attempt failed. Retrying:", error);

      try {
        await wait(700);
        applyLoadedVerseOfDay(await loadVerseOfDayPayload());
      } catch (retryError) {
        console.error("Verse of the Day failed after retry:", retryError);
        renderError(
          "Today’s verse could not be loaded. Please try again in a moment."
        );
      }
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
