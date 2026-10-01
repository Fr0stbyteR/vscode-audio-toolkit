# Contributing

Audio Toolkit is a standalone React/TypeScript/Vite frontend. Python analysis
belongs in the separate `music-embedding-analysis` repository, not this tree.

```sh
npm ci --prefix app
npm run dev
npm run check
```

CI uses Node 22. Frontend-only checks need no Python service. Local K545 structure
regression runs when `examples/k545-1.xml` is available; that externally supplied
score is not redistributed. The remaining synthetic fixtures are checked in.

Reuse the existing Vector, Matrix and Marker processors, shared timeline/layout,
locale strings and module-level loading UI. Analysis parameters should recalculate
only when applied; display-only edits must not recalculate. Preserve manually
edited markers and workspace compatibility. Add small regression tests for
timing, sample indices, stale async results and saved document changes.

For UI changes, exercise Canvas2D and WebGL, columns and overlay mode, switching
audio and restoring hidden modules. Use a clean browser test tab and avoid
overwriting another user's saved workspace.

Submit a focused pull request explaining behavior, verification and any new
dependencies. Contributions to project-owned source are made under GPL-3.0-or-later; do not
copy third-party code under incompatible terms or remove upstream attributions.
See `THIRD_PARTY_NOTICES.md` and `docs/RELEASING.md` before changing dependencies
or preparing a distribution.
