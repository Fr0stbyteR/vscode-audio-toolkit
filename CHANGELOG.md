# Change Log

All notable changes to the "audio-toolkit" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

- Added a desktop Python/librosa analysis backend with beat, onset, and non-silent-region marker modules.
- Added RMS, spectral-centroid, YIN pitch, mel-spectrogram, and chroma modules using the existing Vector/Matrix UI.
- Added an experimental view-tiled WebGL 2 matrix renderer with Canvas 2D fallback and in-module timing.
- Fixed Matrix/Vector downsampling errors and a Windows/Python 3.13 crash in librosa chroma tuning detection.
- Removed the Essentia WebAssembly integration.
- Improved marker selection, range intersection, colors, accessibility, and batch-edit feedback.
- Fixed custom editor hot-exit recovery and module-state synchronization during undo/revert.
