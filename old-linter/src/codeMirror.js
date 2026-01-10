/**
 * Code Mirror
 * Local storage for Kaggle notebook cells to handle lazy loading
 * Stores cell code locally and synchronizes with user edits
 * Ensures linting works even when Kaggle unloads far-away cells
 */

const CodeMirror = (function () {
  "use strict";

  const DEBUG = false;

  function log(...args) {
    if (DEBUG) {
      console.log("[CodeMirror]", ...args);
    }
  }

  // Local storage for cell code
  // Map: cellId (uuid or index) -> { code: string, lastUpdated: number }
  const cellStore = new Map();

  /**
   * Generates a unique ID for a cell
   * Prefers UUID if available, falls back to index
   * @param {number} cellIndex - Cell index in the notebook
   * @param {string|null} uuid - Cell UUID from Kaggle
   * @returns {string}
   */
  function getCellId(cellIndex, uuid) {
    return uuid || `cell-${cellIndex}`;
  }

  /**
   * Updates or creates a cell in the local store
   * @param {number} cellIndex - Cell index
   * @param {string|null} uuid - Cell UUID
   * @param {string} code - Cell code content
   * @returns {boolean} - True if code changed, false if unchanged
   */
  function updateCell(cellIndex, uuid, code) {
    const cellId = getCellId(cellIndex, uuid);
    const existing = cellStore.get(cellId);

    if (existing && existing.code === code) {
      // Code unchanged, skip update
      return false;
    }

    cellStore.set(cellId, {
      code: code,
      cellIndex: cellIndex,
      uuid: uuid,
      lastUpdated: Date.now(),
    });

    log(`📝 Updated cell ${cellId}: ${code.length} chars`);
    return true;
  }

  /**
   * Gets cell code from local store
   * @param {number} cellIndex - Cell index
   * @param {string|null} uuid - Cell UUID
   * @returns {{code: string, cellIndex: number, uuid: string|null}|null}
   */
  function getCell(cellIndex, uuid) {
    const cellId = getCellId(cellIndex, uuid);
    const cell = cellStore.get(cellId);
    return cell || null;
  }

  /**
   * Gets all stored cells in order
   * @returns {Array<{code: string, cellIndex: number, uuid: string|null}>}
   */
  function getAllCells() {
    const cells = Array.from(cellStore.values());
    // Sort by cellIndex
    cells.sort((a, b) => a.cellIndex - b.cellIndex);
    return cells.map(({ code, cellIndex, uuid }) => ({ code, cellIndex, uuid }));
  }

  /**
   * Synchronizes cells from extracted data
   * Updates local store with any changes detected
   * @param {Array<{code: string, cellIndex: number, uuid: string|null}>} extractedCells
   * @returns {{updated: number, added: number, total: number}}
   */
  function syncCells(extractedCells) {
    let updated = 0;
    let added = 0;

    extractedCells.forEach((cell) => {
      const cellId = getCellId(cell.cellIndex, cell.uuid);
      const existing = cellStore.get(cellId);

      if (!existing) {
        added++;
      } else if (existing.code !== cell.code) {
        updated++;
      }

      updateCell(cell.cellIndex, cell.uuid, cell.code);
    });

    const stats = {
      updated,
      added,
      total: cellStore.size,
    };

    if (updated > 0 || added > 0) {
      log(`🔄 Synced: ${added} added, ${updated} updated, ${stats.total} total`);
    }

    return stats;
  }

  /**
   * Merges extracted cells with stored cells
   * Prefers extracted (fresh) data for visible cells,
   * uses stored data for cells that may have been unloaded
   * @param {Array<{code: string, cellIndex: number, uuid: string|null}>} extractedCells
   * @returns {Array<{code: string, cellIndex: number, uuid: string|null}>}
   */
  function getMergedCells(extractedCells) {
    // First, sync the extracted cells to update our store
    syncCells(extractedCells);

    // Build a map of extracted cells by their ID for quick lookup
    const extractedMap = new Map();
    extractedCells.forEach((cell) => {
      const cellId = getCellId(cell.cellIndex, cell.uuid);
      extractedMap.set(cellId, cell);
    });

    // Get all cells from store
    const allCells = getAllCells();

    // For each stored cell, use extracted version if available (it's fresher)
    // Otherwise use stored version (cell may be unloaded)
    const mergedCells = allCells.map((storedCell) => {
      const cellId = getCellId(storedCell.cellIndex, storedCell.uuid);
      const extracted = extractedMap.get(cellId);

      if (extracted) {
        // Use extracted version - it's the current state from DOM
        return extracted;
      } else {
        // Cell not in extracted data - may be unloaded, use stored version
        log(`📂 Using stored version for cell ${cellId} (not in DOM)`);
        return storedCell;
      }
    });

    return mergedCells;
  }

  /**
   * Removes a cell from the store
   * @param {number} cellIndex - Cell index
   * @param {string|null} uuid - Cell UUID
   */
  function removeCell(cellIndex, uuid) {
    const cellId = getCellId(cellIndex, uuid);
    cellStore.delete(cellId);
    log(`🗑️ Removed cell ${cellId}`);
  }

  /**
   * Clears all stored cells
   */
  function clear() {
    cellStore.clear();
    log("🧹 Cleared all stored cells");
  }

  /**
   * Gets the count of stored cells
   * @returns {number}
   */
  function getCellCount() {
    return cellStore.size;
  }

  /**
   * Checks if a cell exists in the store
   * @param {number} cellIndex - Cell index
   * @param {string|null} uuid - Cell UUID
   * @returns {boolean}
   */
  function hasCell(cellIndex, uuid) {
    const cellId = getCellId(cellIndex, uuid);
    return cellStore.has(cellId);
  }

  /**
   * Detects deleted cells by comparing with extracted cells
   * and removes them from the store
   * @param {Array<{code: string, cellIndex: number, uuid: string|null}>} extractedCells
   * @param {number} expectedCellCount - Expected total number of cells in notebook
   * @returns {number} - Number of cells removed
   */
  function cleanupDeletedCells(extractedCells, expectedCellCount) {
    // If we have significantly more stored cells than expected,
    // some cells were probably deleted
    if (cellStore.size <= expectedCellCount) {
      return 0;
    }

    // Build a set of extracted cell IDs
    const extractedIds = new Set();
    extractedCells.forEach((cell) => {
      extractedIds.add(getCellId(cell.cellIndex, cell.uuid));
    });

    // Find cells in store that are no longer in extracted data
    // and have high indices (likely deleted)
    const toRemove = [];
    cellStore.forEach((cell, cellId) => {
      if (!extractedIds.has(cellId) && cell.cellIndex >= expectedCellCount) {
        toRemove.push(cellId);
      }
    });

    toRemove.forEach((cellId) => cellStore.delete(cellId));

    if (toRemove.length > 0) {
      log(`🧹 Cleaned up ${toRemove.length} deleted cells`);
    }

    return toRemove.length;
  }

  return {
    updateCell,
    getCell,
    getAllCells,
    syncCells,
    getMergedCells,
    removeCell,
    clear,
    getCellCount,
    hasCell,
    cleanupDeletedCells,
    getCellId,
  };
})();

if (typeof window !== "undefined") {
  window.CodeMirror = CodeMirror;
}
