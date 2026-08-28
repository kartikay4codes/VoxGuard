import React, { useState, useRef } from "react";
import { startMicChunkStream, fileToChunkedWavBlobs } from "../audioUtils";
import { startCall, openCallSocket } from "../api";
import TrustMeter from "./TrustMeter";
import WaveformStrip from "./WaveformStrip";

export default function CallSimulator({ userId, onSession }) {
  const [sessionId, setSessionId] = useState(null);
  const [live, setLive] = useState(false);
  const [trust, setTrust] = useState({ score: 0, status: "idle" });
  const [reasons, setReasons] = useState([]);
  const [log, setLog] = useState([]);
  const [transferStatus, setTransferStatus] = useState("pending");
  const [levelData, setLevelData] = useState(null);
  const [engine, setEngine] = useState(null);
  const stopMicRef = useRef(null);
  const wsRef = useRef(null);

  const appendLog = (result) => {
    setLog((prev) => [
      { time: new Date().toLocaleTimeString(), ...result },
      ...prev,
    ].slice(0, 12));
  };

  const beginSession = async () => {
    const res = await startCall(userId);
    setSessionId(res.session_id);
    onSession?.(res.session_id);

    const ws = openCallSocket(res.session_id, {
      onMessage: (msg) => {
        setTrust({ score: msg.trust_score, status: msg.status });
        setReasons(msg.reasons || []);
        setTransferStatus(msg.transfer_status);
        setEngine(msg.engine || "heuristic");
        appendLog(msg);
      },
      onError: () => appendLog({ error: "websocket error" }),
      onClose: () => {},
    });
    wsRef.current = ws;
    return res.session_id;
  };

  const startLiveMic = async () => {
    const sid = sessionId || (await beginSession());
    setLive(true);
    const stop = await startMicChunkStream({
      chunkSeconds: 2.5,
      onChunk: (blob) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          blob.arrayBuffer().then((buf) => wsRef.current.send(buf));
        }
      },
      onLevel: (data) => setLevelData(new Uint8Array(data)),
      onError: (err) => appendLog({ error: `mic error: ${err.message}` }),
    });
    stopMicRef.current = stop;
  };

  const stopLiveMic = () => {
    stopMicRef.current?.();
    setLive(false);
    setLevelData(null);
  };

  const playRecordedClip = async (file) => {
    const sid = sessionId || (await beginSession());
    setLive(true);
    const blobs = await fileToChunkedWavBlobs(file, 2.5);
    for (const blob of blobs) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const buf = await blob.arrayBuffer();
        wsRef.current.send(buf);
      }
      await new Promise((r) => setTimeout(r, 2500)); // pace like a real live call
    }
    setLive(false);
  };

  return (
    <div className="panel">
      <div className="panel-eyebrow">MODULE 02</div>
      <h2>Live Call Simulation</h2>
      <p className="muted">
        Speak live into the mic, or upload a pre-recorded clip (a real recording of you, then
        the same sentence run through a voice-cloning tool) to replay it chunk-by-chunk exactly
        like a live call feed — the reliable option for stage demos.
      </p>

      <WaveformStrip levelData={levelData} active={live} />

      <div className="row">
        <button className="btn" onClick={startLiveMic} disabled={live}>
          {live ? "Streaming..." : "Start live mic call"}
        </button>
        <button className="btn" onClick={stopLiveMic} disabled={!live}>
          Stop
        </button>
        <label className="btn file-btn">
          Replay a clip
          <input
            type="file"
            accept="audio/*"
            style={{ display: "none" }}
            onChange={(e) => e.target.files[0] && playRecordedClip(e.target.files[0])}
          />
        </label>
      </div>

      <TrustMeter score={trust.score} status={trust.status} />

      {engine && (
        <div className={`engine-badge engine-${engine}`}>
          {engine === "deep"
            ? "● DEEP MODEL — Gustking/wav2vec2-large-xlsr-deepfake-audio-classification"
            : "● HEURISTIC DSP SCORER (deep model not installed — see requirements-ml.txt)"}
        </div>
      )}

      <div className="gauge-row">
        <div className="reasons-box">
          <div className="reasons-title">Signal breakdown</div>
          {reasons.length === 0 && <div className="muted">No chunks processed yet.</div>}
          <ul>
            {reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <div className={`transfer-pill transfer-${transferStatus}`}>
            Wire transfer: {transferStatus.toUpperCase()}
          </div>
        </div>
      </div>

      <div className="log-box">
        {log.map((entry, i) => (
          <div key={i} className="log-line">
            [{entry.time}] {entry.error ? `ERROR: ${entry.error}` :
              `trust=${entry.trust_score} status=${entry.status}`}
          </div>
        ))}
      </div>
    </div>
  );
}
