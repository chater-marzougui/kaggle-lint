# Notes — Milestone 7 (Single-Frame Mount & Precise Navigation)

## Task 1: intentional behavior changes from the F32 mount gate

1. **Popup broadcasts still hit every frame; only one now answers.** `chrome.tabs.sendMessage` (used by the popup for `runLinter`/`toggleOverlay`/`settingsChanged`) has always broadcast to every frame in the tab — that part is unchanged. What changes is that before this fix, *two* content-script instances (outer shell + notebook iframe) both registered a `chrome.runtime.onMessage` listener, so both replied; after this fix, only the frame that actually mounted (the one with `.jp-Notebook`) has a listener at all, so exactly one frame answers. This is the assumption Milestone 6 Task 3's "ping" design for page detection is built on — a response from *any* frame now reliably means "the real notebook frame is listening," not "one of possibly two frames happened to answer."
2. **Keyboard shortcuts now only fire with focus inside the notebook iframe.** Ctrl+Shift+L (re-lint) and Ctrl+Shift+H (toggle overlay) are bound via `document.addEventListener('keydown', ...)` inside `ContentApp`, which now only mounts in the notebook iframe. Previously the outer-shell instance's listener could theoretically catch these keystrokes too (though its lint always ran on zero cells, so pressing the shortcut there was already a no-op in every way that mattered). This is where typing happens anyway, so no behavior a user would notice changes.

## Task 1: manual per-frame verification (see plan Task 5 for the full gate)

DevTools → per-frame console context switch → `document.querySelectorAll('#kaggle-linter-root').length`. Expected: `1` in the `kkb-production.jupyter-proxy.kaggle.net` frame, `0` in the top `www.kaggle.com` frame. Recorded as part of Task 5's USER-GATE checklist, not duplicated here until that gate actually runs.
