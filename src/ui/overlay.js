/**
 * Lint Overlay UI
 * Displays lint errors in the Kaggle notebook interface
 */

const LintOverlay = (function () {
  "use strict";

  let overlayContainer = null;
  let isVisible = true;
  let currentTheme = "light";

  const SEVERITY_ICONS = {
    error: "❌",
    warning: "⚠️",
    info: "ℹ️",
  };

  /**
   * Creates the main overlay container
   */
  function createOverlay() {
    if (overlayContainer) {
      return overlayContainer;
    }

    overlayContainer = document.createElement("div");
    overlayContainer.id = "kaggle-lint-overlay";
    overlayContainer.className = `kaggle-lint-overlay kaggle-lint-theme-${currentTheme}`;

    const header = document.createElement("div");
    header.className = "kaggle-lint-header";

    const title = document.createElement("span");
    title.className = "kaggle-lint-title";
    title.textContent = "🔍 Python Linter";

    const controls = document.createElement("div");
    controls.className = "kaggle-lint-controls";

    const refreshBtn = document.createElement("button");
    refreshBtn.className = "kaggle-lint-btn";
    refreshBtn.textContent = "🔄";
    refreshBtn.title = "Refresh lint";
    refreshBtn.onclick = () => {
      if (typeof runLinter === "function") {
        runLinter();
      }
    };

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "kaggle-lint-btn";
    toggleBtn.textContent = "−";
    toggleBtn.title = "Minimize";
    toggleBtn.onclick = () => toggleMinimize(toggleBtn);

    const closeBtn = document.createElement("button");
    closeBtn.className = "kaggle-lint-btn kaggle-lint-close";
    closeBtn.textContent = "×";
    closeBtn.title = "Close";
    closeBtn.onclick = hideOverlay;

    controls.appendChild(refreshBtn);
    controls.appendChild(toggleBtn);
    controls.appendChild(closeBtn);

    header.appendChild(title);
    header.appendChild(controls);

    const content = document.createElement("div");
    content.className = "kaggle-lint-content";
    content.id = "kaggle-lint-content";

    overlayContainer.appendChild(header);
    overlayContainer.appendChild(content);

    document.body.appendChild(overlayContainer);

    makeDraggable(overlayContainer, header);

    return overlayContainer;
  }

  /**
   * Makes an element draggable
   * @param {Element} element - Element to make draggable
   * @param {Element} handle - Drag handle element
   */
  function makeDraggable(element, handle) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    handle.style.cursor = "move";

    handle.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") {
        return;
      }
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = element.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) {
        return;
      }
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      element.style.left = startLeft + deltaX + "px";
      element.style.top = startTop + deltaY + "px";
      element.style.right = "auto";
      element.style.bottom = "auto";
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });
  }

  /**
   * Toggles minimize state
   * @param {Element} btn - Toggle button
   */
  function toggleMinimize(btn) {
    const content = document.getElementById("kaggle-lint-content");
    const overlay = document.querySelector(".kaggle-lint-overlay");
    const title = document.querySelector(".kaggle-lint-title");
    if (content.style.display === "none") {
      content.style.display = "block";
      overlay.style.width = "400px";
      title.style.display = "inline";
      btn.textContent = "−";
      btn.title = "Minimize";
    } else {
      content.style.display = "none";
      overlay.style.width = "auto";
      title.style.display = "none";
      btn.textContent = "+";
      btn.title = "Expand";
    }
  }

  /**
   * Shows the overlay
   */
  function showOverlay() {
    createOverlay();
    overlayContainer.style.display = "block";
    isVisible = true;
  }

  /**
   * Hides the overlay
   */
  function hideOverlay() {
    if (overlayContainer) {
      overlayContainer.style.display = "none";
      isVisible = false;
    }
  }

  /**
   * Updates the theme
   * @param {'light'|'dark'} theme
   */
  function setTheme(theme) {
    currentTheme = theme;
    if (overlayContainer) {
      overlayContainer.className = `kaggle-lint-overlay kaggle-lint-theme-${theme}`;
    }
  }

  /**
   * Displays lint errors in the overlay
   * @param {Array} errors - Lint errors
   * @param {Object} stats - Error statistics
   */
  function displayErrors(errors, stats) {
    createOverlay();
    const content = document.getElementById("kaggle-lint-content");

    let html = '<div class="kaggle-lint-summary">';
    html += `<span class="kaggle-lint-stat kaggle-lint-error">${
      SEVERITY_ICONS.error
    } ${stats.bySeverity.error || 0}</span>`;
    html += `<span class="kaggle-lint-stat kaggle-lint-warning">${
      SEVERITY_ICONS.warning
    } ${stats.bySeverity.warning || 0}</span>`;
    html += `<span class="kaggle-lint-stat kaggle-lint-info">${
      SEVERITY_ICONS.info
    } ${stats.bySeverity.info || 0}</span>`;
    html += "</div>";

    if (errors.length === 0) {
      html += '<div class="kaggle-lint-success">✅ No issues found!</div>';
    } else {
      html += '<ul class="kaggle-lint-errors">';
      errors.forEach((error, idx) => {
        const severityClass = `kaggle-lint-severity-${error.severity}`;
        html += `<li class="kaggle-lint-error-item ${severityClass}" data-error-index="${idx}">`;
        html += `<span class="kaggle-lint-icon">${
          SEVERITY_ICONS[error.severity]
        }</span>`;
        html += `<span class="kaggle-lint-location">Cell ${
          error.cellIndex + 1
        }:${error.cellLine}</span>`;
        html += `<span class="kaggle-lint-message">${escapeHtml(
          error.msg
        )}</span>`;
        html += `<span class="kaggle-lint-rule">[${error.rule}]</span>`;
        html += "</li>";
      });
      html += "</ul>";
    }

    content.innerHTML = html;

    const errorItems = content.querySelectorAll(".kaggle-lint-error-item");
    errorItems.forEach((item, idx) => {
      item.addEventListener("click", () => {
        scrollToError(errors[idx]);
      });
    });
  }

  /**
   * Scrolls to the cell containing an error
   * @param {Object} error - Error object with element reference
   */
  function scrollToError(error) {
    if (error.element) {
      error.element.scrollIntoView({ behavior: "smooth", block: "center" });
      highlightCell(error.element);
    }
  }

  /**
   * Temporarily highlights a cell
   * @param {Element} element - Cell element
   */
  function highlightCell(element) {
    element.classList.add("kaggle-lint-highlight");
    setTimeout(() => {
      element.classList.remove("kaggle-lint-highlight");
    }, 2000);
  }

  /**
   * Error line
   */
  function scrollToErrorLine(hexColor, countOfErrors) {
    if (countOfErrors === 0) {
      return "";
    }
    return `<span style="color: #333333;"><span style="color: ${hexColor};">●</span> ${countOfErrors}</span>`;
  }

  /**
   * Adds inline markers to cells (errors or success)
   * @param {Array} errors - Lint errors
   * @param {Array} allCells - All notebook cells
   */
  function addInlineMarkers(errors, allCells = []) {
    removeInlineMarkers();

    const errorsByCell = new Map();
    errors.forEach((error) => {
      if (!errorsByCell.has(error.cellIndex)) {
        errorsByCell.set(error.cellIndex, []);
      }
      errorsByCell.get(error.cellIndex).push(error);
    });

    // Add error markers for cells with errors
    errorsByCell.forEach((cellErrors, cellIndex) => {
      const firstError = cellErrors[0];
      if (!firstError.element) {
        return;
      }

      const marker = document.createElement("div");
      marker.className = "kaggle-lint-inline-marker";

      const counts = { error: 0, warning: 0, info: 0 };
      cellErrors.forEach((e) => counts[e.severity]++);

      let markerHtml = "";
      markerHtml += `${scrollToErrorLine("#f48771", counts.error)}`;
      markerHtml += `${scrollToErrorLine("#deb887", counts.warning)}`;
      markerHtml += `${scrollToErrorLine("#6a9fb5", counts.info)}`;

      marker.innerHTML = markerHtml;

      const tooltip = document.createElement("div");
      tooltip.className = "kaggle-lint-tooltip";
      tooltip.innerHTML = cellErrors
        .map(
          (e) =>
            `<div class="kaggle-lint-tooltip-item kaggle-lint-severity-${
              e.severity
            }">
          ${SEVERITY_ICONS[e.severity]} Line ${e.cellLine}: ${escapeHtml(e.msg)}
        </div>`
        )
        .join("");

      marker.appendChild(tooltip);

      marker.addEventListener("mouseenter", () => {
        tooltip.style.display = "block";
      });
      marker.addEventListener("mouseleave", () => {
        tooltip.style.display = "none";
      });

      firstError.element.style.position = "relative";
      firstError.element.appendChild(marker);
    });

    // Add success checkmarks for cells without errors
    allCells.forEach((cell, index) => {
      if (!errorsByCell.has(index) && cell) {
        const marker = document.createElement("div");
        marker.className = "kaggle-lint-inline-marker kaggle-lint-no-errors";
        marker.innerHTML = "<span>✓ No errors</span>";

        const tooltip = document.createElement("div");
        tooltip.className = "kaggle-lint-tooltip";
        tooltip.textContent = "No issues detected in this cell";
        tooltip.style.minWidth = "180px";

        marker.appendChild(tooltip);

        marker.addEventListener("mouseenter", () => {
          tooltip.style.display = "block";
        });
        marker.addEventListener("mouseleave", () => {
          tooltip.style.display = "none";
        });

        cell.style.position = "relative";
        cell.appendChild(marker);
      }
    });
  }

  /**
   * Removes all inline markers
   */
  function removeInlineMarkers() {
    document
      .querySelectorAll(".kaggle-lint-inline-marker")
      .forEach((el) => el.remove());
  }

  /**
   * Escapes HTML special characters
   * @param {string} text
   * @returns {string}
   */
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Checks if overlay is currently visible
   * @returns {boolean}
   */
  function isOverlayVisible() {
    return isVisible;
  }

  return {
    createOverlay,
    showOverlay,
    hideOverlay,
    setTheme,
    displayErrors,
    addInlineMarkers,
    removeInlineMarkers,
    scrollToError,
    isOverlayVisible,
  };
})();

if (typeof window !== "undefined") {
  window.LintOverlay = LintOverlay;
}
