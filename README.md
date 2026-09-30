# Audio Toolkit Web

Audio Toolkit is a standalone browser application for viewing, analysing and
annotating local audio.

The frontend lives in `app/`. It includes waveform and spectrogram views,
markers, librosa analysis modules, CLAP descriptions and relevance curves,
MusicXML display, audio-to-score alignment, and a piano roll. Browser workspace
state can be stored beside the opened audio directory in `.audio_toolkit/`.

## Quick start

Install the frontend once:

```powershell
npm ci --prefix app
```

Start the frontend together with the sibling `music-embedding-analysis`
backend:

```powershell
.\start-standalone.ps1
```

Or run only the frontend:

```powershell
npm run dev
```

Then open `http://127.0.0.1:5173/` in Chrome or Edge and authorize a local
audio directory from the library panel.

Librosa and embedding modules require the sibling `music-embedding-analysis`
service. Waveform, spectrogram, markers, MusicXML and piano-roll functionality
run directly in the browser. Copy `app/.env.example` to `app/.env` to configure
the default service URL and token.

See [STANDALONE.md](STANDALONE.md) for detailed setup, persistence, score
alignment and remote deployment notes.

## Development

```powershell
npm run lint
npm test
npm run build
```
