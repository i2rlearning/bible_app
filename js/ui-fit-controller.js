"use strict";

// ============================================================================
// Shared responsive fit controller
//
// Use this utility when a component should change modes because its actual
// contents no longer fit in the available component width. It measures the
// component itself rather than relying on viewport breakpoints.
//
// Component files remain responsible for defining their own modes and visual
// behavior. This file owns only the shared measuring, ResizeObserver,
// scheduling, fit-margin, and restore-hysteresis logic.
// ============================================================================

(function (global) {
  function measureNaturalWidth(element) {
    if (!element || !global.document?.body) {
      return Number(element?.scrollWidth) || 0;
    }

    const clone = element.cloneNode(true);
    const sourceControls = element.querySelectorAll?.("input, select, textarea") || [];
    const cloneControls = clone.querySelectorAll?.("input, select, textarea") || [];

    sourceControls.forEach((source, index) => {
      const target = cloneControls[index];
      if (!target) return;

      if (source instanceof global.HTMLSelectElement) {
        target.selectedIndex = source.selectedIndex;
        target.value = source.value;
      } else {
        target.value = source.value;
      }
    });

    clone.setAttribute("aria-hidden", "true");
    Object.assign(clone.style, {
      position: "fixed",
      left: "-100000px",
      top: "0",
      visibility: "hidden",
      pointerEvents: "none",
      width: "max-content",
      minWidth: "max-content",
      maxWidth: "none",
      height: "auto",
      flex: "none",
      transform: "none",
      whiteSpace: "nowrap"
    });

    global.document.body.appendChild(clone);
    const width = clone.getBoundingClientRect().width;
    clone.remove();

    return Math.ceil(width);
  }

  function isElementWrapped(element, tolerance = 1.35) {
    if (!element || !element.isConnected || element.hidden) return false;

    const rect = element.getBoundingClientRect();
    if (rect.height <= 0) return false;

    const style = global.getComputedStyle(element);
    const fontSize = Number.parseFloat(style.fontSize) || 16;
    const parsedLineHeight = Number.parseFloat(style.lineHeight);
    const singleLineHeight = Number.isFinite(parsedLineHeight)
      ? parsedLineHeight
      : fontSize * 1.2;

    return rect.height > singleLineHeight * tolerance;
  }

  function createResponsiveFitController({
    measureElement,
    observeElement = measureElement,
    mutationElement = observeElement,
    modes,
    applyMode,
    isEnabled = () => true,
    getRequiredWidth = null,
    doesFit = null,
    fitMargin = 0,
    restoreMargin = 24,
    observeMutations = false
  }) {
    if (
      !measureElement ||
      !Array.isArray(modes) ||
      !modes.length ||
      typeof applyMode !== "function"
    ) {
      return null;
    }

    let currentIndex = 0;
    let frame = 0;
    let resizeObserver = null;
    let mutationObserver = null;
    const failedAtWidth = new Array(modes.length).fill(0);

    function setMode(index) {
      const safeIndex = Math.max(0, Math.min(index, modes.length - 1));
      currentIndex = safeIndex;
      applyMode(modes[safeIndex], safeIndex);
    }

    function fits() {
      if (!measureElement || measureElement.clientWidth <= 0) return true;

      if (typeof doesFit === "function") {
        return Boolean(doesFit(measureElement));
      }

      if (typeof getRequiredWidth === "function") {
        const requiredWidth = Number(getRequiredWidth(measureElement)) || 0;
        return requiredWidth <= Math.max(0, measureElement.clientWidth - fitMargin);
      }

      // For layouts with CSS minimum column sizes, scrollWidth only becomes
      // larger than clientWidth when the richer mode genuinely cannot fit.
      return measureElement.scrollWidth <= measureElement.clientWidth + 1;
    }

    function update() {
      frame = 0;

      if (
        !measureElement.isConnected ||
        measureElement.clientWidth <= 0 ||
        !isEnabled()
      ) {
        return;
      }

      const startingIndex = currentIndex;
      const availableWidth = measureElement.clientWidth;

      for (let index = 0; index < modes.length; index += 1) {
        setMode(index);

        // If this richer mode recently failed, wait for a little extra room
        // before restoring it. This prevents rapid mode flipping at the edge.
        if (
          index < startingIndex &&
          failedAtWidth[index] > 0 &&
          availableWidth < failedAtWidth[index] + restoreMargin
        ) {
          continue;
        }

        if (index === modes.length - 1 || fits()) {
          if (index < startingIndex) failedAtWidth[index] = 0;
          return;
        }

        failedAtWidth[index] = availableWidth;
      }
    }

    function schedule() {
      if (frame) return;
      frame = global.requestAnimationFrame(update);
    }

    function destroy() {
      if (frame) {
        global.cancelAnimationFrame(frame);
        frame = 0;
      }

      resizeObserver?.disconnect();
      resizeObserver = null;
      mutationObserver?.disconnect();
      mutationObserver = null;
    }

    if (global.ResizeObserver && observeElement) {
      resizeObserver = new global.ResizeObserver(schedule);
      resizeObserver.observe(observeElement);
    }

    if (observeMutations && global.MutationObserver && mutationElement) {
      mutationObserver = new global.MutationObserver(schedule);
      mutationObserver.observe(mutationElement, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }

    schedule();

    return {
      schedule,
      update,
      destroy,
      getMode: () => modes[currentIndex]
    };
  }

  global.UIFitController = {
    ...(global.UIFitController || {}),
    createResponsiveFitController,
    measureNaturalWidth,
    isElementWrapped
  };
})(window);
