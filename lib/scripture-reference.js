//***************************************************************************
// This file provides functions to normalize, parse, and validate Scripture
// references, including book-name casing, whitespace cleanup, chapter/verse
// formats, ranges, and removal of partial-verse suffixes such as "b".
//***************************************************************************

function normalizeWhitespace(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeBookName(value) {
  const smallWords = new Set(["of", "the", "and"]);

  return String(value || "")
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
