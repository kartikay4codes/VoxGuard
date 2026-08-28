import React, { useState, useRef } from "react";
import { startMicChunkStream } from "../audioUtils";
import { enroll } from "../api";

export default function EnrollPanel({ userId, setUserId, onEnrolled }) {
  const [recording, setRecording] = useState(false);
  const [clips, setClips] = useState([]);
  const [status, setStatus] = useState("");
  const stopRef = useRef(null);

  const startRecording = async () => {
    setStatus("Recording ~4s enrollment clip...");
    setRecording(true);
    const stop = await startMicChunkStream({
      chunkSeconds: 4,
      onChunk: (blob) => {
        setClips((prev) => [...prev, blob]);
        stop2();
      },
      onError: (err) => setStatus(`Mic error: ${err.message}`),
    });
    const stop2 = () => {
      stop();
      setRecording(false);
      setStatus("Clip captured.");
    };
    stopRef.current = stop;
  };

  const submitEnrollment = async () => {
    if (!userId || clips.length === 0) {
      setStatus("Need a user ID and at least one recorded clip.");
      return;
    }
    setStatus("Enrolling...");
    try {
      const res = await enroll(userId, clips);
      setStatus(`Enrolled ${res.user_id} using ${res.chunks_used} clip(s).`);
      onEnrolled(userId);
    } catch (err) {
      setStatus(`Enrollment failed: ${err.message}`);
    }
  };

  return (
    <div className="panel">
      <h2>1. Enroll Voice-DNA</h2>
      <p className="muted">
        Record 1-3 short clips (a few sentences each, ~4s per take) to build the reference
        embedding VoxGuard verifies live calls against.
      </p>
      <input
        className="text-input"
        placeholder="user id (e.g. cfo_priya)"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
      />
      <div className="row">
        <button className="btn" onClick={startRecording} disabled={recording}>
          {recording ? "Recording..." : "Record 4s clip"}
        </button>
        <span className="muted">{clips.length} clip(s) captured</span>
      </div>
      <button className="btn btn-primary" onClick={submitEnrollment}>
        Submit enrollment
      </button>
      <div className="status-line">{status}</div>
    </div>
  );
}
