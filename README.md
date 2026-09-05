# audio-toolkit README

A powerful tool for visualizing and analyzing audio files.

## Features

+ Supporting `wav` and `mp3` files.

+ Waveform, spectrogram, markers

+ Saving the editor's state.

+ Desktop analysis modules powered by librosa: beat/onset/non-silent markers, RMS, spectral centroid, YIN pitch, mel spectrogram, and chroma.

+ Existing Vector and Matrix views are reused for continuous 1D/2D analysis results. Matrix views prefer an experimental WebGL 2 renderer and fall back to Canvas 2D.

## Desktop analysis setup

The waveform and spectrogram continue to work without Python. The librosa modules require Python 3 with the packages in `requirements-librosa.txt`:

```sh
python -m pip install -r requirements-librosa.txt
```

If Python is not on `PATH`, set `audioToolkit.pythonPath` to the full path of the Python executable. Librosa modules are desktop-only; VS Code for the Web displays a clear unavailable-backend error.

Set `audioToolkit.matrixRenderer` to `auto`, `webgl`, or `canvas2d` to compare matrix rendering. The module monitor reports texture-upload and draw time for WebGL, or total paint time for Canvas 2D.

## Requirements

None.

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
