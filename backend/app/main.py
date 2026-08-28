"""
main.py
--------
VoxGuard backend. Run with:

    uvicorn app.main:app --reload --port 8000

Endpoints:
  POST /enroll                     multipart wav upload(s) -> Voice-DNA embedding
  POST /call/start                 -> new session_id
  WS   /ws/call/{session_id}       stream 2-3s audio chunks, get live trust score back
  POST /challenge/start/{session_id}      -> generates + returns a passphrase
  POST /challenge/respond/{session_id}    multipart wav upload -> challenge result
  GET  /transfer/{session_id}             -> current wire-transfer hold status
  POST /transfer/{session_id}/release     -> manual override / release hold

Audio format expected everywhere: 16-bit PCM mono WAV, ideally 16kHz (the
frontend's recorder is configured to produce exactly this -- see
frontend/src/audioUtils.js). If a different sample rate arrives, it's
resampled with a simple linear interpolation (see `resample_to_16k` below)
rather than rejected, since browsers don't always give you the sample rate
you ask for.
"""

import io
import os
import time
import uuid
import wave
import logging
import numpy as np
from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .storage import store
from .speaker_verify import embed, verify, enroll_embedding
from .synthetic_detector import score as heuristic_score_fn
from . import deep_detector
from .features import extract_features, SAMPLE_RATE
from .fusion import fuse
from . import challenge as challenge_mod
from . import webhook

logger = logging.getLogger("voxguard.main")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="VoxGuard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # demo-only; lock this down before any real deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# "auto" (default): use the deep model if torch/transformers are installed
# and the model downloads successfully; otherwise fall back to the DSP
# heuristic scorer. Set VOXGUARD_DEEP_MODEL=0 to force the lightweight
# heuristic path even if the deep model is available (useful for fast
# iteration without waiting on model inference).
DEEP_MODEL_MODE = os.environ.get("VOXGUARD_DEEP_MODEL", "auto").lower()


def run_synthetic_detection(signal: np.ndarray, sample_rate: int) -> dict:
    """Tries the deep pretrained model first (if enabled and available),
    falls back to the DSP heuristic scorer on any failure -- a chunk that
    fails deep inference should degrade gracefully, not drop the call."""
    if DEEP_MODEL_MODE not in ("0", "false", "off") and deep_detector.is_available():
        try:
            return deep_detector.score(signal, sample_rate)
        except Exception as e:
            logger.warning(f"Deep detector failed on this chunk, falling back to heuristic: {e}")

    feats = extract_features(signal, sample_rate)
    result = heuristic_score_fn(feats)
    result["engine"] = "heuristic"
    return result


@app.on_event("startup")
async def warm_up_detector():
    """Kick off the deep model load at server startup (rather than on the
    first live chunk) so the first real call of the demo isn't the one
    eating a multi-second cold-start model download/load."""
    if DEEP_MODEL_MODE not in ("0", "false", "off"):
        available = deep_detector.is_available()
        if available:
            logger.info("Deep detector ready: %s", deep_detector.MODEL_ID)
        else:
            logger.info(
                "Deep detector not available (%s) -- using heuristic DSP scorer. "
                "Install requirements-ml.txt for the pretrained model.",
                deep_detector.load_error(),
            )
    else:
        logger.info("Deep detector disabled via VOXGUARD_DEEP_MODEL -- using heuristic DSP scorer.")


# --------------------------- audio decode helpers ---------------------------

def wav_bytes_to_array(raw: bytes) -> tuple[np.ndarray, int]:
    with wave.open(io.BytesIO(raw), "rb") as wf:
        sr = wf.getframerate()
        n = wf.getnframes()
        sampwidth = wf.getsampwidth()
        channels = wf.getnchannels()
        frames = wf.readframes(n)

    if sampwidth == 2:
        signal = np.frombuffer(frames, dtype=np.int16).astype(np.float64) / 32768.0
    elif sampwidth == 1:
        signal = (np.frombuffer(frames, dtype=np.uint8).astype(np.float64) - 128) / 128.0
    else:
        raise HTTPException(400, f"Unsupported sample width: {sampwidth} bytes")

    if channels > 1:
        signal = signal.reshape(-1, channels).mean(axis=1)

    if sr != SAMPLE_RATE:
        signal = resample_to_16k(signal, sr)

    return signal, SAMPLE_RATE


def resample_to_16k(signal: np.ndarray, orig_sr: int) -> np.ndarray:
    duration = len(signal) / orig_sr
    n_target = int(duration * SAMPLE_RATE)
    x_old = np.linspace(0, duration, num=len(signal))
    x_new = np.linspace(0, duration, num=n_target)
    return np.interp(x_new, x_old, signal)


# --------------------------------- enrollment --------------------------------

