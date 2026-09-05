"""Small, dependency-light JSON bridge between VS Code and librosa."""

from __future__ import annotations

import json
import sys
from typing import Any


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


try:
    import librosa
    import numpy as np
except ImportError as exc:
    fail(
        "Librosa backend is unavailable. Install it with "
        f"'python -m pip install -r requirements-librosa.txt'. ({exc})"
    )


def number(value: Any) -> float:
    array = np.asarray(value).reshape(-1)
    return float(array[0]) if array.size else 0.0


def analyze(payload: dict[str, Any]) -> dict[str, Any]:
    path = payload["path"]
    algorithm = payload["algorithm"]
    options = payload.get("options") or {}
    y, sample_rate = librosa.load(path, sr=None, mono=True)
    duration = float(len(y) / sample_rate)
    result: dict[str, Any] = {
        "algorithm": algorithm,
        "sampleRate": int(sample_rate),
        "duration": duration,
    }

    if algorithm == "beats":
        hop_length = int(options.get("hopLength", 512))
        start_bpm = float(options.get("startBpm", 120))
        tempo, frames = librosa.beat.beat_track(
            y=y, sr=sample_rate, hop_length=hop_length, start_bpm=start_bpm
        )
        result["values"] = librosa.frames_to_time(
            frames, sr=sample_rate, hop_length=hop_length
        ).tolist()
        result["metadata"] = {"tempo": number(tempo)}
    elif algorithm == "onsets":
        hop_length = int(options.get("hopLength", 512))
        backtrack = bool(options.get("backtrack", False))
        frames = librosa.onset.onset_detect(
            y=y, sr=sample_rate, hop_length=hop_length, backtrack=backtrack
        )
        result["values"] = librosa.frames_to_time(
            frames, sr=sample_rate, hop_length=hop_length
        ).tolist()
    elif algorithm == "nonSilent":
        top_db = float(options.get("topDb", 60))
        frame_length = int(options.get("frameLength", 2048))
        hop_length = int(options.get("hopLength", 512))
        intervals = librosa.effects.split(
            y, top_db=top_db, frame_length=frame_length, hop_length=hop_length
        )
        result["intervals"] = (intervals / float(sample_rate)).tolist()
    else:
        fail(f"Unsupported analysis algorithm: {algorithm}")
    return result


def main() -> None:
    try:
        payload = json.load(sys.stdin)
        print(json.dumps(analyze(payload), separators=(",", ":")))
    except Exception as exc:  # Return concise diagnostics to the extension host.
        fail(f"{type(exc).__name__}: {exc}")


if __name__ == "__main__":
    main()
