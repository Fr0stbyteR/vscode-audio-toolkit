# Standalone Web workspace

Librosa and CLAP run in the sibling `music-embedding-analysis` backend. The
frontend runs directly in a browser.

## Run locally

Install Node.js and keep the backend in the sibling `music-embedding-analysis`
folder. On Windows, double-click `start-standalone.cmd`, or run:

```powershell
.\start-standalone.ps1
```

On macOS (Intel or Apple Silicon):

```bash
bash start-standalone.command
```

The first launch runs `npm ci` if needed, then uses the backend's normal `start`
workflow to install Python, dependencies and native Essentia. No manual venv,
Visual Studio, Xcode or Homebrew setup is required. Initial setup needs internet
and several GB of free disk; Windows also compiles the project-local C++ worker.
Before starting services it exercises all 29 DSP modules and, by default, real VA
inference. Repeated starts reuse verified artifacts. macOS supports `--basic`
to skip CLAP/VA weights while keeping all DSP; the backend itself supports basic
mode on both platforms.

The script finds `music-embedding-analysis` beside this repository by default;
use `-MusicBackendPath` if it lives elsewhere. It creates missing `.env` files
from their `.env.example` templates, waits for the frontend, opens the browser,
and reports when the unified backend is ready. Press `Q` or Ctrl+C
in the launcher to stop the services. Logs go to `.standalone-logs/`. Run with
`-Check` to validate paths, dependencies, and ports without starting anything,
or `-NoBrowser` to keep the browser closed.

On macOS use `MUSIC_BACKEND_PATH=/path/to/music-embedding-analysis` for a
non-sibling backend and `--no-browser` to keep the browser closed.
The launchers bridge the frontend's configured token only when the backend has
no fixed token, preserving existing user credentials and `.env` files.

If you used the former split setup, the old `standalone-server/.env`,
`.standalone-data/`, and `.venv-librosa/` are no longer read. They are left in
place to avoid deleting credentials, cached results, or uploaded audio without
your review. The browser's **Music analysis service** setting is now the only
URL/token used for both librosa and CLAP; the former librosa URL setting is
ignored. No Python backend source is included in this repository.

### Manual startup

Start the backend from `music-embedding-analysis`:

