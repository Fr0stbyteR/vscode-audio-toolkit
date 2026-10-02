# Frontend release checklist

The deliverable is a static web application, not a VS Code extension and not an
npm library. Keep `private: true` in both package manifests to prevent accidental
npm publication. The separately installed analysis API is not in `dist/`.

## Prepare

1. Review `THIRD_PARTY_NOTICES.md`. The frontend is GPL-3.0-or-later. Provide
   corresponding source and build instructions, including FFTW wrapper/native
   source and Verovio sources/resources, with distributed static builds. Review
   fonts and optional backend/model terms independently.
2. Update the version in both package manifests and lockfiles, then summarize
   changes in `CHANGELOG.md`. No release tag has been created automatically.
3. Install the locked app dependencies: `npm ci` (Node 22 is used
   in CI). Run `npm run release:prepare` from the repository root.
4. Inspect `dist/third-party-inventory.json` and included license texts. This
   automated inventory does not replace a source/resource licensing review.
   `dist/source/` includes the frontend snapshot, FFTW wrapper and verified
   native source archives. Review `CORRESPONDING_SOURCE.md`, validate native
   rebuilds with your SDK, and resolve inventory warnings before public release.
5. Ensure public builds contain no credentials. `VITE_*` values are compiled
   into JavaScript; a backend bearer token is **not a frontend secret**. Set
   `VITE_MUSIC_ANALYSIS_TOKEN` to an empty string for public builds. Configure
   personal backend access through the browser settings instead.
6. Preview over HTTP with `npm run preview`, and exercise audio switching,
   waveform/spectrogram, marker editing, imported score/piano roll, overlay and
   local folder persistence in Chrome/Edge. Backend features need a compatible
   backend and explicitly configured URL/token.

## Ship or host

Archive the contents of `dist/` only after the checklist is satisfied. Retain
all generated notices and required source/rebuild materials. The frontend CI
tests Linux, Windows and macOS and uploads a **build artifact**, not a public
GitHub Release. It does not push, create tags or publish a website.

Serve `dist/` using any static HTTP server for local use or HTTPS for a deployed
site. Assets use relative paths, so project subpaths are supported. Do not open
`index.html` through `file://`. Configure the separate API's CORS allowlist,
HTTPS and authentication before remote use; an HTTPS frontend cannot call an
HTTP API because of mixed-content restrictions. File System Access support and
permissions vary by browser; Chromium is the primary local-folder target.

The prepared artifact contains neither example recordings/scores nor downloaded
model weights. K545 README images illustrate the UI; they do not redistribute
the underlying media or guarantee model/alignment accuracy.
