"""HTTP adapter for running Audio Toolkit's librosa engine outside VS Code."""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Annotated, Any

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))

VERSION = "0.1.0"
ENGINE_VERSION = "librosa-v1"
SUPPORTED_ALGORITHMS = {
    "beats", "onsets", "nonSilent", "rms", "zeroCrossingRate", "onsetStrength",
    "spectralCentroid", "spectralBandwidth", "spectralRolloff", "spectralFlatness",
    "pitch", "melSpectrogram", "chroma", "mfcc",
}
DATA_ROOT = Path(os.environ.get("AUDIO_TOOLKIT_DATA_ROOT", ROOT / ".standalone-data")).resolve()
ASSET_ROOT = DATA_ROOT / "assets"
CACHE_ROOT = DATA_ROOT / "cache"
MAX_UPLOAD_BYTES = int(os.environ.get("AUDIO_TOOLKIT_MAX_UPLOAD_MB", "1024")) * 1024 * 1024
API_TOKEN = os.environ.get("AUDIO_TOOLKIT_API_TOKEN", "")
ALLOWED_ORIGINS = [origin.strip() for origin in os.environ.get(
    "AUDIO_TOOLKIT_CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173"
).split(",") if origin.strip()]

ASSET_ROOT.mkdir(parents=True, exist_ok=True)
CACHE_ROOT.mkdir(parents=True, exist_ok=True)


class AnalysisRequest(BaseModel):
    algorithm: str
    options: dict[str, str | int | float | bool | None] = Field(default_factory=dict)
    cachePolicy: str = "use"


class AssetResponse(BaseModel):
    id: str
    name: str
    size: int
    contentType: str


def require_token(authorization: Annotated[str | None, Header()] = None) -> None:
    if not API_TOKEN:
        return
    if authorization != f"Bearer {API_TOKEN}":
        raise HTTPException(status_code=401, detail="Missing or invalid bearer token")


def safe_suffix(filename: str | None) -> str:
    suffix = Path(filename or "audio.bin").suffix.lower()
    return suffix if re.fullmatch(r"\.[a-z0-9]{1,8}", suffix) else ".bin"


def asset_path(asset_id: str) -> Path:
    if not re.fullmatch(r"[a-f0-9]{64}", asset_id):
        raise HTTPException(status_code=404, detail="Asset not found")
    matches = [path for path in ASSET_ROOT.glob(f"{asset_id}.*") if not path.name.endswith(".meta.json")]
    if not matches:
        raise HTTPException(status_code=404, detail="Asset not found")
    return matches[0]


def cache_path(asset_id: str, request: AnalysisRequest) -> Path:
    descriptor = json.dumps({
        "asset": asset_id,
        "algorithm": request.algorithm,
        "options": request.options,
        "engine": ENGINE_VERSION,
    }, sort_keys=True, separators=(",", ":"))
    return CACHE_ROOT / f"{hashlib.sha256(descriptor.encode()).hexdigest()}.json"


app = FastAPI(title="Audio Toolkit Analysis API", version=VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/api/v1/health", dependencies=[Depends(require_token)])
def health() -> dict[str, str]:
    return {"status": "ok", "version": VERSION}


@app.post("/api/v1/assets", response_model=AssetResponse, dependencies=[Depends(require_token)])
async def create_asset(file: Annotated[UploadFile, File()]) -> AssetResponse:
    digest = hashlib.sha256()
    size = 0
    suffix = safe_suffix(file.filename)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=ASSET_ROOT, delete=False) as temporary:
            temporary_path = Path(temporary.name)
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Audio file exceeds the configured upload limit")
                digest.update(chunk)
                temporary.write(chunk)
        asset_id = digest.hexdigest()
        destination = ASSET_ROOT / f"{asset_id}{suffix}"
        if destination.exists():
            temporary_path.unlink(missing_ok=True)
        else:
            temporary_path.replace(destination)
        metadata = {"id": asset_id, "name": file.filename or destination.name, "size": size, "contentType": file.content_type or "application/octet-stream"}
        (ASSET_ROOT / f"{asset_id}.meta.json").write_text(json.dumps(metadata), encoding="utf-8")
        return AssetResponse(**metadata)
    finally:
        await file.close()
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)


@app.post("/api/v1/assets/{asset_id}/analysis", dependencies=[Depends(require_token)])
def run_analysis(asset_id: str, request: AnalysisRequest) -> dict[str, Any]:
    source = asset_path(asset_id)
    if request.algorithm not in SUPPORTED_ALGORITHMS:
        raise HTTPException(status_code=422, detail=f"Unsupported analysis algorithm: {request.algorithm}")
    cached = cache_path(asset_id, request)
    if request.cachePolicy != "refresh" and cached.exists():
        payload = json.loads(cached.read_text(encoding="utf-8"))
        payload["cache"] = {"status": "hit", "createdAt": payload.get("cache", {}).get("createdAt")}
        return payload
    try:
        from audio_toolkit_engine import analyze
        payload = analyze({"path": str(source), "algorithm": request.algorithm, "options": request.options})
    except SystemExit as exc:
        raise HTTPException(status_code=503, detail="Librosa is not installed in the backend environment") from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"{type(exc).__name__}: {exc}") from exc
    from datetime import datetime, timezone
    status = "refresh" if request.cachePolicy == "refresh" else "miss"
    payload["cache"] = {"status": status, "createdAt": datetime.now(timezone.utc).isoformat()}
    temporary = cached.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    temporary.replace(cached)
    return payload
