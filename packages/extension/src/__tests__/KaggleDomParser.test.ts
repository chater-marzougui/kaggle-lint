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
    // Suppress console noise from KaggleDomParser's DEBUG logger
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
    it('returns "dark" when the body has the theme--dark class', () => {
      document.body.classList.add('theme--dark');
      expect(new KaggleDomParser().detectTheme()).toBe('dark');
    });

    it('returns "light" by default', () => {
      expect(new KaggleDomParser().detectTheme()).toBe('light');
    });
  });
});
