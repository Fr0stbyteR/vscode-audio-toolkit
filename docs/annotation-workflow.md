# Interactive music annotation: first usable loop and accuracy plan

## What works now (standalone web app)

The right inspector has an **Annotations** section for the open file. Select a time range and add a human annotation, or place the cursor and add a short interval. The CLAP description module has a `+` next to each label and raw prompt match; it saves the model output as a **suggestion**, anchored to the interval that was actually analyzed. The timeline displays reviewed and pending intervals separately. Open an annotation to adjust its label, family, boundaries, and note, then confirm, reject, or mark it ambiguous. Rejecting retains the example for later feedback analysis.

Annotations are kept locally in IndexedDB, keyed by file length plus a SHA-256 digest of the first and last 256 KiB. They survive reopening the same audio in the same browser profile. Export a versioned JSON file before clearing browser storage or moving computers; import merges matching-file records without overwriting existing IDs. This is a **local review format**, not yet a backend training snapshot. Audio is not uploaded merely to create or edit these annotations.

The collapsible **Review queue** below the local file tree summarizes annotations across audio files previously opened in this browser profile. Its export bundles these documents and their review states for backup and exchange, without audio or credentials. It does not scan unopened files in the selected directory. The sampled fingerprint is sufficient for this local lookup but not a collision-resistant full-file identity for model training; the bundle is marked `review-exchange-not-training` until a backend import verifies complete audio hashes, sample coordinates, taxonomy IDs, provenance, and conflicts.

CLAP's match score is evidence, **not a calibrated probability**. A model suggestion never becomes confirmed automatically, and accepting one does not update model weights yet.

## Why one CLAP model is not enough

Audio–text embedding similarity is useful for proposing broad semantic labels and finding related excerpts. A clip-level score does not directly establish note onset, fine playing technique, functional harmony, compositional device, or formal boundary. Short events need context and a frame/event head; harmony and form need multi-scale temporal reasoning, and often score-aligned evidence. The current music backend v0.2 already has demand-driven detection plans and explicit `suggested`/`confirmed` states, but its exposed API does not yet offer a project audio upload path for remote deployments or an endpoint that trains/publishes a model from human corrections.

The intended inference stack is therefore:

| Scale | Evidence | Output | Human review |
| --- | --- | --- | --- |
| Clip/phrase | CLAP/MuLan prompt ensembles, prototypes | Instrument, texture, technique hypotheses | Compare similar/confusable prompts and abstain on weak matches |
| Event/note | Onsets, pitch tracks, spectral features, temporal embeddings | Note, articulation, dynamic/timbre transitions | Drag exact boundaries; inspect spectrum and playback |
| Section/work | Repetition/novelty, chords/key, score alignment, long-context models | Harmony, motifs, form/function | Edit hierarchical sections and supporting evidence |

The user-facing taxonomy should keep **source**, **state**, **model version**, **time range**, and **evidence** separate from the label. An uncalibrated score must never be rendered as a confidence percentage.

## Dataset use and validation

The read-only `F:\` collection has instrument families and technique folders (for example, violin artificial harmonics, sul ponticello, col legno, and vibrato variants), plus note/dynamic information in filenames. It is useful for an **isolated-sound** instrument/technique/pitch benchmark and for generating candidate taxonomy terms. Do not infer that labels from isolated samples transfer accurately to polyphonic recordings. Do not copy or train on the audio until the license covering this particular local copy has been checked. [OrchideaSOL's official record](https://zenodo.org/records/3740399) describes the related SOL-derived isolated-note material, an official five-fold split, and distinct audio/metadata license terms.

The browser workspace can open uncompressed AIFF/AIFC PCM (`NONE`/`sowt`, 8/16/24/32-bit) locally even when the browser's built-in decoder does not support `.aif`. Compressed AIFF remains unsupported and reports an explicit error. The fallback decoder is exercised with synthetic files and a read-only sample from `F:\`; this only establishes file readability, not annotation or model accuracy.

Possible complementary benchmarks, to be obtained and licensed separately:

- [MedleyDB](https://steinhardt.nyu.edu/marl/research/resources/medleydb): multitrack instrument activations and melody/pitch annotations; tests transfer beyond isolated notes.
- [MAESTRO](https://magenta.withgoogle.com/datasets/maestro): closely aligned piano audio/MIDI for note timing and velocity; piano-specific, with a non-commercial share-alike license.
- [SALAMI](https://ddmal.ca/research/salami/annotation/): structural section annotations; audio availability and annotator disagreement must be accounted for.
- [McGill Billboard](https://ddmal.ca/research/The_McGill_Billboard_Project_%28Chord_Analysis_Dataset%29/): chord annotations for harmony experiments; not a substitute for a general music-theory label set.
- [MusicCaps](https://huggingface.co/datasets/google/MusicCaps/blob/main/README.md): musician-written captions and aspects, useful for language coverage but not fine event boundaries.

Never randomly split windows from the same recording across train/test. Group by recording, performer/session, instrument, and composition where known. Report per-family and per-technique macro-F1/AUPRC, event onset/offset F1 at stated tolerances, boundary error, calibration, and out-of-domain abstention. Compare against simple descriptor baselines and a frozen-embedding prototype/head before considering backbone fine-tuning. Preserve a held-out, group-disjoint test set that interactive corrections cannot leak into.

## Next backend contract

1. Add project-scoped streamed audio upload and content-hash deduplication; browser-selected local paths are not valid paths on a remote backend.
2. Add versioned taxonomy CRUD and a mapping from free-text local labels to stable label IDs, including hierarchy and mutually confusable techniques.
3. Import the review JSON only after resolving asset hashes, sample rates, label IDs, and conflicts; use backend revisions/ETags and audit history.
4. Build an active-learning queue from uncertainty, model disagreement, taxonomy coverage, and random high-confidence audits. Do not train on rejected/ambiguous labels as positives.
5. Train frozen-embedding prototypes or a temporal head on immutable, group-split snapshots. Show metrics and calibration before an explicit publish decision. Keep the previous model available for rollback.

The local annotation UI is deliberately useful while that contract is being built; it does not claim to have fine-tuned CLAP or to provide accurate musicological analysis on its own.
