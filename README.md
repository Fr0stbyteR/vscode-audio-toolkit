# audio-toolkit README

A powerful tool for visualizing and analyzing audio files.

## Features

+ Supporting `wav` and `mp3` files.

+ Waveform, spectrogram, markers

+ Saving the editor's state.

+ Desktop analysis modules powered by librosa: beat markers, onset markers, and non-silent regions.

## Desktop analysis setup

The waveform and spectrogram continue to work without Python. The librosa modules require Python 3 with the packages in `requirements-librosa.txt`:

```sh
python -m pip install -r requirements-librosa.txt
```

If Python is not on `PATH`, set `audioToolkit.pythonPath` to the full path of the Python executable. Librosa modules are desktop-only; VS Code for the Web displays a clear unavailable-backend error.

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
