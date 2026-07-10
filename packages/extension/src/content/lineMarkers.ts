/**
 * In-editor severity markers (Milestone 8, Task 3 — the "flagship"
 * feature). Originally attempted purely in the isolated-world content
 * script by reading CM6's line-number gutter as a document-line ->
 * `.cm-line` map. Live-probed against a real Kaggle notebook (Task 7's
 * manual gate) and confirmed there is no gutter at all on Kaggle's build
 * (`.cm-gutters`/`.cm-lineNumbers` both absent) — that approach is invalid
 * here, not just unproven.
 *
 * Marker application now goes through the MAIN-world bridge
 * (page/pageExtractor.ts), which resolves a document line number to its
 * live `.cm-line` DOM node via the real CM6 EditorView's domAtPos() — the
 * same technique the click-to-scroll highlight already uses successfully.
 * This module is a thin request/response wrapper following the exact
 * postMessage pattern SCROLL_TO_CELL_LINE_REQUEST established.
 */

import type { Severity } from '@kaggle-lint/core';
import {
  APPLY_LINE_MARKERS_REQUEST,
  APPLY_LINE_MARKERS_RESPONSE,
  type LineMarkerTarget,
} from '../page/bridgeProtocol';
import { createLogger } from '../utils/logger';

const logger = createLogger('LineMarkers');
const BRIDGE_TIMEOUT_MS = 1500;

export interface MarkerTarget {
  uuid: string | null;
  cellIndex: number;
  cellLine: number;
  severity: Severity;
  code?: string;
  msg: string;
}

/** Resolves 0 (not marked) on timeout so a dead bridge never blocks the caller. */
function requestApplyMarkers(targets: LineMarkerTarget[]): Promise<number> {
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(timeoutId);
    };

    const handleMessage = (event: MessageEvent) => {
      if (settled || event.source !== window) return;
      const data = event.data;
      if (!data || data.type !== APPLY_LINE_MARKERS_RESPONSE || data.requestId !== requestId) {
        return;
      }
      settled = true;
      cleanup();
      resolve(typeof data.markedCount === 'number' ? data.markedCount : 0);
    };

    window.addEventListener('message', handleMessage);

    timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(0);
    }, BRIDGE_TIMEOUT_MS);

    window.postMessage({ type: APPLY_LINE_MARKERS_REQUEST, requestId, targets }, '*');
  });
}

/**
 * Applies severity markers for every target the MAIN-world bridge can
 * currently resolve to a mounted `.cm-line` (clears every previous marker
 * first, notebook-wide — so a line whose error disappeared on the next
 * lint doesn't keep a stale marker). Errors for virtualized-out cells/
 * lines are silently skipped; they'll get marked once the user scrolls
 * them into view and a refresh pass re-runs this function.
 */
export async function applyLineMarkers(targets: MarkerTarget[]): Promise<void> {
  const bridgeTargets: LineMarkerTarget[] = targets.map((target) => ({
    uuid: target.uuid,
    cellIndex: target.cellIndex,
    cellLine: target.cellLine,
    severity: target.severity,
    title: target.code ? `${target.code}: ${target.msg}` : target.msg,
  }));
  const markedCount = await requestApplyMarkers(bridgeTargets);
  logger.log(`applyLineMarkers: ${targets.length} targets, ${markedCount} lines marked`);
}

/** Clears every marker. Used on overlay hide/disable. */
export async function clearAllLineMarkers(): Promise<void> {
  await requestApplyMarkers([]);
}
