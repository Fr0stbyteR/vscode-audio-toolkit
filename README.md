# audio-toolkit README

A powerful tool for visualizing and analyzing audio files.

## Features

+ Supporting `wav` and `mp3` files.

+ Waveform, spectrogram, markers

+ Saving the editor's state.

+ Librosa analysis modules: beat/onset/non-silent markers, RMS, onset strength, zero-crossing rate, spectral centroid/bandwidth/rolloff/flatness, YIN pitch, mel spectrogram, chroma, and MFCC.

+ Existing Vector and Matrix views are reused for continuous 1D/2D analysis results. Matrix views prefer an experimental WebGL 2 renderer and fall back to Canvas 2D.

## Analysis backend

Python code now lives in the sibling `music-embedding-analysis` project. Start that service before using librosa or CLAP; this repository contains only the clients. Waveform and spectrogram still work without the service. The standalone browser uses `webview-ui/.env` or the header settings. For the VS Code desktop extension, set `audioToolkit.backendUrl` and `audioToolkit.backendToken` to the same service URL and token.

Desktop librosa analysis uploads the selected full audio file only after a confirmation dialog identifying the destination URL. The music backend stores a content-addressed copy. VS Code for the Web still has no extension-host analysis bridge; use the standalone browser app for web analysis.

Analysis results are compressed and cached in VS Code extension storage and by the backend. The local cache key includes the audio file path, size, modification time, backend URL, algorithm options, and backend engine fingerprint. Use **Reanalyze** in a module to bypass both caches, or **Audio Toolkit: Clear Analysis Cache** to clear the local cache. Cache status is shown in each librosa module.

Use `audioToolkit.analysisCache.enabled` to disable caching and `audioToolkit.analysisCache.maxSizeMB` to control its approximate LRU size limit (512 MB by default). Marker edits remain in the project's JSON state; cached data is local and does not add files beside the audio source.

Set `audioToolkit.matrixRenderer` to `auto`, `webgl`, or `canvas2d` to compare matrix rendering. The module monitor reports texture-upload and draw time for WebGL, or total paint time for Canvas 2D.

## Development

Use the **Run Desktop Extension** launch configuration when testing desktop librosa modules. **Run Web Extension** supports waveform/spectrogram editing, but backend analysis is available through the standalone browser app instead.

## Requirements

Waveform and spectrogram need no Python installation. Librosa and CLAP modules
require a running `music-embedding-analysis` service.

## Extension Settings

* `audioToolkit.audioUnit`: Unit to display.

## Known Issues

## Release Notes

### 0.0.1

Initial release of Audio Toolkit.

---

## For more information

* [shren](https://github.com/fr0stbyter)

**Enjoy!**
