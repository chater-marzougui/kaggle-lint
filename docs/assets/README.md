# README screenshots & GIFs

Four assets, referenced by the root `README.md`, all already captured and in this folder. This file is the reference for anyone updating them later.

Setup for all of these: `npm run build`, load `packages/extension/dist/` unpacked at `chrome://extensions`, open a real Kaggle notebook in edit mode with a handful of cells that have obvious lint issues (an unused import, an undefined variable, a line over 79 chars, etc.) so the screenshots have something real to show.

## 1. `hero-overlay.png`

**What:** Full browser window (or a tight crop around the notebook) with the Kaggle Linter overlay open in the bottom-right corner, showing a mix of errors/warnings/info so the severity icons and tabs are all visible.
**Format:** PNG. This is the README's first image — make it look good.

## 2. `popup-settings.png`

**What:** The toolbar popup, with the **Linter Engine** segmented selector and the **Ignore Codes** field both visible.
**Format:** PNG, native popup size (don't resize/crop awkwardly).

## 3. `click-to-scroll.gif`

**What:** Click an error row in the overlay's list, showing the notebook scroll to and briefly highlight the exact line the error is on.
**Format:** GIF, 3–6 seconds, loop is fine.

## 4. `overlay-minimized.gif`

**What:** Expanding and minimizing the overlay (drag, then click the chevron to collapse to its pill form and back).
**Format:** GIF — a loop reads better here than a static frame, since the point is the animation.

---

**Dropped from the original checklist:** a `live-relint.gif` (editing a cell and watching the overlay auto-update) — not needed, the other four already cover the extension's actual behavior well enough.
