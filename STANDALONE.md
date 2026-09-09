# Standalone Web workspace

This branch includes a browser frontend and an HTTP adapter for the existing
librosa analysis engine. It does not require a VS Code extension host.

## Run locally

Create a Python environment and install the server dependencies:

```powershell
python -m venv .venv-standalone
.\.venv-standalone\Scripts\python -m pip install -r standalone-server\requirements.txt
.\.venv-standalone\Scripts\python -m uvicorn app:app --app-dir standalone-server --reload
```

In another terminal, start the frontend:

```powershell
cd webview-ui
npm run start:standalone
```

Vite reads service URLs and default tokens from `webview-ui/.env`; use
`webview-ui/.env.example` as the template. Settings changed in the UI override
those defaults and persist in the browser profile.

Open `http://127.0.0.1:5173/standalone.html` in Chrome or Edge. Use the `+`
button in the library panel to authorize a directory. Other browsers fall back
to a `webkitdirectory` file input when available.

## CLAP descriptions

The optional `CLAP description` module follows the current selection, or a
configurable context window around the cursor. It uses the separate
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
- Analysis cache keys include asset hash, algorithm, options, and engine version.
- Configure the API URL and optional bearer token from the frontend header.
- API URLs and bearer tokens persist in the current browser profile. Treat that
  profile as trusted; clearing site data removes them.
- Chromium directory handles are stored in IndexedDB. If read permission is
  retained, the previous library opens automatically; otherwise the UI offers
  a one-click reconnect without asking the user to locate the folder again.
- Set `AUDIO_TOOLKIT_CORS_ORIGINS` and `AUDIO_TOOLKIT_API_TOKEN` before exposing
  the backend outside localhost. TLS should be terminated by the deployment
  proxy.

The File System Access API requires a secure context in production (HTTPS) and
is currently best supported by Chromium browsers. The backend intentionally
does not accept local filesystem paths because those paths are meaningless and
unsafe when the service is remote.
