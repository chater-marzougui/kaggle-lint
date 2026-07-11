# kaggle-lint Documentation

Documentation for the Kaggle Linter Chrome extension monorepo.

## Contents

- **[architecture.md](architecture.md)** — How the system is put together today: packages, data flow, build pipeline, runtime contexts. Read this first.
- **[review-findings.md](review-findings.md)** — Full pre-agentic-era code review: every known bug, bad config, duplication, and dead-code finding, each with file/line references and severity. This is the evidence base for the roadmap.
- **[next_plans/](next_plans/)** — The roadmap to make kaggle-lint fully usable. Six milestone folders, each containing an implementation plan written to be expanded and executed by an agentic worker (Sonnet-class model). Start at [next_plans/README.md](next_plans/README.md) for ordering and dependencies.

## Quick orientation

The repo is an npm-workspaces + Turborepo monorepo with three packages:

| Package                  | Role                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `packages/core`          | Pure-TS notebook-source building, severity mapping, and the flake8 Python shim. No DOM deps. |
| `packages/ui-components` | React overlay UI (Overlay, ErrorList, ErrorItem).                                            |
| `packages/extension`     | Chrome MV3 extension wiring core + UI into Kaggle notebook pages.                            |

There is no handmade/built-in rule engine anymore — it was deleted in favor of running real flake8 (via Pyodide) and ruff (via native WebAssembly), both entirely in-browser. `old-linter/`, the original vanilla-JS implementation this project migrated from, was removed once nothing in the build depended on it.

Developer commands and the technical architecture live in the repo-root [CONTRIBUTING.md](../CONTRIBUTING.md); user-facing docs (features, installation, known limitations) live in [README.md](../README.md).

## Current state

All milestones in `next_plans/` are merged. `docs/review-findings.md` is kept as the historical record of what the original TS/React migration got wrong and how each finding was resolved — it documents the past, not the present; read `architecture.md` for what's actually true today.
