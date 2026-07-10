import { CodeMirrorManager } from '../utils/CodeMirrorManager';

describe('CodeMirrorManager', () => {
  it('syncCells reports added/updated/total counts correctly across two syncs', () => {
    const manager = new CodeMirrorManager();

    const first = manager.syncCells([
      { code: 'x = 1', cellIndex: 0, uuid: 'a' },
      { code: 'y = 2', cellIndex: 1, uuid: 'b' },
    ]);
    expect(first).toEqual({ added: 2, updated: 0, total: 2 });

    const second = manager.syncCells([
      { code: 'x = 1', cellIndex: 0, uuid: 'a' }, // unchanged
      { code: 'y = 99', cellIndex: 1, uuid: 'b' }, // changed
      { code: 'z = 3', cellIndex: 2, uuid: 'c' }, // new
    ]);
    expect(second).toEqual({ added: 1, updated: 1, total: 3 });
  });

  it('getAllCells returns cells ordered by cellIndex regardless of insertion order', () => {
    const manager = new CodeMirrorManager();
    manager.syncCells([
      { code: 'third', cellIndex: 2, uuid: 'c' },
      { code: 'first', cellIndex: 0, uuid: 'a' },
      { code: 'second', cellIndex: 1, uuid: 'b' },
    ]);

    expect(manager.getAllCells()).toEqual([
      { code: 'first', cellIndex: 0, uuid: 'a' },
      { code: 'second', cellIndex: 1, uuid: 'b' },
      { code: 'third', cellIndex: 2, uuid: 'c' },
    ]);
  });

  it('keys cells by uuid when present, falling back to cellIndex when uuid is null', () => {
    const manager = new CodeMirrorManager();
    // Same cellIndex, different uuid -> two distinct stored cells (uuid wins).
    manager.updateCell(0, 'uuid-a', 'code-a');
    manager.updateCell(0, 'uuid-b', 'code-b');
    expect(manager.getStoreSize()).toBe(2);
    expect(manager.getCell(0, 'uuid-a')?.code).toBe('code-a');
    expect(manager.getCell(0, 'uuid-b')?.code).toBe('code-b');

    // No uuid -> keyed by `cell-${cellIndex}`.
    manager.updateCell(5, null, 'code-c');
    expect(manager.getCell(5, null)?.code).toBe('code-c');
  });

  it('updateCell is a no-op (returns false, no lastUpdated bump) when code is unchanged', () => {
    const manager = new CodeMirrorManager();
    expect(manager.updateCell(0, 'a', 'x = 1')).toBe(true); // first write
    const firstUpdatedAt = manager.getCell(0, 'a')!.lastUpdated;

    expect(manager.updateCell(0, 'a', 'x = 1')).toBe(false); // identical code
    expect(manager.getCell(0, 'a')!.lastUpdated).toBe(firstUpdatedAt);

    expect(manager.updateCell(0, 'a', 'x = 2')).toBe(true); // actually changed
  });

  it('clear empties the store', () => {
    const manager = new CodeMirrorManager();
    manager.updateCell(0, 'a', 'x = 1');
    expect(manager.getStoreSize()).toBe(1);
    manager.clear();
    expect(manager.getStoreSize()).toBe(0);
    expect(manager.getAllCells()).toEqual([]);
  });
});
