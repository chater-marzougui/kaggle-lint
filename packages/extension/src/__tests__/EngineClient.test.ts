import { EngineClient } from '../engine/EngineClient';
import type { EngineLintResponse, EngineResultError } from '../engine/protocol';
import type { NotebookCellInput } from '@kaggle-lint/core';

function stubChrome(sendMessage: jest.Mock): void {
  global.chrome = {
    runtime: { sendMessage },
  } as unknown as typeof chrome;
}

function okResponse(errors: EngineResultError[]): EngineLintResponse {
  return { ok: true, errors };
}

const cellsA: NotebookCellInput[] = [{ code: 'x = 1', cellIndex: 0 }];
const cellsB: NotebookCellInput[] = [{ code: 'y = 2', cellIndex: 0 }];

describe('EngineClient lint result cache', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete (global as { chrome?: unknown }).chrome;
  });

  it('caches identical (engine, cells, ignoreCodes) calls — only one sendMessage round-trip', async () => {
    const sendMessage = jest.fn().mockResolvedValue(
      okResponse([{ code: 'F401', msg: 'unused', line: 1, cellIndex: 0, cellLine: 1, severity: 'error' }])
    );
    stubChrome(sendMessage);
    const client = new EngineClient();

    const first = await client.lintNotebook('flake8', cellsA, ['E501']);
    const second = await client.lintNotebook('flake8', cellsA, ['E501']);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('cache miss when cells content changes', async () => {
    const sendMessage = jest.fn().mockResolvedValue(okResponse([]));
    stubChrome(sendMessage);
    const client = new EngineClient();

    await client.lintNotebook('flake8', cellsA, ['E501']);
    await client.lintNotebook('flake8', cellsB, ['E501']);

    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('reordered ignoreCodes is still a cache hit (sorted before keying)', async () => {
    const sendMessage = jest.fn().mockResolvedValue(okResponse([]));
    stubChrome(sendMessage);
    const client = new EngineClient();

    await client.lintNotebook('flake8', cellsA, ['E501', 'F401']);
    await client.lintNotebook('flake8', cellsA, ['F401', 'E501']);

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('genuinely different ignoreCodes is a cache miss', async () => {
    const sendMessage = jest.fn().mockResolvedValue(okResponse([]));
    stubChrome(sendMessage);
    const client = new EngineClient();

    await client.lintNotebook('flake8', cellsA, ['E501']);
    await client.lintNotebook('flake8', cellsA, ['E501', 'F401']);

    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('cache miss when engine changes with identical cells/ignoreCodes', async () => {
    const sendMessage = jest.fn().mockResolvedValue(okResponse([]));
    stubChrome(sendMessage);
    const client = new EngineClient();

    await client.lintNotebook('flake8', cellsA, ['E501']);
    await client.lintNotebook('ruff', cellsA, ['E501']);

    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest entry once the cache cap is exceeded (FIFO)', async () => {
    const sendMessage = jest.fn().mockResolvedValue(okResponse([]));
    stubChrome(sendMessage);
    const client = new EngineClient();

    const makeCells = (n: number): NotebookCellInput[] => [
      { code: `x = ${n}`, cellIndex: 0 },
    ];

    // Cap is 20 — fill it, then push one more distinct entry to evict the
    // first (oldest) one.
    for (let i = 0; i < 21; i++) {
      await client.lintNotebook('flake8', makeCells(i), []);
    }
    expect(sendMessage).toHaveBeenCalledTimes(21);

    // The very first entry (i = 0) should have been evicted — re-requesting
    // it must call sendMessage again.
    await client.lintNotebook('flake8', makeCells(0), []);
    expect(sendMessage).toHaveBeenCalledTimes(22);

    // The most recent entry (i = 20) should still be cached.
    await client.lintNotebook('flake8', makeCells(20), []);
    expect(sendMessage).toHaveBeenCalledTimes(22);
  });
});