```powershell
.\start.ps1
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

## Whole-piece labels

The inspector includes a collapsible **Piece metadata** panel, independent of
the selected module. Fields include title/composer, instruments, form regions,
tempo points and curve, mode/key regions, meter regions, mood (valence/arousal
in -1…1), optional activity/function, and theme type. **Add region** uses the
current audio selection, or the entire piece without a selection; clicking a
region strip selects it on the audio timeline. **Add tempo point** uses the
playhead position. Empty optional fields remain empty.

MusicXML import fills explicit score declarations and rehearsal/section labels.
If a key signature has no major/minor declaration, both relative-key candidates
are shown rather than assuming a tonic. Five-/seven-note modes can be labelled
manually; they are not inferred from a key signature alone.
Region times follow the score-to-audio alignment (linear until DTW/manual
anchors are available). The score's nominal BPM is not a measurement of the
performed audio tempo. Import does not invent subjective labels or undeclared
forms; the separate Form module can infer editable section regions.
Editing a field, including clearing it, protects that field on future imports.
Open **MusicXML values** to review differences and explicitly replace selected
fields. Automatic score fields update when alignment changes; manual fields do
not. Metadata is stored per audio content hash in the browser and, with folder
saving enabled, in `.audio_toolkit/assets/<audio-hash>/document.json` alongside
module state. Existing documents without metadata remain compatible.

File library, Layers, Data, Analysis, Appearance, and Piece metadata use the same
collapsible heading; expansion preferences persist in this browser.

### Timeline feature modules

Piece metadata now contains compact curve/region summaries, not full timeline
editors. Its +/open buttons add or focus the corresponding module. The same
modules are available in Add a Module:

- **Score tempo**: declared MusicXML tempo, editable control points. This is
  intentionally separate from **Performed tempo · DTW**.
- **Performed tempo · DTW**: quarter-note beat-clock derivative over aligned
  audio time, averaged over the selected window. Import a MusicXML/MIDI score
  and run its DTW alignment first. Manual anchors refine the result. Missing
  alignment does not manufacture a linear-ratio BPM curve; path plateaus and
  implausible values are gaps. DTW errors can still affect tempo estimates.
- **Mood · VA curve**: two independently colored lines, V and A, on [-1,1].
  Analyze mood requests the optional backend DEAM model. Add/edit points in
  the selected module's Analysis panel; Alt-click a curve time to select its
  nearest control point. Results and manual points persist without rerunning.
- **Form / key / meter regions**: native Marker selection, add, rename, resize,
  and move. These modules use regions, not single-point labels. Their edits
  update the corresponding whole-piece summary and protect it from import.

Form's **Infer score sections** creates editable region markers directly from adjacent
measure pitch distributions, onset density, register and texture. Repeated
section features share letters (A/B/A), without an approval step. Running inference
again replaces existing form regions; markers can be edited afterwards.
It is not a trained formal-analysis model and does not establish
sonata form, cadence functions, or exact phrase boundaries. Explicit rehearsal
labels are still imported as declarations. Inference requires real audio/score
alignment to map their bar boundaries onto the audio timeline.

The backend's `docs/mood-va.md` describes the VA model. Normal `start` now
prepares the Windows C++ worker or macOS native TensorFlow wheel and official
DEAM/MusiCNN weights automatically, then validates inference. Weights have
separate non-commercial licensing (CC BY-NC-SA 4.0); Essentia is AGPL-3.0 or
commercially licensed. Set `MAB_ESSENTIA_SETUP_MOOD=false` in the backend `.env`
to skip VA weights while keeping the 29 DSP modules available.

## Native Essentia feature modules

The Add a Module menu includes 29 `Essentia` modules, in addition to the VA
module: 19 scalar curves (energy, loudness, spectral statistics, pitch and more),
6 matrices (Mel/Bark/ERB, MFCC/GFCC, HPCP), and 4 marker analyses
(onsets, silence, stable pitch regions, key regions).
Curves reuse VectorImageProcessor; matrices reuse MatrixImageProcessor /
MatrixWebGLRenderer; markers reuse the existing editable Marker component.
Analysis and appearance remain separate, including color range and opacity.
HPCP has pitch-class ruler labels; band energy uses relative dB, not absolute dBFS.
Estimated pitch/key regions are not reliable polyphonic transcription or modal analysis.

Normal startup installs and checks the runtime on Windows x64 and macOS Intel /
Apple Silicon; no separate build command is needed. DSP modules need no model
weights (Windows still requires its linked TensorFlow DLL). The portable Windows
worker and all 29 analyses have been exercised through the real API on synthetic
audio. Both macOS architectures have real integration CI configured, not yet run
from this Windows workspace. See the backend's `docs/essentia-features.md` for exact algorithms,
parameter limits, units and accuracy caveats. This is not the entire Essentia suite.

Essentia requests use the same backend and local `.audio_toolkit` result storage
as librosa, with separate engine cache keys. Existing librosa saved results remain
readable. Edited native markers persist as module state instead of recalculating
and overwriting them on reopen.

## Essentia TensorFlow modules

The add-module menu now includes 21 learned-model views: instrument distribution,
instrument relevance and candidate regions; mood/theme distribution and target
curve; genre; timbre; voice/instrumental, acoustic, electronic, tonal,
danceability, happy, sad, relaxed, aggressive and party scores; automatic tags
and target curve; TempoCNN tempo and tempo candidate distributions.

These reuse the existing Vector, Matrix (Canvas2D/WebGL) and editable Marker
renderers, including appearance controls and overlay mode. Curves select a
class from the model's actual vocabulary. Scores are model outputs, not
calibrated probabilities or verified musicological annotations. TempoCNN
estimates audio tempo independently of the score-aligned DTW tempo module.

Normal backend startup prepares pinned official weights and performs real
inference checks. `MAB_ESSENTIA_SETUP_TENSORFLOW=false` or `--basic` skips their
automatic preparation. Backbone embeddings and classifier scores share durable
backend caches; changing the selected label or candidate threshold reuses them.
Recalculate with unchanged parameters explicitly refreshes the analysis.
Results and edited candidate markers also use the opened folder's existing
`.audio_toolkit` persistence, with separate `essentia-tf` cache keys.

Windows native inference is exercised with all 21 views. macOS Intel/ARM
adapters and integration CI are configured, but were not physically executed
from this Windows workspace. See backend `docs/essentia-tensorflow.md` for model
names, context windows, timing, limits and third-party weight licenses.

## Remote deployment model

MusicXML modules can also import **Image / PDF → MusicXML**. The backend lazily
prepares isolated HOMR 0.7 and official CPU models; no separate OMR launch is
needed. Limits are 50 MiB and 20 PDF pages. Recognition has progress and cancel,
then imports the result directly into the score module. Review the generated
score before DTW: OMR may misread rhythm, voices, repeats, slurs and page joins.
Windows image and two-page PDF recognition have been exercised. See backend
`docs/omr.md` for dependencies, cache, licensing and macOS Intel limitations.

Empty score, piano roll, VA, tempo, form/region and CLAP curve modules expose
their key import/analysis actions in the main canvas. Long CLAP relevance curves
stream completed batches into the existing Vector renderer. Cancelling retains
only the visible partial preview, not a completed persisted analysis. Closing
the module or switching audio cancels its outstanding CLAP request. Older
backends fall back to the non-streaming endpoint; restart the updated backend
to enable OMR and progressive curves.

Score structure inference compares ordered melody/rhythm sequences, whole
passages and transposed recurrence, with long repeats as boundary evidence. The
K545 example no longer collapses the final four passages into A. Labels describe
similarity groups, **not** a verified sonata-form analysis (exposition,
development, recapitulation); regions remain manually editable. Re-run inference
to replace previously saved candidate regions; reopening does not overwrite
manual edits.

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
