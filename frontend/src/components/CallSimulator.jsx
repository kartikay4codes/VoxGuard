import React, { useState, useRef, useCallback } from "react";
import { startMicChunkStream, fileToChunkedWavBlobs } from "../audioUtils";
import { startCall, openCallSocket } from "../api";
import TrustMeter from "./TrustMeter";
import TrustGauge from "./TrustGauge";
import WaveformStrip from "./WaveformStrip";

export default function CallSimulator({ userId, onSession }) {
  const [sessionId, setSessionId] = useState(null);
  const [live, setLive] = useState(false);
  const [meterType, setMeterType] = useState("bar"); // "bar" or "gauge"
  const [trust, setTrust] = useState({ score: 0, status: "idle" });
  const [reasons, setReasons] = useState([]);
  const [log, setLog] = useState([]);
  const [transferStatus, setTransferStatus] = useState("pending");
  const [levelData, setLevelData] = useState(null);
  const [engine, setEngine] = useState(null);
  const stopMicRef = useRef(null);
  const wsRef = useRef(null);
  const lastLevelUpdateRef = useRef(0);

  const appendLog = useCallback((result) => {
    setLog((prev) => [
      {
        id: Date.now() + Math.random(),
        time: new Date().toLocaleTimeString(),
        ...result,
      },
      ...prev,
    ].slice(0, 20));
  }, []);

  const beginSession = async () => {
    if (!userId) {
      appendLog({ error: "Enroll a Voice-DNA profile in Module 01 before starting a call." });
      throw new Error("No user enrolled");
    }
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
      onError: () => appendLog({ error: "WebSocket stream disconnected or error." }),
      onClose: () => {},
    });
    wsRef.current = ws;
    return res.session_id;
  };

  const handleLevel = useCallback((data) => {
    const now = Date.now();
    // Throttle React state update to max 30 FPS to eliminate layout thrashing
    if (now - lastLevelUpdateRef.current > 33) {
      lastLevelUpdateRef.current = now;
      setLevelData(new Uint8Array(data));
    }
  }, []);

  const startLiveMic = async () => {
    try {
      const sid = sessionId || (await beginSession());
      setLive(true);
      const stop = await startMicChunkStream({
        chunkSeconds: 2.5,
        onChunk: (blob) => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            blob.arrayBuffer().then((buf) => wsRef.current.send(buf));
          }
        },
        onLevel: handleLevel,
        onError: (err) => appendLog({ error: `Mic capture error: ${err.message}` }),
      });
      stopMicRef.current = stop;
    } catch (e) {
      /* Handled in beginSession */
    }
  };

  const stopLiveMic = () => {
    stopMicRef.current?.();
    setLive(false);
    setLevelData(null);
  };

  const playRecordedClip = async (file) => {
    try {
      const sid = sessionId || (await beginSession());
      setLive(true);
      const blobs = await fileToChunkedWavBlobs(file, 2.5);
      appendLog({ info: `Streaming pre-recorded clip (${blobs.length} chunks)...` });
      for (const blob of blobs) {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const buf = await blob.arrayBuffer();
          wsRef.current.send(buf);
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
      setLive(false);
    } catch (e) {
      /* Handled */
    }
  };

  const exportLogs = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(log, null, 2));
    const dl = document.createElement("a");
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", `voxguard_audit_${sessionId || "session"}.json`);
    dl.click();
  };

  return (
    <div className="panel">
      <div className="panel-header-row">
        <div>
          <div className="panel-eyebrow">MODULE 02 — REAL-TIME INGESTION</div>
          <h2>Live Stream Voice Firewall</h2>
        </div>
        <div className="view-toggle-group">
          <button
            className={`toggle-btn ${meterType === "bar" ? "active" : ""}`}
            onClick={() => setMeterType("bar")}
          >
            Segment Bar
          </button>
          <button
            className={`toggle-btn ${meterType === "gauge" ? "active" : ""}`}
            onClick={() => setMeterType("gauge")}
          >
            Radial Gauge
          </button>
        </div>
      </div>

      <p className="muted">
        Streams real-time audio in ~2.5s windows. The firewall extracts spectral features,
        pitch micro-instability (jitter/shimmer), and compares embeddings against the target's Voice-DNA reference.
      </p>

      <WaveformStrip levelData={levelData} active={live} />

      <div className="row">
        <button className="btn btn-primary" onClick={startLiveMic} disabled={live}>
          {live ? "● Live Stream Active..." : "🎙️ Start Live Mic Call"}
        </button>
        <button className="btn btn-danger" onClick={stopLiveMic} disabled={!live}>
          ⏹ End Call
        </button>
        <label className="btn file-btn">
          📂 Replay Audio File (.wav/.mp3)
          <input
            type="file"
            accept="audio/*"
            style={{ display: "none" }}
            onChange={(e) => e.target.files[0] && playRecordedClip(e.target.files[0])}
          />
        </label>
      </div>

      {meterType === "bar" ? (
        <TrustMeter score={trust.score} status={trust.status} />
      ) : (
        <TrustGauge score={trust.score} status={trust.status} />
      )}

      {engine && (
        <div className={`engine-badge engine-${engine}`}>
          {engine === "deep"
            ? "⚡ PRETRAINED DEEP TRANSFORMER — Gustking/wav2vec2-large-xlsr-deepfake"
            : "⚡ LIGHTWEIGHT DSP HEURISTIC ENGINE (<20ms latency mode)"}
        </div>
      )}

      <div className="gauge-row">
        <div className="reasons-box">
          <div className="reasons-title">Acoustic Signal Breakdown</div>
          {reasons.length === 0 ? (
            <div className="muted small">Awaiting live audio chunk evaluation...</div>
          ) : (
            <ul>
              {reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: "12px" }}>
            <div className={`transfer-pill transfer-${transferStatus}`}>
              <span className={`led ${transferStatus === "held" ? "led-danger" : transferStatus === "released" ? "led-live" : "led-warn"}`} />
              Linked Transfer: {transferStatus.toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      <div className="log-box-container">
        <div className="log-box-header">
          <span className="log-box-title">SECURITY AUDIT TRAIL</span>
          <div className="log-box-actions">
            <button className="toggle-btn" onClick={exportLogs} disabled={log.length === 0}>
              Export JSON
            </button>
            <button className="toggle-btn" onClick={() => setLog([])} disabled={log.length === 0}>
              Clear
            </button>
          </div>
        </div>

        <div className="log-box">
          {log.length === 0 ? (
            <div className="muted small">No audit entries recorded for this session.</div>
          ) : (
            log.map((entry) => {
              const isCrit = entry.status === "critical" || entry.error;
              const isWarn = entry.status === "warning";
              const isOk = entry.status === "trusted";
              return (
                <div key={entry.id} className="log-line">
                  <span className="log-time">[{entry.time}]</span>
                  {entry.error ? (
                    <span className="log-badge log-badge-crit">ERROR</span>
                  ) : isCrit ? (
                    <span className="log-badge log-badge-crit">CRITICAL</span>
                  ) : isWarn ? (
                    <span className="log-badge log-badge-warn">WARNING</span>
                  ) : isOk ? (
                    <span className="log-badge log-badge-ok">TRUSTED</span>
                  ) : (
                    <span className="log-badge log-badge-ok">INFO</span>
                  )}
                  <span>
                    {entry.error
                      ? entry.error
                      : entry.info
                      ? entry.info
                      : `Trust Score: ${entry.trust_score?.toFixed(1) || 0} | Status: ${entry.status || "idle"} | Hold: ${entry.should_hold_transfer ? "ACTIVE" : "NONE"}`}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
