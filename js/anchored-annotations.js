(() => {
  "use strict";

  const INLINE_CLASS = "anchored-inline-annotation";
  const SELECTED_CLASS = "anchored-inline-selected";
  const TYPE_CLASSES = {
    circle: "anchored-inline-circle",
    square: "anchored-inline-square",
    line: "anchored-inline-line",
    "arrow-left": "anchored-inline-arrow-left",
    "arrow-right": "anchored-inline-arrow-right",
    "arrow-both": "anchored-inline-arrow-both"
  };

  const TOOL_LABELS = {
    circle: "Circle",
    square: "Square",
    line: "Line",
    "arrow-left": "Arrow Left",
    "arrow-right": "Arrow Right",
    "arrow-both": "Arrow Both Directions"
  };

  const SUPPORTED_TYPES = new Set(Object.keys(TYPE_CLASSES));

  let savedSelectionOffsets = null;
  let selectedAnnotation = null;

  function getBibleText() {
    return document.getElementById("bible-text");
  }

  function getTextOffsetWithinElement(root, targetNode, targetOffset) {
    let offset = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const node = walker.currentNode;

      if (node === targetNode) {
        return offset + targetOffset;
      }

      offset += node.nodeValue.length;
    }

    return offset;
  }

  function getRangeFromTextOffsets(root, startOffset, endOffset) {
    const range = document.createRange();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    let currentOffset = 0;
    let startSet = false;
    let endSet = false;

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const nodeLength = node.nodeValue.length;
      const nodeStart = currentOffset;
      const nodeEnd = currentOffset + nodeLength;

      if (!startSet && startOffset >= nodeStart && startOffset <= nodeEnd) {
        range.setStart(node, startOffset - nodeStart);
        startSet = true;
      }

      if (!endSet && endOffset >= nodeStart && endOffset <= nodeEnd) {
        range.setEnd(node, endOffset - nodeStart);
        endSet = true;
        break;
      }

      currentOffset = nodeEnd;
    }

    return startSet && endSet ? range : null;
  }

  function isRangeInsideBibleText(range) {
    const bibleText = getBibleText();

    if (!bibleText || !range) {
      return false;
    }

    const startNode =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer
        : range.startContainer.parentElement;

    const endNode =
      range.endContainer.nodeType === Node.ELEMENT_NODE
        ? range.endContainer
        : range.endContainer.parentElement;

    return (
      startNode &&
      endNode &&
      bibleText.contains(startNode) &&
      bibleText.contains(endNode)
    );
  }

  function rememberCurrentSelection() {
    const bibleText = getBibleText();
    const selection = window.getSelection();

    if (!bibleText || !selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);

    if (range.collapsed || !isRangeInsideBibleText(range)) {
      return;
    }

    const start = getTextOffsetWithinElement(
      bibleText,
      range.startContainer,
      range.startOffset
    );
    const end = getTextOffsetWithinElement(
      bibleText,
      range.endContainer,
      range.endOffset
    );

    if (typeof start !== "number" || typeof end !== "number" || start === end) {
      return;
    }

    savedSelectionOffsets = {
      start: Math.min(start, end),
      end: Math.max(start, end),
      text: range.toString()
    };
  }

  function getLiveSelectionRangeInsideBibleText() {
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);

    if (range.collapsed || !isRangeInsideBibleText(range)) {
      return null;
    }

    return range.cloneRange();
  }

  function getSavedSelectionRangeInsideBibleText() {
    const bibleText = getBibleText();

    if (!bibleText || !savedSelectionOffsets) {
      return null;
    }

    const range = getRangeFromTextOffsets(
      bibleText,
      savedSelectionOffsets.start,
      savedSelectionOffsets.end
    );

    if (!range || range.collapsed) {
      return null;
    }

    return range;
  }

  function getSelectionRangeInsideBibleText() {
    rememberCurrentSelection();

    return (
      getLiveSelectionRangeInsideBibleText() ||
      getSavedSelectionRangeInsideBibleText()
    );
  }

  function unwrapElement(element) {
    const parent = element.parentNode;

    if (!parent) {
      return false;
    }

    if (selectedAnnotation === element) {
      selectedAnnotation = null;
    }

    while (element.firstChild) {
      parent.insertBefore(element.firstChild, element);
    }

    parent.removeChild(element);
    parent.normalize();

    return true;
  }

  function removeNestedAnchoredAnnotations(container) {
    container
      .querySelectorAll?.(`.${INLINE_CLASS}`)
      .forEach((element) => unwrapElement(element));
  }

  function getAnnotationColor(type) {
    if (type === "square") return "#0066cc";
    if (type === "line") return "#8a4b00";
    if (type.startsWith("arrow")) return "#174a8b";
    return "#c40000";
  }

  function applyInlineFallbackStyles(wrapper, type) {
    const color = getAnnotationColor(type);

    wrapper.style.position = "relative";
    wrapper.style.display = "inline";
    wrapper.style.color = "inherit";
    wrapper.style.background = "transparent";
    wrapper.style.border = "0";
    wrapper.style.padding = "0";
    wrapper.style.margin = "0";
    wrapper.style.boxShadow = "none";
    wrapper.style.borderRadius = "0";
    wrapper.style.textDecorationLine = "none";

    if (type === "circle" || type === "square") {
      wrapper.style.boxShadow = `0 0 0 1.8px ${color}`;
      wrapper.style.boxDecorationBreak = "clone";
      wrapper.style.webkitBoxDecorationBreak = "clone";
      wrapper.style.borderRadius = type === "circle" ? "999px" : "0.14em";
      return;
    }

    wrapper.style.textDecorationLine = "underline";
    wrapper.style.textDecorationColor = color;
    wrapper.style.textDecorationThickness = "2px";
    wrapper.style.textUnderlineOffset = "0.18em";
  }

  function createWrapper(type) {
    const wrapper = document.createElement("span");

    wrapper.classList.add(INLINE_CLASS, TYPE_CLASSES[type]);
    wrapper.dataset.anchoredAnnotationType = type;
    wrapper.dataset.anchoredAnnotationId =
      `anchored-inline-${type}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;

    applyInlineFallbackStyles(wrapper, type);

    return wrapper;
  }

  function clearSelectedVisualState() {
    document
      .querySelectorAll(`.${INLINE_CLASS}.${SELECTED_CLASS}`)
      .forEach((element) => {
        element.classList.remove(SELECTED_CLASS);
      });
  }

  function selectAnnotation(element) {
    if (!element || !element.classList?.contains(INLINE_CLASS)) {
      return false;
    }

    clearSelectedVisualState();
    selectedAnnotation = element;
    selectedAnnotation.classList.add(SELECTED_CLASS);

    return true;
  }

  function clearSelected() {
    if (!selectedAnnotation || !document.body.contains(selectedAnnotation)) {
      selectedAnnotation = null;
      return false;
    }

    const removed = unwrapElement(selectedAnnotation);
    selectedAnnotation = null;
    return removed;
  }

  function clearIntersectingRange(range) {
    const bibleText = getBibleText();

    if (!bibleText || !range || range.collapsed) {
      return false;
    }

    const matches = Array.from(
      bibleText.querySelectorAll(`.${INLINE_CLASS}`)
    ).filter((element) => {
      try {
        return range.intersectsNode(element);
      } catch (error) {
        return false;
      }
    });

    if (!matches.length) {
      return false;
    }

    matches.forEach((element) => unwrapElement(element));
    savedSelectionOffsets = null;
    selectedAnnotation = null;

    return true;
  }

  function clearIntersectingCurrentSelection() {
    return clearIntersectingRange(getSelectionRangeInsideBibleText());
  }

  function clearAtEventTarget(target) {
    const annotation = target?.closest?.(`.${INLINE_CLASS}`);

    if (!annotation) {
      return false;
    }

    return unwrapElement(annotation);
  }

  function createFromCurrentSelection(type) {
    if (!SUPPORTED_TYPES.has(type)) {
      return { created: false, reason: "unsupported-type" };
    }

    const range = getSelectionRangeInsideBibleText();

    if (!range) {
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

      savedSelectionOffsets = null;
      selectAnnotation(wrapper);

      return {
        created: true,
        annotation: {
          id: wrapper.dataset.anchoredAnnotationId,
          type,
          label: TOOL_LABELS[type] || type,
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

    savedSelectionOffsets = null;
    selectedAnnotation = null;
  }

  function render() {
    /*
      Inline anchored annotations are part of the Bible text flow.
      They do not need SVG recalculation.
    */
  }

  function scheduleRender() {
    render();
  }

  function getState() {
    /*
      State is stored directly inside bibleTextHtml.
    */
    return [];
  }

  function setState() {
    selectedAnnotation = null;
    render();
  }

  function initSelectionMemory() {
    document.addEventListener("selectionchange", rememberCurrentSelection);

    document.addEventListener(
      "mouseup",
      (event) => {
        const bibleText = getBibleText();

        if (bibleText && bibleText.contains(event.target)) {
          setTimeout(rememberCurrentSelection, 0);
        }
      },
      true
    );

    document.addEventListener(
      "keyup",
      (event) => {
        const bibleText = getBibleText();

        if (bibleText && bibleText.contains(event.target)) {
          rememberCurrentSelection();
        }
      },
      true
    );

    document.addEventListener(
      "touchend",
      (event) => {
        const bibleText = getBibleText();

        if (bibleText && bibleText.contains(event.target)) {
          setTimeout(rememberCurrentSelection, 80);
        }
      },
      true
    );

    document.addEventListener(
      "click",
      (event) => {
        const annotation =
          event.target?.closest?.(`.${INLINE_CLASS}`);

        if (annotation) {
          selectAnnotation(annotation);
          window.clearSavedBibleSelection?.();
          return;
        }

        if (!event.target?.closest?.("#bible-mini-toolbar")) {
          clearSelectedVisualState();
          selectedAnnotation = null;
        }
      },
      true
    );
  }

  window.AnchoredAnnotations = {
    createFromCurrentSelection,
    rememberCurrentSelection,
    clearSelected,
    clearIntersectingCurrentSelection,
    clearIntersectingRange,
    clearAtEventTarget,
    getState,
    setState,
    clear,
    render,
    scheduleRender
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSelectionMemory, {
      once: true
    });
  } else {
    initSelectionMemory();
  }
})();
