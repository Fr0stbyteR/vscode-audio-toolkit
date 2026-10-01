# Third-party software and media

Audio Toolkit's frontend source is GPL-3.0-or-later (see `LICENSE`). This does
not relicense dependencies, fonts, model weights or user media. Third-party
permissive licenses and copyleft notices remain in effect.

## Browser dependencies

| Component | License | Attribution / source |
| --- | --- | --- |
| React, React DOM, Scheduler | MIT | [Meta and contributors](https://github.com/facebook/react) |
| VS Code Webview UI Toolkit and Microsoft FAST | MIT | [Microsoft and contributors](https://github.com/microsoft/vscode-webview-ui-toolkit) |
| Codicons icon font | CC-BY-4.0; code MIT | [Microsoft](https://github.com/microsoft/vscode-codicons). Icons used in the UI; this project is not affiliated with Microsoft. |
| Tone.js MIDI, midi-file, array-flatten | MIT | [Tone.js MIDI](https://github.com/Tonejs/Midi), [midi-file](https://github.com/carter-thaxton/midi-file), [array-flatten](https://github.com/blakeembrey/array-flatten) |
| Typed Event Emitter | MIT | [Fr0stbyteR and contributors](https://github.com/fr0stbyter/typed-event-emitter) |
| window-function | MIT | [Ricky Reusser and contributors](https://github.com/scijs/window-function) |
| @shren/fftw-js, including FFTW WASM | Package declares GPL-3.0-or-later; bundled FFTW has its own GPL notice | [fftw-js](https://github.com/fr0stbyter/fftw-js), [FFTW](https://www.fftw.org/). **Release licensing review required.** |
| Verovio 4.2.0 | LGPL-3.0-or-later, with separately licensed bundled resources | [RISM Digital / Verovio](https://github.com/rism-digital/verovio/tree/version-4.2.0) |

This is a readable overview, not an exhaustive dependency/license audit.
`npm run release:prepare` collects exact installed versions, transitive runtime
dependencies and available package license/notice texts into
`dist/third-party-licenses/` plus `dist/third-party-inventory.json`.
Verovio's official GPL/LGPL texts, absent from its npm package, are retained in
`docs/licenses/`. Retain upstream notices and check font/resource licenses in
the corresponding Verovio source distribution.

## Distribution considerations

- GPL-3.0-or-later applies to project-owned frontend code and contributions.
  Existing third-party code retains its original copyright/license notices.
- FFTW is used by the browser spectrogram worker and is a runtime dependency,
  not merely a build-time tool.
  An attribution table alone does not settle GPL distribution obligations.
  Provide the corresponding source and build/rebuild information for the
  frontend, FFTW wrapper and embedded FFTW when distributing the static build.
- Verovio/WASM and its resources remain under their upstream licenses. Preserve
  required notices, source/rebuild access and replacement rights as applicable.
  Source maps alone are not a substitute for corresponding source requirements.
- The generated inventory is a release aid, not a legal compliance certificate.

## Optional analysis backend

The separately installed [music-embedding-analysis](https://github.com/fr0stbyter/music-embedding-analysis)
service is not bundled into this frontend's static output. It has separate
software and model dependencies. Essentia has AGPL/commercial terms, and many
Essentia model weights are CC BY-NC-SA 4.0. CLAP/MuLan and OMR models have their
own upstream terms. Enabling an HTTP client for a model does not relicense it.
Check the actual backend version and model metadata before deployment.

## K545 screenshots and local examples

README screenshots use local files `k545-1.mp3` and `k545-1.xml` to demonstrate
the UI for Mozart's Piano Sonata No. 16 in C major, K.545, first movement.
The local MusicXML file identifies `www.antescofo.com` in its rights field;
the recording's performer/license was not supplied. These files are **not**
included in this repository or the static distribution. Mozart's composition,
a particular engraving and a particular recording are distinct rights objects.
Screenshots are UI illustrations, not permission to redistribute the underlying
recording or score file. Supply your own lawfully usable audio/score to reproduce
the example; retain any applicable attribution when reusing the screenshots.
