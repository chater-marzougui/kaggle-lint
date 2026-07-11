# README screenshots & GIFs — capture checklist

Five assets, referenced by the root `README.md`. Drop each file at the exact path below (same filename, same folder) and it just works — the README already embeds them by path.

Setup for all of these: `npm run build`, load `packages/extension/dist/` unpacked at `chrome://extensions`, open a real Kaggle notebook in edit mode with a handful of cells that have obvious lint issues (an unused import, an undefined variable, a line over 79 chars, etc.) so the screenshots have something real to show.

## 1. `hero-overlay.png`

**What:** Full browser window (or a tight crop around the notebook) with the Kaggle Linter overlay open in the bottom-right corner, showing a mix of errors/warnings/info so the severity icons and the top stats bar (❌/⚠️/ℹ️ counts) are all visible.
**Format:** PNG, roughly 1280×800 or your natural window size. This is the README's first image — make it look good.

## 2. `popup-settings.png`

**What:** Click the toolbar icon to open the popup. Capture it with the **Linter Engine** section (Flake8/Ruff radio buttons) and the **Ignore Codes** section both visible — the popup is short enough that a single screenshot should get both.
**Format:** PNG, native popup size (don't resize/crop awkwardly).

## 3. `click-to-scroll.gif`

**What:** Click an error row in the overlay's list, showing the notebook scroll to and briefly highlight the exact line the error is on.
**Format:** GIF, 3–6 seconds, loop is fine. Keep it short — start the recording right before the click, stop right after the highlight fades.

## 4. `live-relint.gif`

**What:** Type a change into a code cell (e.g., introduce an unused variable) and show the overlay's error list updating on its own a moment later (no manual re-lint needed — this is the auto re-lint-on-edit feature).
**Format:** GIF, 5–10 seconds — long enough to show the "before" state, the edit, and the "after" state once it updates.

## 5. `overlay-minimized.png`

**What:** Drag the overlay somewhere, then click the minimize (chevron) button so it collapses to its small pill form. Capture that collapsed state.
**Format:** PNG.

---

Once you've got all five in this folder, sanity-check the README renders correctly (GitHub's file viewer or a local Markdown preview) and this checklist file can be deleted or left as-is for future contributors updating the screenshots later.
