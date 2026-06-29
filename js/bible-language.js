"use strict";

window.BibleLanguage = {
  options: [
    {
      label: "All",
      apiUrl:
        "https://api.scripture.api.bible/v1/bibles?include-full-details=false"
    },
    {
      label: "English",
      apiUrl:
        "https://rest.api.bible/v1/bibles?language=eng&include-full-details=false"
    },
    {
      label: "Greek",
      apiUrl:
        "https://api.scripture.api.bible/v1/bibles?language=grc&include-full-details=true"
    },
    {
      label: "Hebrew",
      apiUrl:
        "https://api.scripture.api.bible/v1/bibles?ids=a8a97eebae3c98e4-01%2C%202c500771ea16da93-01%2C%200b262f1ed7f084a6-01&include-full-details=false"
    }
  ],

  getDefaultApiUrl() {
    return this.options[0].apiUrl;
  },

  getSelectedApiUrl() {
    return (
      localStorage.getItem("selectedBibleApi") ||
      this.getDefaultApiUrl()
    );
  },

  getSelectedLanguageName() {
    return (
      localStorage.getItem("selectedLanguageName") ||
      "All"
    );
  },

  saveSelection(apiUrl, languageName) {
    localStorage.setItem(
      "selectedBibleApi",
      apiUrl
    );

    localStorage.setItem(
      "selectedLanguageName",
      languageName
    );
  },

  populateSelect(selectElement) {
    if (!selectElement) {
      return;
    }

    selectElement.innerHTML = "";

    for (const language of this.options) {
      const option =
        document.createElement("option");

      option.value =
        language.apiUrl;

      option.textContent =
        language.label;

      selectElement.appendChild(option);
    }

    const savedApiUrl =
      this.getSelectedApiUrl();

    const savedOptionExists =
      Array.from(selectElement.options).some(
        (option) =>
          option.value === savedApiUrl
      );

    selectElement.value =
      savedOptionExists
        ? savedApiUrl
        : this.getDefaultApiUrl();
  },

  setupSelect(
    selectElement,
    options = {}
  ) {
    if (!selectElement) {
      return;
    }

    this.populateSelect(selectElement);

    selectElement.addEventListener(
      "change",
      () => {
        const apiUrl =
          selectElement.value;

        const languageName =
          selectElement.options[
            selectElement.selectedIndex
          ]?.textContent?.trim() ||
          "All";

        this.saveSelection(
          apiUrl,
          languageName
        );

        if (
          typeof options.onChange ===
          "function"
        ) {
          options.onChange({
            apiUrl,
            languageName
          });
        }
      }
    );
  }
};
