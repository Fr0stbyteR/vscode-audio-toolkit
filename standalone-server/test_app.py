from __future__ import annotations

import json
import asyncio
import io
import math
import struct
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

import app
from starlette.datastructures import Headers, UploadFile


class StorageTests(unittest.TestCase):
    def test_suffix_is_sanitized(self) -> None:
        self.assertEqual(app.safe_suffix("sound.WAV"), ".wav")
        self.assertEqual(app.safe_suffix("sound.not/a/type"), ".bin")

    def test_cache_key_is_stable_and_option_sensitive(self) -> None:
        with tempfile.TemporaryDirectory() as directory, patch.object(app, "CACHE_ROOT", Path(directory)):
            one = app.AnalysisRequest(algorithm="rms", options={"hopLength": 512})
            same = app.AnalysisRequest(algorithm="rms", options={"hopLength": 512})
            changed = app.AnalysisRequest(algorithm="rms", options={"hopLength": 256})
            self.assertEqual(app.cache_path("a" * 64, one), app.cache_path("a" * 64, same))
            self.assertNotEqual(app.cache_path("a" * 64, one), app.cache_path("a" * 64, changed))

    def test_cache_descriptor_is_json_serializable(self) -> None:
        request = app.AnalysisRequest(algorithm="chroma", options={"tuning": 0.0})
        self.assertIsInstance(json.dumps(request.model_dump()), str)

    def test_upload_analysis_and_cache_hit(self) -> None:
        audio = io.BytesIO()
        sample_rate = 22050
        samples = [round(math.sin(2 * math.pi * 440 * index / sample_rate) * 12000) for index in range(sample_rate)]
        with wave.open(audio, "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(sample_rate)
            output.writeframes(struct.pack(f"<{len(samples)}h", *samples))
        with tempfile.TemporaryDirectory() as directory:
            asset_root = Path(directory) / "assets"
            cache_root = Path(directory) / "cache"
            asset_root.mkdir()
            cache_root.mkdir()
            with patch.object(app, "ASSET_ROOT", asset_root), patch.object(app, "CACHE_ROOT", cache_root):
                upload = UploadFile(io.BytesIO(audio.getvalue()), filename="tone.wav", headers=Headers({"content-type": "audio/wav"}))
                uploaded = asyncio.run(app.create_asset(upload))
                first = app.run_analysis(uploaded.id, app.AnalysisRequest(algorithm="rms", options={"hopLength": 256}))
                self.assertEqual(first["cache"]["status"], "miss")
                second = app.run_analysis(uploaded.id, app.AnalysisRequest(algorithm="rms", options={"hopLength": 256}))
                self.assertEqual(second["cache"]["status"], "hit")


if __name__ == "__main__":
    unittest.main()
