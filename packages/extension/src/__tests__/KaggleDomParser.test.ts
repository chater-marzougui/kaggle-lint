import * as fs from 'fs';
import * as path from 'path';
import { KaggleDomParser } from '../utils/KaggleDomParser';
import type { PageExtractedCell } from '../page/bridgeProtocol';

const fixtureHtml = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'notebook.html'),
  'utf-8'
);

// requestFromPage is private — this exposes just enough of its real shape
// to stub it deterministically in tests, without resorting to `any`.
type KaggleDomParserWithPrivates = KaggleDomParser & {
  requestFromPage: () => Promise<{
    cells: PageExtractedCell[];
    source: 'model' | 'dom';
  } | null>;
};

describe('KaggleDomParser', () => {
  beforeEach(() => {
    document.body.innerHTML = fixtureHtml;
    document.body.className = '';
    // Suppress console.warn/error noise (console.log is already silent
    // under test — logger.ts gates it behind DEBUG, unset here).
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('extractCells (DOM-scrape fallback)', () => {
    it('returns only the code cells, skipping the markdown cell, with joined .cm-line text', async () => {
      const parser = new KaggleDomParser();
      // Force the DOM-scrape fallback deterministically instead of waiting
      // out the real 1500ms BRIDGE_TIMEOUT_MS for the (nonexistent, in
      // jsdom) MAIN-world bridge to time out.
      jest
        .spyOn(
          parser as unknown as KaggleDomParserWithPrivates,
          'requestFromPage'
        )
        .mockResolvedValue(null);

      const cells = await parser.extractCells();

      expect(cells).toHaveLength(2);
      // cellIndex counts every .jp-Cell including the skipped markdown one
      // at index 1 (see the fixture's Step 3 note) — the two code cells
      // are 0 and 2, not 0 and 1.
      expect(cells[0]).toMatchObject({
        cellIndex: 0,
        uuid: 'cell-uuid-0',
        code: "import pandas as pd\ndf = pd.read_csv('data.csv')",
      });
      expect(cells[1]).toMatchObject({
        cellIndex: 2,
        uuid: 'cell-uuid-2',
        code: 'print(df.head())',
      });
      expect(parser.getLastExtractionSource()).toBe('dom-scrape');
    });

    it('falls back to DOM scrape when the bridge times out or is unavailable', async () => {
      const parser = new KaggleDomParser();
      jest
        .spyOn(
          parser as unknown as KaggleDomParserWithPrivates,
          'requestFromPage'
        )
        .mockResolvedValue(null);

      await parser.extractCells();

      expect(parser.getLastExtractionSource()).toBe('dom-scrape');
    });
  });

  describe('detectTheme', () => {
    afterEach(() => {
      document.body.style.backgroundColor = '';
    });

    it('returns "dark" for a dark computed background (real Kaggle dark-mode value)', () => {
      document.body.style.backgroundColor = 'rgb(28, 29, 32)';
      expect(new KaggleDomParser().detectTheme()).toBe('dark');
    });

    it('returns "dark" for a different, still-dark background (threshold, not exact match)', () => {
      document.body.style.backgroundColor = 'rgb(40, 40, 45)';
      expect(new KaggleDomParser().detectTheme()).toBe('dark');
    });

    it('returns "light" for a light computed background (real Kaggle light-mode value)', () => {
      document.body.style.backgroundColor = 'rgb(255, 255, 255)';
      expect(new KaggleDomParser().detectTheme()).toBe('light');
    });

    it('returns "light" when the background is fully transparent (no real signal)', () => {
      document.body.style.backgroundColor = 'rgba(0, 0, 0, 0)';
      expect(new KaggleDomParser().detectTheme()).toBe('light');
    });

    it('returns "light" by default (unstyled body)', () => {
      expect(new KaggleDomParser().detectTheme()).toBe('light');
    });
  });
});
