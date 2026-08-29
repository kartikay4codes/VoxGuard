import React, { useState, useRef, useEffect } from "react";
import { startMicChunkStream } from "../audioUtils";
import { enroll } from "../api";

export default function EnrollPanel({ userId, setUserId, onEnrolled }) {
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(4.0);
  const [clips, setClips] = useState([]);
  const [status, setStatus] = useState("");
  const [enrolledInfo, setEnrolledInfo] = useState(null);
  const stopRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (stopRef.current) stopRef.current();
    };
  }, []);

  const startRecording = async () => {
    setStatus("Listening... speak clearly for 4 seconds");
    setRecording(true);
    setCountdown(4.0);

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, 4.0 - elapsed);
      setCountdown(parseFloat(remaining.toFixed(1)));
    }, 100);

    const stop = await startMicChunkStream({
      chunkSeconds: 4,
      onChunk: (blob) => {
        clearInterval(timerRef.current);
        const clipUrl = URL.createObjectURL(blob);
        setClips((prev) => [...prev, { blob, url: clipUrl, id: Date.now() }]);
        stop2();
      },
      onError: (err) => {
        clearInterval(timerRef.current);
        setRecording(false);
        setStatus(`Mic error: ${err.message}`);
      },
    });

    const stop2 = () => {
      stop();
      setRecording(false);
      setStatus("✓ Audio sample captured successfully.");
    };
    stopRef.current = stop;
  };

  const removeClip = (index) => {
    setClips((prev) => prev.filter((_, i) => i !== index));
  };

  const submitEnrollment = async () => {
    if (!userId.trim() || clips.length === 0) {
      setStatus("⚠️ Please enter a User ID and record at least 1 audio clip.");
      return;
    }
    setStatus("Processing voice embeddings & building reference DNA...");
    try {
      const rawBlobs = clips.map((c) => c.blob);
      const res = await enroll(userId.trim(), rawBlobs);
      setEnrolledInfo(res);
      setStatus(`✓ Successfully enrolled "${res.user_id}" with ${res.chunks_used} Voice-DNA sample(s).`);
      onEnrolled(userId.trim());
    } catch (err) {
      setStatus(`❌ Enrollment failed: ${err.message}`);
    }
  };

  const quickUsers = ["cfo_priya", "ceo_alex", "treasury_director"];

  return (
    <div className="panel">
      <div className="panel-header-row">
        <div>
          <div className="panel-eyebrow">MODULE 01 — ENROLLMENT</div>
          <h2>Voice-DNA Reference Profile</h2>
        </div>
        {enrolledInfo && (
          <span className="status-badge-chip">
            <span className="led led-live" /> ENROLLED: {enrolledInfo.user_id}
          </span>
        )}
      </div>

      <p className="muted">
        Record 1 to 3 short voice samples (a few sentences each, ~4s per take) to extract
        and store the acoustic reference embeddings for real-time verification during live calls.
      </p>

      <div style={{ margin: "16px 0" }}>
        <label className="transfer-field-label">Target Executive / User ID</label>
        <input
          className="text-input"
          placeholder="e.g. cfo_priya"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "4px" }}>
          <span className="muted small">Quick profiles:</span>
          {quickUsers.map((u) => (
            <button
              key={u}
              type="button"
              className="toggle-btn"
              onClick={() => setUserId(u)}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {recording && (
        <div className="record-progress-box">
          <div className="record-spinner" />
          <div className="record-progress-bar-container">
            <div
              className="record-progress-bar"
              style={{ width: `${((4.0 - countdown) / 4.0) * 100}%` }}
            />
          </div>
          <div className="record-time-text">{countdown}s</div>
        </div>
      )}

      <div className="row">
        <button className="btn" onClick={startRecording} disabled={recording}>
          {recording ? "Recording audio..." : "● Record 4s Voice Sample"}
        </button>
        <span className="muted">{clips.length} sample(s) collected</span>
      </div>

      {clips.length > 0 && (
        <div className="clips-list">
          {clips.map((clip, i) => (
            <div key={clip.id} className="clip-item">
              <span className="clip-name">Take #{i + 1} (~4.0s WAV)</span>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <audio controls src={clip.url} style={{ height: "28px" }} />
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => removeClip(i)}
                  disabled={recording}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: "20px" }}>
        <button
          className="btn btn-primary"
          onClick={submitEnrollment}
          disabled={recording || clips.length === 0}
        >
          Submit &amp; Build Voice-DNA
        </button>
      </div>

      <div className="status-line">{status}</div>
    </div>
  );
}
