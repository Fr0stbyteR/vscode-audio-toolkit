# Source and rebuilding

The GPL-3.0-or-later frontend distribution includes `source/` alongside the
static web files. Distribute both together. This directory contains:

- `audio-toolkit/`: the source and configuration used to build the frontend,
  including exact dependency lockfiles, tests, docs and release scripts.
- `fftw-js-0.1.10/`: the installed FFTW JavaScript/TypeScript wrapper, its native
  build recipe and notices (unaltered).
- `fftw-3.3.10.tar.gz`: FFTW C source used by that wrapper's `libfftw3-wasm/build.sh`.
- `verovio-4.2.0.tar.gz`: Verovio source, resources, embedded third-party notices
  and Emscripten build scripts at commit
  `8a772f537472c283d60b7e3c63c242344949cddf`.
- `third-party-sources.json`: origin URLs and SHA-256 archive checksums.

## Frontend

From `audio-toolkit/`, with Node 22 and npm:

```sh
npm ci
npm run check
```

Output is `dist/`. No private `.env` is needed. Public builds should set
`VITE_MUSIC_ANALYSIS_TOKEN` to an empty string; runtime settings can supply a
user's backend connection later. `npm run release:prepare` also collects
notices and sources, downloading the two verified archives if not cached.

The app's `STFTWorker.ts` imports the separate FFTW wrapper package; score
engraving imports the separate Verovio package. These are not merged into
irreversible custom native binaries. To modify either, rebuild its package and
use a local npm package/file dependency before rebuilding the frontend.

## Native dependencies

FFTW: extract the C archive into `fftw-js-0.1.10/libfftw3-wasm/fftw-3.3.10`.
In an Emscripten SDK shell with GNU make/autotools, run the included
`libfftw3-wasm/build.sh`, then the wrapper's npm build scripts. The recipe
configures single precision and produces `libfftw3.js` / `libfftw3.wasm`.
The npm package does not record the original Emscripten SDK version; modern
SDKs may require adapting legacy flags in `Makefile.emscripten`. We do not
claim byte-for-byte reproduction of the upstream prebuilt WASM.

Verovio: extract its archive, enter `emscripten/` in a shell with Emscripten,
CMake, make, Perl, Node and npm, and run `./buildNpmPackage`. Read the included
`buildToolkit` / `buildNpmPackage` recipes; install the resulting `emscripten/npm`
package
as the frontend's `verovio` dependency. Preserve all font/resource licenses
from the archive, not only LGPL. The original npm build identifies the same
commit as this archive. Its compiler version is not pinned by this project.

Before a public binary release, validate the native rebuild instructions on
your chosen SDK and review `third-party-inventory.json` warnings. Source
availability is not a claim of verified reproducible native builds or a
complete legal audit. Licenses for optional API models and recordings remain
independent; those files are not included here.
