/**
 * CodeMirrorManager
 * Local storage for Kaggle notebook cells to handle lazy loading
 * Stores cell code locally and synchronizes with user edits
 * 
 * MIGRATION NOTE: Logic copied verbatim from old-linter/src/codeMirror.js
 * Only converted to TypeScript class format
 */

interface StoredCell {
  code: string;
  cellIndex: number;
  uuid: string | null;
  lastUpdated: number;
}

export class CodeMirrorManager {
  private DEBUG = false;
  private cellStore = new Map<string, StoredCell>();

  private log(...args: any[]): void {
    if (this.DEBUG) {
      console.log('[CodeMirror]', ...args);
    }
  }

  /**
   * Generates a unique ID for a cell
   * EXACT COPY from old-linter/src/codeMirror.js getCellId function
   */
  private getCellId(cellIndex: number, uuid: string | null): string {
    return uuid || `cell-${cellIndex}`;
  }

  /**
   * Updates or creates a cell in the local store
   * EXACT COPY from old-linter/src/codeMirror.js updateCell function
   */
  updateCell(cellIndex: number, uuid: string | null, code: string): boolean {
    const cellId = this.getCellId(cellIndex, uuid);
    const existing = this.cellStore.get(cellId);

    if (existing && existing.code === code) {
      // Code unchanged, skip update
      return false;
    }

    this.cellStore.set(cellId, {
      code: code,
      cellIndex: cellIndex,
      uuid: uuid,
      lastUpdated: Date.now(),
    });

    this.log(`📝 Updated cell ${cellId}: ${code.length} chars`);
    return true;
  }

  /**
   * Gets cell code from local store
   * EXACT COPY from old-linter/src/codeMirror.js getCell function
   */
  getCell(cellIndex: number, uuid: string | null): StoredCell | null {
    const cellId = this.getCellId(cellIndex, uuid);
    const cell = this.cellStore.get(cellId);
    return cell || null;
  }

  /**
   * Gets all stored cells in order
   * EXACT COPY from old-linter/src/codeMirror.js getAllCells function
   */
  getAllCells(): Array<{ code: string; cellIndex: number; uuid: string | null }> {
    const cells = Array.from(this.cellStore.values());
    // Sort by cellIndex
    cells.sort((a, b) => a.cellIndex - b.cellIndex);
    return cells.map(({ code, cellIndex, uuid }) => ({ code, cellIndex, uuid }));
  }

  /**
   * Synchronizes cells from extracted data
   * EXACT COPY from old-linter/src/codeMirror.js syncCells function
   */
  syncCells(extractedCells: Array<{ code: string; cellIndex: number; uuid?: string | null }>): {
    updated: number;
    added: number;
    total: number;
  } {
    let updated = 0;
    let added = 0;

    extractedCells.forEach((cell) => {
      const cellId = this.getCellId(cell.cellIndex, cell.uuid || null);
      const existing = this.cellStore.get(cellId);

      if (!existing) {
        added++;
      } else if (existing.code !== cell.code) {
        updated++;
      }

      this.cellStore.set(cellId, {
        code: cell.code,
        cellIndex: cell.cellIndex,
        uuid: cell.uuid || null,
        lastUpdated: Date.now(),
      });
    });

    this.log(`Synced: ${added} added, ${updated} updated, ${this.cellStore.size} total`);
    return { updated, added, total: this.cellStore.size };
  }

  /**
   * Clears all stored cells
   * EXACT COPY from old-linter/src/codeMirror.js clear function
   */
  clear(): void {
    this.cellStore.clear();
    this.log('Cleared all cells');
  }

  /**
   * Gets store size
   * EXACT COPY from old-linter/src/codeMirror.js getStoreSize function
   */
  getStoreSize(): number {
    return this.cellStore.size;
  }
}
