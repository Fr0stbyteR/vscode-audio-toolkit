# Standalone Web workspace

Librosa and CLAP run in the sibling `music-embedding-analysis` backend. The
frontend runs directly in a browser.

## Run locally

On Windows, with frontend dependencies and the music backend environment installed,
double-click `start-standalone.cmd`, or run both services together from
this repository:

```powershell
.\start-standalone.ps1
```

The script finds `music-embedding-analysis` beside this repository by default;
use `-MusicBackendPath` if it lives elsewhere. It creates missing `.env` files
from their `.env.example` templates, waits for the frontend, opens the browser,
and reports when the unified backend is ready. Press `Q` or Ctrl+C
in the launcher to stop the services. Logs go to `.standalone-logs/`. Run with
`-Check` to validate paths, dependencies, and ports without starting anything,
or `-NoBrowser` to keep the browser closed.

Initial setup is still needed once: install frontend dependencies with
`npm ci --prefix app` and install the music backend in its own `.venv` as
described in that repository's README. The launcher reports missing dependencies.

If you used the former split setup, the old `standalone-server/.env`,
`.standalone-data/`, and `.venv-librosa/` are no longer read. They are left in
place to avoid deleting credentials, cached results, or uploaded audio without
your review. The browser's **Music analysis service** setting is now the only
URL/token used for both librosa and CLAP; the former librosa URL setting is
ignored. No Python backend source is included in this repository.

### Manual startup

Start the backend from `music-embedding-analysis`:

```powershell
.\start-clap.ps1
```

In another terminal, start the frontend:

```powershell
cd app
npm run dev
```

Vite reads the unified service URL and default token from `app/.env`; use
`app/.env.example` as the template. Settings changed in the UI override
those defaults and persist in the browser profile.

Open `http://127.0.0.1:5173/` in Chrome or Edge. Use the `+`
button in the library panel to authorize a directory. Other browsers fall back
to a `webkitdirectory` file input when available.

## Score and piano-roll layers

Open an audio file, then add **MusicXML score** or **Piano roll** from the module
menu. Select the layer and use **Import score** in its Analysis panel. The score
layer accepts MusicXML (`.musicxml`, `.xml`, `.mxl`); the piano roll also accepts
MIDI (`.mid`, `.midi`). Importing a MusicXML score lets you add a synchronized
piano-roll companion. Instrument visibility is in the piano roll's Appearance
panel.

The score is engraved by Verovio as one horizontally scrollable system at a
fixed scale. Its cursor follows audio playback, and the strip above it connects
visible measures/notes with their positions on the shared audio timeline. The
piano roll follows the same horizontal zoom and pan as the waveform. Timing is
linear on import; **Auto-align to audio (DTW)** estimates a chroma-based timing
map in a browser worker. To correct a passage, Alt-click a score/piano-roll
note, move the audio playhead to the matching sound, then choose **Anchor
selected note to playhead**. Alignment is scoped to the current audio asset;
opening another recording keeps the score but requires new alignment.

Imported score bytes and module settings are stored in this browser profile.
Clearing site data removes the score, so re-import it when necessary. Score
import and alignment run locally; neither requires the Python backend.

## CLAP descriptions

The optional `CLAP description` module follows the current selection, or a
configurable context window around the cursor. It uses the unified
`music-embedding-analysis` service (default `http://127.0.0.1:49321`) and ranks
a curated bilingual description catalogue. The displayed scores are embedding
similarities, not calibrated probabilities.

Start that service, load `laion_clap_music_htsat_base` (or MuQ-MuLan), then put
the token printed by the service into **Music embedding service** in the header
settings. The browser uploads the selected audio once and subsequent cursor
requests send only time ranges. The module debounces cursor movement and caches
identical requests in the browser.

## Remote deployment model

- The directory handle never leaves the browser.
- The frontend uploads only a selected audio file, and only when an analysis is
  requested.
- Uploaded assets are content-addressed with SHA-256, so repeated analyses do
  not upload the same `File` again during a session and the server deduplicates
  identical bytes across sessions.
- Librosa and embedding analysis use the same authenticated upload and backend.
- Librosa cache keys include asset hash, algorithm, options, and engine version.
- Configure the API URL and optional bearer token from the frontend header.
- API URLs and bearer tokens persist in the current browser profile. Treat that
  profile as trusted; clearing site data removes them.
- Chromium directory handles are stored in IndexedDB. If read permission is
  retained, the previous library opens automatically; otherwise the UI offers
  a one-click reconnect without asking the user to locate the folder again.
- Set `MAB_CORS_ORIGIN_REGEX` and `MAB_SESSION_TOKEN` before exposing the backend
  outside localhost. TLS should be terminated by the deployment proxy.

The File System Access API requires a secure context in production (HTTPS) and
is currently best supported by Chromium browsers. The interactive upload
endpoint accepts audio bytes, not the browser's local filesystem path, because
that path is meaningless on a remote server.