@app.post("/enroll")
async def enroll(user_id: str, files: list[UploadFile] = File(...)):
    """Upload 1-3 short WAV clips of the person's voice (a few sentences
    each is plenty) to build their Voice-DNA reference embedding."""
    chunks = []
    for f in files:
        raw = await f.read()
        signal, sr = wav_bytes_to_array(raw)
        chunks.append(signal)

    if not chunks:
        raise HTTPException(400, "No audio provided")

    embedding = enroll_embedding(chunks, SAMPLE_RATE)
    store.enroll(user_id, embedding)

    return {"user_id": user_id, "status": "enrolled", "chunks_used": len(chunks)}


# ----------------------------------- calls -----------------------------------

@app.post("/call/start")
async def start_call(user_id: str):
    if store.get_voice(user_id) is None:
        raise HTTPException(400, f"No enrolled voice for user_id={user_id}. Call /enroll first.")
    session_id = str(uuid.uuid4())[:8]
    store.create_session(session_id, user_id)
    return {"session_id": session_id, "user_id": user_id}


def process_chunk(session_id: str, signal: np.ndarray) -> dict:
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(404, "Unknown session")

    voice = store.get_voice(session.user_id)
    if voice is None:
        raise HTTPException(400, "No enrolled voice for this session's user")

    synth = run_synthetic_detection(signal, SAMPLE_RATE)
    verify_result = verify(signal, voice.embedding, SAMPLE_RATE)

    fused = fuse(verify_result["similarity"], synth["synthetic_score"])

    session.recent_chunks.append(signal)
    session.recent_chunks = session.recent_chunks[-20:]
    session.trust_history.append({**fused, "timestamp": time.time()})

    hold_result = webhook.maybe_hold_transfer(
        session_id, fused["should_hold_transfer"],
        reason=f"trust score {fused['trust_score']} crossed threshold "
               f"({'; '.join(synth['reasons'][:2])})" if fused["should_hold_transfer"] else None,
    )

    return {
        "session_id": session_id,
        "trust_score": fused["trust_score"],
        "status": fused["status"],
        "should_hold_transfer": fused["should_hold_transfer"],
        "components": fused["components"],
        "reasons": synth["reasons"],
        "engine": synth.get("engine", "heuristic"),
        "transfer_status": hold_result.get("transfer_status", session.transfer_status),
        "timestamp": time.time(),
    }


@app.post("/call/{session_id}/chunk")
async def submit_chunk(session_id: str, file: UploadFile = File(...)):
    """REST fallback for submitting one audio chunk (use the WebSocket
    endpoint below for true live streaming; this exists so the pipeline is
    testable with plain curl/Postman too)."""
    raw = await file.read()
    signal, sr = wav_bytes_to_array(raw)
    return process_chunk(session_id, signal)


@app.websocket("/ws/call/{session_id}")
async def call_stream(websocket: WebSocket, session_id: str):
    """Live streaming endpoint. Frontend sends binary WAV-chunk messages
    (one per ~2-3s window); server responds with a JSON trust update after
    each one. This is the endpoint the live demo actually uses."""
    await websocket.accept()
    try:
        while True:
            raw = await websocket.receive_bytes()
            signal, sr = wav_bytes_to_array(raw)
            result = process_chunk(session_id, signal)
            await websocket.send_json(result)
    except WebSocketDisconnect:
        pass


# --------------------------------- challenge ---------------------------------

@app.post("/challenge/start/{session_id}")
async def start_challenge(session_id: str):
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(404, "Unknown session")
    ch = challenge_mod.generate_passphrase()
    session.active_challenge = ch
    return ch


@app.post("/challenge/respond/{session_id}")
async def respond_challenge(session_id: str, file: UploadFile = File(...)):
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(404, "Unknown session")
    if session.active_challenge is None:
        raise HTTPException(400, "No active challenge for this session")

    voice = store.get_voice(session.user_id)
    raw = await file.read()
    signal, sr = wav_bytes_to_array(raw)
    responded_at = time.time()

    timing = challenge_mod.check_timing_liveness(session.active_challenge["issued_at"], responded_at)
    replay = challenge_mod.check_not_replay(signal, session.recent_chunks)
    content = challenge_mod.verify_transcript_stub(signal, session.active_challenge["phrase"])
    verify_result = verify(signal, voice.embedding, SAMPLE_RATE)

    passed = timing["timing_ok"] and not replay["is_replay"] and verify_result["similarity"] > 0.7

    session.active_challenge = None

    return {
        "timing": timing,
        "replay_check": replay,
        "content_check": content,
        "speaker_similarity": round(verify_result["similarity"], 3),
        "passed": passed,
    }


# ---------------------------------- transfer ----------------------------------

@app.get("/transfer/{session_id}")
async def transfer_status(session_id: str):
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(404, "Unknown session")
    return {"session_id": session_id, "transfer_status": session.transfer_status}


@app.post("/transfer/{session_id}/release")
async def transfer_release(session_id: str):
    return webhook.release_transfer(session_id)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "detector_engine": "deep" if deep_detector.is_available() else "heuristic",
        "deep_model_id": deep_detector.MODEL_ID,
        "deep_model_error": deep_detector.load_error(),
    }
