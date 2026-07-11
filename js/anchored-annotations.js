(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const LAYER_ID = "bible-anchored-annotation-layer";
  const PREFIX_SUFFIX_LENGTH = 70;
  const RESIZE_RENDER_DELAY = 80;

  let annotations = [];
  let renderTimer = null;
  let resizeObserver = null;

  function getBibleText() {
    return document.getElementById("bible-text");
  }

  function getDrawingArea() {
    return document.getElementById("bible-drawing-area");
  }

  function createId(type) {
    return `anchored-${type}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
  }

  function cloneAnnotation(annotation) {
    return JSON.parse(JSON.stringify(annotation));
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

    const commonAncestor =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;

    if (!commonAncestor || !bibleText.contains(commonAncestor)) {
      return null;
    }

    return range.cloneRange();
  }

  function captureAnchorFromRange(range) {
    const bibleText = getBibleText();

    if (!bibleText || !range) {
      return null;
    }

    const exact = range.toString();

    if (!exact || exact.trim().length === 0) {
      return null;
    }

    const fullText = bibleText.textContent || "";
    const startOffset = getTextOffsetWithinElement(
      bibleText,
      range.startContainer,
      range.startOffset
    );
    const endOffset = getTextOffsetWithinElement(
      bibleText,
      range.endContainer,
      range.endOffset
    );

    return {
      exact,
      startOffset,
      endOffset,
      prefix: fullText.slice(
        Math.max(0, startOffset - PREFIX_SUFFIX_LENGTH),
        startOffset
      ),
      suffix: fullText.slice(
        endOffset,
        Math.min(fullText.length, endOffset + PREFIX_SUFFIX_LENGTH)
      )
    };
  }

  function scoreAnchorMatch(fullText, candidateStart, anchor) {
    const candidateEnd = candidateStart + anchor.exact.length;
    let score = 0;

    if (
      typeof anchor.startOffset === "number" &&
      candidateStart === anchor.startOffset
    ) {
      score += 1000;
    }

    if (anchor.prefix) {
      const before = fullText.slice(
        Math.max(0, candidateStart - anchor.prefix.length),
        candidateStart
      );

      if (before === anchor.prefix) {
        score += 500;
      } else if (before.endsWith(anchor.prefix.slice(-24))) {
        score += 150;
      }
    }

    if (anchor.suffix) {
      const after = fullText.slice(
        candidateEnd,
        candidateEnd + anchor.suffix.length
      );

      if (after === anchor.suffix) {
        score += 500;
      } else if (after.startsWith(anchor.suffix.slice(0, 24))) {
        score += 150;
      }
    }

    if (typeof anchor.startOffset === "number") {
      score -= Math.abs(candidateStart - anchor.startOffset) / 20;
    }

    return score;
  }

  function resolveAnchorToRange(anchor) {
    const bibleText = getBibleText();

    if (!bibleText || !anchor || !anchor.exact) {
      return null;
    }

    const fullText = bibleText.textContent || "";

    if (
      typeof anchor.startOffset === "number" &&
      typeof anchor.endOffset === "number" &&
      fullText.slice(anchor.startOffset, anchor.endOffset) === anchor.exact
    ) {
      return getRangeFromTextOffsets(
        bibleText,
        anchor.startOffset,
        anchor.endOffset
      );
    }

    const candidates = [];
    let searchIndex = 0;

    while (searchIndex <= fullText.length) {
      const foundIndex = fullText.indexOf(anchor.exact, searchIndex);

      if (foundIndex === -1) {
        break;
      }

      candidates.push(foundIndex);
      searchIndex = foundIndex + Math.max(anchor.exact.length, 1);
    }

    if (!candidates.length) {
      return null;
    }

    const bestStart = candidates
      .map((candidateStart) => ({
        start: candidateStart,
        score: scoreAnchorMatch(fullText, candidateStart, anchor)
      }))
      .sort((a, b) => b.score - a.score)[0].start;

    return getRangeFromTextOffsets(
      bibleText,
      bestStart,
      bestStart + anchor.exact.length
    );
  }

  function ensureLayer() {
    const drawingArea = getDrawingArea();

    if (!drawingArea) {
      return null;
    }

    let layer = document.getElementById(LAYER_ID);

    if (!layer) {
      layer = document.createElementNS(SVG_NS, "svg");
      layer.id = LAYER_ID;
      layer.setAttribute("aria-hidden", "true");
      drawingArea.appendChild(layer);
    }

    syncLayerSize(layer);
    return layer;
  }

  function syncLayerSize(layer) {
    const drawingArea = getDrawingArea();
    const bibleText = getBibleText();

    if (!drawingArea || !layer) {
      return;
    }

    const drawingRect = drawingArea.getBoundingClientRect();
    const bibleRect = bibleText?.getBoundingClientRect();

    /*
      Important:
      Do not use drawingArea.scrollWidth here.

      The anchored SVG layer itself can make scrollWidth stay at an older
      desktop size after the screen becomes narrower. That causes the SVG
      viewBox to scale the old desktop coordinates down on mobile, which makes
      the circle appear around the wrong word.

      The layer must match the current visible layout box, then every render
      recalculates the annotation from the current DOM Range.
    */
    const width = Math.max(
      1,
      Math.ceil(drawingRect.width)
    );

    const textBottom = bibleRect
      ? bibleRect.bottom - drawingRect.top
      : 0;

    const height = Math.max(
      1,
      Math.ceil(drawingRect.height),
      Math.ceil(textBottom),
      drawingArea.clientHeight
    );

    layer.setAttribute("width", width);
    layer.setAttribute("height", height);
    layer.setAttribute("viewBox", `0 0 ${width} ${height}`);

    layer.style.width = `${width}px`;
    layer.style.height = `${height}px`;
  }

  function getUsefulClientRects(range) {
    const drawingArea = getDrawingArea();
    const bibleText = getBibleText();

    if (!drawingArea || !bibleText || !range) {
      return [];
    }

    const drawingRect = drawingArea.getBoundingClientRect();
    const bibleRect = bibleText.getBoundingClientRect();

    return Array.from(range.getClientRects())
      .filter((rect) => rect.width > 1 && rect.height > 1)
      .map((rect) => ({
        x: rect.left - drawingRect.left,
        y: rect.top - drawingRect.top,
        width: rect.width,
        height: rect.height,
        originalLeft: rect.left,
        originalRight: rect.right,
        originalTop: rect.top,
        originalBottom: rect.bottom
      }))
      .filter((rect) => {
        const overlapsHorizontally =
          rect.originalRight >= bibleRect.left &&
          rect.originalLeft <= bibleRect.right;
        const overlapsVertically =
          rect.originalBottom >= bibleRect.top &&
          rect.originalTop <= bibleRect.bottom;

        return overlapsHorizontally && overlapsVertically;
      });
  }

  function drawEllipseForRect(group, rect, annotation) {
    const paddingX = annotation.style?.paddingX ?? 8;
    const paddingY = annotation.style?.paddingY ?? 5;

    const ellipse = document.createElementNS(SVG_NS, "ellipse");

    ellipse.setAttribute("cx", rect.x + rect.width / 2);
    ellipse.setAttribute("cy", rect.y + rect.height / 2);
    ellipse.setAttribute("rx", rect.width / 2 + paddingX);
    ellipse.setAttribute("ry", rect.height / 2 + paddingY);

    group.appendChild(ellipse);
  }

  function drawSquareForRect(group, rect, annotation) {
    const paddingX = annotation.style?.paddingX ?? 6;
    const paddingY = annotation.style?.paddingY ?? 4;

    const square = document.createElementNS(SVG_NS, "rect");

    square.setAttribute("x", rect.x - paddingX);
    square.setAttribute("y", rect.y - paddingY);
    square.setAttribute("width", rect.width + paddingX * 2);
    square.setAttribute("height", rect.height + paddingY * 2);
    square.setAttribute("rx", 4);
    square.setAttribute("ry", 4);

    group.appendChild(square);
  }

  function renderAnnotation(layer, annotation) {
    const range = resolveAnchorToRange(annotation.anchor);
    const rects = getUsefulClientRects(range);

    if (!rects.length) {
      return;
    }

    const group = document.createElementNS(SVG_NS, "g");
    group.classList.add(
      "anchored-annotation",
      `anchored-annotation-${annotation.type}`
    );
    group.dataset.annotationId = annotation.id || "";
    group.dataset.annotationType = annotation.type || "";

    if (annotation.style?.color) {
      group.style.setProperty(
        "--anchored-annotation-color",
        annotation.style.color
      );
    }

    rects.forEach((rect) => {
      if (annotation.type === "circle") {
        drawEllipseForRect(group, rect, annotation);
      } else if (annotation.type === "square") {
        drawSquareForRect(group, rect, annotation);
      }
    });

    layer.appendChild(group);
  }

  function render() {
    const layer = ensureLayer();

    if (!layer) {
      return;
    }

    syncLayerSize(layer);
    layer.innerHTML = "";

    annotations.forEach((annotation) => {
      renderAnnotation(layer, annotation);
    });
  }

  function scheduleRender() {
    clearTimeout(renderTimer);

    renderTimer = setTimeout(() => {
      render();
    }, RESIZE_RENDER_DELAY);
  }

  function createFromCurrentSelection(type) {
    if (type !== "circle" && type !== "square") {
      return { created: false, reason: "unsupported-type" };
    }

    const range = getSelectionRangeInsideBibleText();
    const anchor = captureAnchorFromRange(range);

    if (!anchor) {
      return { created: false, reason: "no-selection" };
    }

    const annotation = {
      id: createId(type),
      version: 1,
      type,
      anchor,
      style: {
        color: type === "circle" ? "#c40000" : "#0066cc",
        strokeWidth: 2
      },
      createdAt: new Date().toISOString()
    };

    annotations.push(annotation);
    render();

    return {
      created: true,
      annotation: cloneAnnotation(annotation)
    };
  }

  function getState() {
    return annotations.map(cloneAnnotation);
  }

  function setState(nextAnnotations) {
    annotations = Array.isArray(nextAnnotations)
      ? nextAnnotations
          .filter((annotation) => {
            return (
              annotation &&
              (annotation.type === "circle" || annotation.type === "square") &&
              annotation.anchor &&
              annotation.anchor.exact
            );
          })
          .map(cloneAnnotation)
      : [];

    scheduleRender();
  }

  function clear() {
    annotations = [];
    render();
  }

  function init() {
    scheduleRender();

    window.addEventListener("resize", scheduleRender);
    window.addEventListener("orientationchange", scheduleRender);
    window.addEventListener("load", scheduleRender);

    if (document.fonts?.ready) {
      document.fonts.ready.then(scheduleRender).catch(() => {});
    }

    const drawingArea = getDrawingArea();

    if (drawingArea && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(scheduleRender);
      resizeObserver.observe(drawingArea);
    }

    const bibleText = getBibleText();

    if (bibleText && typeof MutationObserver !== "undefined") {
      const textObserver = new MutationObserver(scheduleRender);
      textObserver.observe(bibleText, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true
      });
    }
  }

  window.AnchoredAnnotations = {
    createFromCurrentSelection,
    getState,
    setState,
    clear,
    render,
    scheduleRender,
    init
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
