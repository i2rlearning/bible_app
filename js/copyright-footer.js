"use strict";

(function initializeScriptureLicenseFooter() {
  const footer = document.getElementById("scripture-license-footer");
  const summary = document.getElementById("scripture-license-summary");
  const link = document.getElementById("scripture-license-link");

  if (!footer || !summary || !link) {
    return;
  }

  const params = new URLSearchParams(window.location.search);

  const bibleId =
    params.get("bible") ||
    params.get("version") ||
    params.get("bibleId") ||
    "";

  const bibleAbbr =
    params.get("bibleAbbr") ||
    params.get("abbr") ||
    "";

  const bibleName =
    params.get("bibleName") ||
    "";

  const label =
    bibleAbbr ||
    bibleName ||
    "Current Bible";

  summary.textContent = `Bible text: ${label}`;

  const copyrightParams = new URLSearchParams();

  if (bibleId) {
    copyrightParams.set("bible", bibleId);
  }

  if (bibleAbbr) {
    copyrightParams.set("bibleAbbr", bibleAbbr);
  }

  if (bibleName) {
    copyrightParams.set("bibleName", bibleName);
  }

  link.href = copyrightParams.toString()
    ? `./copyright.html?${copyrightParams.toString()}`
    : "./copyright.html";
})();
