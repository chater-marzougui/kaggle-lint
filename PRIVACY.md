# Privacy Policy

**Last updated: 2026-07-11**

Kaggle Linter is a Chrome extension that lints Python code inside Kaggle notebooks. This page explains what it does and does not do with your data.

## Short version

Kaggle Linter does not collect, store, or transmit your notebook code, your Kaggle account information, or any other personal data to us or to any third party. Everything it does happens locally, inside your own browser.

## What the extension reads

To lint your code, the extension reads the Python source of the notebook cells on the Kaggle notebook page you have open, using Chrome's content-script APIs. This only happens on Kaggle notebook edit pages (`kaggle.com/code/*/*/edit`) and Kaggle's own notebook iframe (`kkb-production.jupyter-proxy.kaggle.net`) — nowhere else.

## Where linting happens

Both supported linting engines run **entirely inside your browser**:

- **Flake8** runs via [Pyodide](https://pyodide.org/) (a Python runtime compiled to WebAssembly), with the linter itself bundled with the extension. Nothing is downloaded from PyPI or any other server at lint time.
- **Ruff** runs via a native WebAssembly build (`@astral-sh/ruff-wasm-web`), also bundled with the extension.

Your notebook code never leaves your browser to reach a server we operate — there is no such server. The extension's source is open (see the [GitHub repository](https://github.com/chater-marzougui/kaggle-lint)) if you'd like to verify this yourself.

## What the extension stores

Your settings (which engine you've selected, per-engine ignore-codes, and the overlay's position/minimized state) are saved using Chrome's built-in `chrome.storage` APIs, scoped to the extension itself. If you're signed into Chrome with sync enabled, `chrome.storage.sync` values sync across your own devices the same way your browser bookmarks or other extension settings do — that's Google's Chrome sync infrastructure, not something this extension's developer has access to or operates.

## What the extension does not do

- No analytics, telemetry, or usage tracking of any kind.
- No crash reporting to a third-party service.
- No advertising or ad-tracking scripts.
- No selling or sharing of data — there is no data collected to sell or share.
- No network requests to any domain other than Kaggle's own (needed to read the notebook page you're on).

## Permissions

The extension requests the minimum Chrome permissions needed to function:

- `activeTab` / host permissions on Kaggle domains — to read and interact with the notebook page.
- `storage` — to save your settings locally/via Chrome sync, as described above.
- `offscreen` — required by Chrome's Manifest V3 to run the WebAssembly-based linting engines outside the restricted content-script context.

## Changes to this policy

If this policy ever changes (for example, if a future version adds an optional feature that does transmit data), this file will be updated and the change will be called out in that release's notes.

## Questions

Open an issue on the [GitHub repository](https://github.com/chater-marzougui/kaggle-lint/issues) if you have questions about this policy.
