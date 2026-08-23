//***************************************************************************
// This file provides shared functions to normalize, canonicalize, parse,
// and validate Scripture references.
//
// It handles:
// - Book-name casing and recognized abbreviations/aliases
//   (for example: "joh", "jhn", and "jn" -> "John")
// - Whitespace and reference formatting cleanup
// - Verse, verse-range, chapter, and chapter-range references
// - Cross-chapter verse ranges
// - Removal of partial-verse suffixes such as "a", "b", or "c"
// - Creation of a consistent canonical reference used for comparison,
//   duplicate prevention, and database storage
//
// Examples:
//   john 3:16       -> John 3:16
//   joh 3:16        -> John 3:16
//   jhn 3:16        -> John 3:16
//   Luke 12:22b-23  -> Luke 12:22-23
//   rom 8:28        -> Romans 8:28
//   1 cor 13:4      -> 1 Corinthians 13:4
//***************************************************************************

function normalizeWhitespace(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

const SCRIPTURE_BOOK_ALIAS_GROUPS = [
  ["Genesis", ["gen", "ge", "gn"]],
  ["Exodus", ["exod", "exo", "ex"]],
  ["Leviticus", ["lev", "le", "lv"]],
  ["Numbers", ["num", "nu", "nm", "nb"]],
  ["Deuteronomy", ["deut", "deu", "dt"]],
  ["Joshua", ["josh", "jos", "jsh"]],
  ["Judges", ["judg", "jdg", "jg", "jdgs"]],
  ["Ruth", ["rth", "ru"]],
  ["1 Samuel", ["1 sam", "1sam", "1 sa", "1sa", "1 sm", "1sm", "i samuel", "i sam", "1st samuel"]],
  ["2 Samuel", ["2 sam", "2sam", "2 sa", "2sa", "2 sm", "2sm", "ii samuel", "ii sam", "2nd samuel"]],
  ["1 Kings", ["1 kings", "1 kgs", "1kgs", "1 ki", "1ki", "i kings", "1st kings"]],
  ["2 Kings", ["2 kings", "2 kgs", "2kgs", "2 ki", "2ki", "ii kings", "2nd kings"]],
  ["1 Chronicles", ["1 chronicles", "1 chron", "1chron", "1 chr", "1chr", "1 ch", "1ch", "i chronicles", "1st chronicles"]],
  ["2 Chronicles", ["2 chronicles", "2 chron", "2chron", "2 chr", "2chr", "2 ch", "2ch", "ii chronicles", "2nd chronicles"]],
  ["Ezra", ["ezr"]],
  ["Nehemiah", ["neh", "ne"]],
  ["Esther", ["esth", "est"]],
  ["Job", []],
  ["Psalms", ["psalm", "ps", "psa", "pss", "psm"]],
  ["Proverbs", ["prov", "pro", "prv", "pr"]],
  ["Ecclesiastes", ["eccl", "ecc", "ecl"]],
  ["Song of Solomon", ["song of songs", "song of solomon", "song of sol", "song", "sos"]],
  ["Isaiah", ["isa", "is"]],
  ["Jeremiah", ["jer", "je", "jr"]],
  ["Lamentations", ["lam", "la"]],
  ["Ezekiel", ["ezek", "eze", "ezk"]],
  ["Daniel", ["dan", "da", "dn"]],
  ["Hosea", ["hos", "ho"]],
  ["Joel", ["jl"]],
  ["Amos", ["am"]],
  ["Obadiah", ["obad", "ob"]],
  ["Jonah", ["jon"]],
  ["Micah", ["mic", "mi"]],
  ["Nahum", ["nah", "na"]],
  ["Habakkuk", ["hab", "hb"]],
  ["Zephaniah", ["zeph", "zep", "zp"]],
  ["Haggai", ["hag", "hg"]],
  ["Zechariah", ["zech", "zec", "zc"]],
  ["Malachi", ["mal", "ml"]],
  ["Matthew", ["matt", "mat", "mt"]],
  ["Mark", ["mrk", "mk"]],
  ["Luke", ["luk", "lk"]],
  ["John", ["joh", "jhn", "jn"]],
  ["Acts", ["act", "ac"]],
  ["Romans", ["rom", "ro", "rm"]],
  ["1 Corinthians", ["1 corinthians", "1 corinth", "1 cor", "1cor", "1 co", "1co", "i corinthians", "i cor", "1st corinthians"]],
  ["2 Corinthians", ["2 corinthians", "2 corinth", "2 cor", "2cor", "2 co", "2co", "ii corinthians", "ii cor", "2nd corinthians"]],
  ["Galatians", ["gal", "ga"]],
  ["Ephesians", ["eph", "ep"]],
  ["Philippians", ["phil", "php"]],
  ["Colossians", ["col"]],
  ["1 Thessalonians", ["1 thessalonians", "1 thess", "1thess", "1 thes", "1thes", "1 th", "1th", "i thessalonians", "i thess", "1st thessalonians"]],
  ["2 Thessalonians", ["2 thessalonians", "2 thess", "2thess", "2 thes", "2thes", "2 th", "2th", "ii thessalonians", "ii thess", "2nd thessalonians"]],
  ["1 Timothy", ["1 timothy", "1 tim", "1tim", "1 ti", "1ti", "1 tm", "1tm", "i timothy", "i tim", "1st timothy"]],
  ["2 Timothy", ["2 timothy", "2 tim", "2tim", "2 ti", "2ti", "2 tm", "2tm", "ii timothy", "ii tim", "2nd timothy"]],
  ["Titus", ["tit"]],
  ["Philemon", ["phlm", "phm", "pm"]],
  ["Hebrews", ["heb", "he"]],
  ["James", ["jas", "jam", "jm"]],
  ["1 Peter", ["1 peter", "1 pet", "1pet", "1 pe", "1pe", "1 pt", "1pt", "i peter", "i pet", "1st peter"]],
  ["2 Peter", ["2 peter", "2 pet", "2pet", "2 pe", "2pe", "2 pt", "2pt", "ii peter", "ii pet", "2nd peter"]],
  ["1 John", ["1 john", "1 jn", "1jn", "1 jhn", "1jhn", "1 joh", "1joh", "i john", "i jn", "1st john"]],
  ["2 John", ["2 john", "2 jn", "2jn", "2 jhn", "2jhn", "2 joh", "2joh", "ii john", "ii jn", "2nd john"]],
  ["3 John", ["3 john", "3 jn", "3jn", "3 jhn", "3jhn", "3 joh", "3joh", "iii john", "iii jn", "3rd john"]],
  ["Jude", []],
  ["Revelation", ["rev", "re", "rv"]]
];

function getScriptureBookAliasKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

const SCRIPTURE_BOOK_ALIAS_MAP = new Map();

SCRIPTURE_BOOK_ALIAS_GROUPS.forEach(([canonicalName, aliases]) => {
  [canonicalName, ...aliases].forEach((alias) => {
    SCRIPTURE_BOOK_ALIAS_MAP.set(getScriptureBookAliasKey(alias), canonicalName);
  });
});

function normalizeBookName(value) {
  const rawBookName = normalizeWhitespace(value);
  const aliasKey = getScriptureBookAliasKey(rawBookName);
  const canonicalBookName = SCRIPTURE_BOOK_ALIAS_MAP.get(aliasKey);

  if (canonicalBookName) {
    return canonicalBookName;
  }

  const smallWords = new Set(["of", "the", "and"]);

  return rawBookName
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      if (/^[ivx]+$/i.test(word)) {
        return word.toUpperCase();
      }

      if (index > 0 && smallWords.has(word)) {
        return word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function normalizeScriptureReference(value) {
  let cleaned = normalizeWhitespace(value);

  if (!cleaned) {
    return "";
  }

  cleaned = cleaned
    .replace(/[\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/\s*:\s*/g, ":")
    .replace(/\s*-\s*/g, "-");

  const match = cleaned.match(/^(.+?)(\s+\d.*)$/);

  if (!match) {
    return cleaned;
  }

  const bookName = normalizeBookName(match[1]);
  let reference = `${bookName}${match[2]}`;

  // Remove partial-verse letters such as 22a, 22b, 22c.
  reference = reference.replace(
    /(\d+)([a-z])(?=\s*(?:-|,|;|$))/gi,
    "$1"
  );

  return reference;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function buildParsedReference(book, startChapter, startVerse, endChapter, endVerse) {
  if (!book || !startChapter) {
    return null;
  }

  if (startVerse === null) {
    if (!endChapter || endVerse !== null || endChapter < startChapter) {
      return null;
    }

    const normalizedReference = endChapter === startChapter
      ? `${book} ${startChapter}`
      : `${book} ${startChapter}-${endChapter}`;

    return {
      normalizedReference,
      book,
      startChapter,
      startVerse: null,
      endChapter,
      endVerse: null
    };
  }

  if (!endChapter || !endVerse) {
    return null;
  }

  if (endChapter < startChapter) {
    return null;
  }

  if (endChapter === startChapter && endVerse < startVerse) {
    return null;
  }

  let normalizedReference = `${book} ${startChapter}:${startVerse}`;

  if (endChapter !== startChapter || endVerse !== startVerse) {
    normalizedReference += endChapter === startChapter
      ? `-${endVerse}`
      : `-${endChapter}:${endVerse}`;
  }

  return {
    normalizedReference,
    book,
    startChapter,
    startVerse,
    endChapter,
    endVerse
  };
}

function parseScriptureReference(value) {
  const normalized = normalizeScriptureReference(value);

  if (!normalized) {
    return null;
  }

  let match = normalized.match(/^(.+?)\s+(\d+):(\d+)-(\d+):(\d+)$/);

  if (match) {
    const startChapter = positiveInteger(match[2]);
    const startVerse = positiveInteger(match[3]);
    const endChapter = positiveInteger(match[4]);
    const endVerse = positiveInteger(match[5]);

    if (!startChapter || !startVerse || !endChapter || !endVerse) {
      return null;
    }

    return buildParsedReference(
      normalizeBookName(match[1]),
      startChapter,
      startVerse,
      endChapter,
      endVerse
    );
  }

  match = normalized.match(/^(.+?)\s+(\d+):(\d+)-(\d+)$/);

  if (match) {
    const startChapter = positiveInteger(match[2]);
    const startVerse = positiveInteger(match[3]);
    const endVerse = positiveInteger(match[4]);

    if (!startChapter || !startVerse || !endVerse) {
      return null;
    }

    return buildParsedReference(
      normalizeBookName(match[1]),
      startChapter,
      startVerse,
      startChapter,
      endVerse
    );
  }

  match = normalized.match(/^(.+?)\s+(\d+)-(\d+)$/);

  if (match) {
    const startChapter = positiveInteger(match[2]);
    const endChapter = positiveInteger(match[3]);

    if (!startChapter || !endChapter) {
      return null;
    }

    return buildParsedReference(
      normalizeBookName(match[1]),
      startChapter,
      null,
      endChapter,
      null
    );
  }

  match = normalized.match(/^(.+?)\s+(\d+):(\d+)$/);

  if (match) {
    const chapter = positiveInteger(match[2]);
    const verse = positiveInteger(match[3]);

    if (!chapter || !verse) {
      return null;
    }

    return buildParsedReference(
      normalizeBookName(match[1]),
      chapter,
      verse,
      chapter,
      verse
    );
  }

  match = normalized.match(/^(.+?)\s+(\d+)$/);

  if (match) {
    const chapter = positiveInteger(match[2]);

    if (!chapter) {
      return null;
    }

    return buildParsedReference(
      normalizeBookName(match[1]),
      chapter,
      null,
      chapter,
      null
    );
  }

  return null;
}

module.exports = {
  normalizeScriptureReference,
  parseScriptureReference
};
