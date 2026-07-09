/**
 * Message-bridge protocol shared between the MAIN-world extractor
 * (pageExtractor.ts) and the isolated-world content script
 * (utils/KaggleDomParser.ts). Both worlds run in the same frame, so
 * window.postMessage is used instead of chrome.runtime messaging.
 */

export const EXTRACT_REQUEST = 'KAGGLE_LINT_EXTRACT_REQUEST' as const;
export const EXTRACT_RESPONSE = 'KAGGLE_LINT_EXTRACT_RESPONSE' as const;

export interface ExtractRequestMessage {
  type: typeof EXTRACT_REQUEST;
  requestId: string;
}

export interface PageExtractedCell {
  code: string;
  cellIndex: number;
  uuid: string | null;
}

export interface ExtractResponseMessage {
  type: typeof EXTRACT_RESPONSE;
  requestId: string;
  cells: PageExtractedCell[];
}
