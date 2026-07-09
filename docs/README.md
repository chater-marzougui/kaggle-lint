# kaggle-lint Documentation

Documentation for the Kaggle Python Linter Chrome extension monorepo.

## Contents

- **[architecture.md](architecture.md)** — How the system is put together today: packages, data flow, build pipeline, runtime contexts. Read this first.
- **[review-findings.md](review-findings.md)** — Full pre-agentic-era code review: every known bug, bad config, duplication, and dead-code finding, each with file/line references and severity. This is the evidence base for the roadmap.
- **[next_plans/](next_plans/)** — The roadmap to make kaggle-lint fully usable. Six milestone folders, each containing an implementation plan written to be expanded and executed by an agentic worker (Sonnet-class model). Start at [next_plans/README.md](next_plans/README.md) for ordering and dependencies.

## Quick orientation

The repo is an npm-workspaces + Turborepo monorepo with three packages:

| Package | Role |
| --- | --- |
| `packages/core` | Pure-TS lint engine: 9 custom rules + a Pyodide/Flake8 engine. No DOM deps. |
| `packages/ui-components` | React overlay UI (Overlay, ErrorList, ErrorItem). |
| `packages/extension` | Chrome MV3 extension wiring core + UI into Kaggle notebook pages. |

`old-linter/` is the original vanilla-JS implementation. It is mostly a migration reference, **but** the extension's webpack build still copies `popup.css` from it, and it contains `pageInjection.js` — a MAIN-world script the migration dropped, whose absence is the root cause of the two most severe bugs (see review findings F1 and F2).

Developer commands live in the repo-root [CLAUDE.md](../CLAUDE.md) and [README.md](../README.md).

## State of the project (as of 2026-07-09)

The built-in (handmade) lint engine works but the content script re-lints in an infinite loop; the Flake8 engine cannot work at all in the extension context; code extraction always uses the lossy DOM-scraping fallback. CI's lint step checks nothing. The milestones in `next_plans/` fix these in dependency order.
