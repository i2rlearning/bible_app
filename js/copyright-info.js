"use strict";

(function initializeCopyrightPage() {
  const container = document.getElementById("selected-bible-copyright");

  if (!container) {
    return;
  }

  const params = new URLSearchParams(window.location.search);

  const bibleId =
    params.get("bible") ||
    params.get("version") ||
    params.get("bibleId") ||
    "";

  const fallbackAbbr =
    params.get("bibleAbbr") ||
    params.get("abbr") ||
    "";

  const fallbackName =
    params.get("bibleName") ||
    "";

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getApiKey() {
    if (typeof API_KEY === "undefined" || !API_KEY) {
      return "";
    }

    return API_KEY;
  }

  async function fetchBibleDetails(id) {
    const apiKey = getApiKey();

    if (!apiKey) {
      throw new Error("API key is unavailable.");
    }

    const response = await fetch(
      `https://api.scripture.api.bible/v1/bibles/${encodeURIComponent(id)}?include-full-details=true`,
      {
        headers: {
          "api-key": apiKey
        }
      }
    );

    if (!response.ok) {
      throw new Error(`API.Bible request failed with status ${response.status}.`);
    }

    const result = await response.json();
    return result.data || {};
  }

  function renderFallbackOnly() {
    const title = [fallbackName, fallbackAbbr ? `(${fallbackAbbr})` : ""]
      .filter(Boolean)
      .join(" ") ||
      "Selected Bible";

    container.innerHTML = `
      <h2>${escapeHtml(title)}</h2>
      <p class="copyright-muted">
        Full copyright information could not be loaded automatically.
        Please add the required citation from the API.Bible dashboard or from the Bible version metadata.
      </p>
    `;
  }

  function renderBibleDetails(details) {
    const name = details.name || fallbackName || "Selected Bible";
    const abbreviation = details.abbreviation || fallbackAbbr || "";
    const language = details.language?.name || "";
    const copyright = details.copyright || "";
    const description = details.description || "";
    const updatedAt = details.updatedAt || "";

    const metaRows = [
      ["Name", name],
      ["Abbreviation", abbreviation],
      ["Language", language],
      ["Bible ID", bibleId],
      ["Updated", updatedAt]
    ].filter(([, value]) => Boolean(value));

    const metaHtml = metaRows
      .map(([label, value]) => `
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(value)}</dd>
      `)
      .join("");

    const notice = copyright || description ||
      "No copyright text was returned by the API response. Add the required citation from API.Bible metadata or the Developer Dashboard.";

    container.innerHTML = `
      <h2>${escapeHtml(name)}${abbreviation ? ` (${escapeHtml(abbreviation)})` : ""}</h2>
      <dl class="copyright-meta">${metaHtml}</dl>
      <div class="copyright-notice">${escapeHtml(notice)}</div>
    `;
  }

  if (!bibleId) {
    renderFallbackOnly();
    return;
  }

  fetchBibleDetails(bibleId)
    .then(renderBibleDetails)
    .catch((error) => {
      console.error("Could not load copyright information:", error);
      renderFallbackOnly();
    });
})();
