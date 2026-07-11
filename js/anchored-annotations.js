(() => {
  "use strict";

  const INLINE_CLASS = "anchored-inline-annotation";
  const TYPE_CLASSES = {
    circle: "anchored-inline-circle",
    square: "anchored-inline-square"
  };

  function getBibleText() {
    return document.getElementById("bible-text");
  }

  function getSelectionRangeInsideBibleText() {
    const bibleText = getBibleText();
    const selection = window.getSelection();

    if (!bibleText || !selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);

    if (range.collapsed) {
      return null;
    }

    const startContainer =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer
        : range.startContainer.parentElement;

    const endContainer =
      range.endContainer.nodeType === Node.ELEMENT_NODE
        ? range.endContainer
        : range.endContainer.parentElement;

    if (
      !startContainer ||
      !endContainer ||
      !bibleText.contains(startContainer) ||
      !bibleText.contains(endContainer)
    ) {
      return null;
    }

    return range.cloneRange();
  }

  function unwrapElement(element) {
    const parent = element.parentNode;

    if (!parent) {
      return;
    }

    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }

    parent.removeChild(element);
    parent.normalize();
  }

  function removeNestedAnchoredAnnotations(container) {
    container
      .querySelectorAll?.(`.${INLINE_CLASS}`)
      .forEach((element) => unwrapElement(element));
  }

  function createWrapper(type) {
    const wrapper = document.createElement("span");

    wrapper.classList.add(INLINE_CLASS, TYPE_CLASSES[type]);
    wrapper.dataset.anchoredAnnotationType = type;
    wrapper.dataset.anchoredAnnotationId =
      `anchored-inline-${type}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

    return wrapper;
  }

  function createFromCurrentSelection(type) {
    if (type !== "circle" && type !== "square") {
      return { created: false, reason: "unsupported-type" };
    }

    const bibleText = getBibleText();
    const range = getSelectionRangeInsideBibleText();

    if (!bibleText || !range) {
      return { created: false, reason: "no-selection" };
    }

    const selectedText = range.toString();

    if (!selectedText || selectedText.trim().length === 0) {
      return { created: false, reason: "empty-selection" };
    }

    const wrapper = createWrapper(type);

    try {
      const fragment = range.extractContents();

      removeNestedAnchoredAnnotations(fragment);
      wrapper.appendChild(fragment);

      range.insertNode(wrapper);
      wrapper.normalize();

      const selection = window.getSelection();

      if (selection) {
        selection.removeAllRanges();
      }

      return {
        created: true,
        annotation: {
          id: wrapper.dataset.anchoredAnnotationId,
          type,
          text: selectedText
        }
      };
    } catch (error) {
      console.warn(
        "Could not create anchored inline annotation:",
        error
      );

      return {
        created: false,
        reason: "wrap-failed"
      };
    }
  }

  function clear() {
    const bibleText = getBibleText();

    if (!bibleText) {
      return;
    }

    bibleText
      .querySelectorAll(`.${INLINE_CLASS}`)
      .forEach((element) => unwrapElement(element));
  }

  function render() {
    /*
      Inline anchored annotations are part of the Bible text flow.
      The browser reflows them automatically when screen width or font size
      changes, so no SVG re-render is needed.
    */
  }

  function scheduleRender() {
    render();
  }

  function getState() {
    /*
      State is intentionally stored in bibleTextHtml for this first reliable
      pass. This keeps the system parallel to the old SVG/freehand layer while
      making circle/square truly travel with the selected words.
    */
    return [];
  }

  function setState() {
    render();
  }

  window.AnchoredAnnotations = {
    createFromCurrentSelection,
    getState,
    setState,
    clear,
    render,
    scheduleRender
  };
})();
