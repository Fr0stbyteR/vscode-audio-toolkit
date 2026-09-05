# Change Log

All notable changes to the "audio-toolkit" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Added a desktop Python/librosa analysis backend with beat, onset, and non-silent-region marker modules.
- Added RMS, spectral-centroid, YIN pitch, mel-spectrogram, and chroma modules using the existing Vector/Matrix UI.
- Added an experimental view-tiled WebGL 2 matrix renderer with Canvas 2D fallback and in-module timing.
- Added compressed, automatically invalidated librosa result caching with LRU pruning, cache status, forced reanalysis, and a clear-cache command.
- Fixed Matrix/Vector downsampling errors and a Windows/Python 3.13 crash in librosa chroma tuning detection.
- Fixed hidden string-based analysis errors and added trusted-workspace virtual-environment discovery.
- Added desktop extension-host debug configurations so local development no longer launches the web-only entry point by default.
- Removed the Essentia WebAssembly integration.
- Improved marker selection, range intersection, colors, accessibility, and batch-edit feedback.
- Fixed custom editor hot-exit recovery and module-state synchronization during undo/revert.
