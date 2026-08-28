import React, { useState, useRef, useEffect } from "react";
import { startMicChunkStream } from "../audioUtils";
import { startChallenge, respondChallenge } from "../api";

export default function ChallengePanel({ sessionId }) {
  const [phrase, setPhrase] = useState(null);
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(3.0);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const issueChallenge = async () => {
    if (!sessionId) {
      setStatus("⚠️ Start a live call session (Module 02) first.");
      return;
    }
    setResult(null);
    setStatus("Requesting cryptographic liveness challenge from firewall...");
    try {
      const ch = await startChallenge(sessionId);
      setPhrase(ch);
      setStatus("Phrase issued. Instruct the caller to read the prompt out loud.");
    } catch (err) {
      setStatus(`Failed to generate challenge: ${err.message}`);
    }
  };

  const recordResponse = async () => {
    setRecording(true);
    setCountdown(3.0);
    setStatus("Listening for caller response (3s window)...");

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, 3.0 - elapsed);
      setCountdown(parseFloat(remaining.toFixed(1)));
    }, 100);

    const stop = await startMicChunkStream({
      chunkSeconds: 3,
      onChunk: async (blob) => {
        clearInterval(timerRef.current);
        stop();
        setRecording(false);
        setStatus("Verifying acoustic parameters, latency, and anti-replay buffer...");
        try {
          const res = await respondChallenge(sessionId, blob);
          setResult(res);
          setStatus(res.passed ? "✓ Challenge successfully validated." : "⚠️ Challenge failed security criteria.");
        } catch (err) {
          setStatus(`Verification error: ${err.message}`);
        }
      },
      onError: (err) => {
        clearInterval(timerRef.current);
        setRecording(false);
        setStatus(`Mic error: ${err.message}`);
      },
    });
  };

  return (
    <div className="panel">
      <div className="panel-header-row">
        <div>
          <div className="panel-eyebrow">MODULE 03 — ACTIVE LIVENESS</div>
          <h2>Biometric Challenge-Response</h2>
        </div>
        {sessionId && (
          <span className="status-badge-chip">
            <span className="led led-live" /> SESSION: {sessionId}
          </span>
        )}
      </div>

      <p className="muted">
        Generates a fresh, unpredictable phonetic passphrase mid-call. A pre-recorded
        or non-interactive voice clone cannot anticipate or synthesize an unscripted challenge in real time.
      </p>

      <div style={{ margin: "16px 0" }}>
        <button className="btn" onClick={issueChallenge} disabled={recording}>
          ⚡ Issue Fresh Passphrase Challenge
        </button>
      </div>

      {phrase && (
        <div className="teleprompter-card">
          <div className="teleprompter-label">Caller Teleprompter Prompt</div>
          <div className="teleprompter-phrase">&ldquo;{phrase.phrase}&rdquo;</div>
        </div>
      )}

      {phrase && (
        <div style={{ marginTop: "14px" }}>
          {recording && (
            <div className="record-progress-box">
              <div className="record-spinner" />
              <div className="record-progress-bar-container">
                <div
                  className="record-progress-bar"
                  style={{ width: `${((3.0 - countdown) / 3.0) * 100}%` }}
                />
              </div>
              <div className="record-time-text">{countdown}s</div>
            </div>
          )}
          <button
            className="btn btn-primary"
            onClick={recordResponse}
            disabled={recording}
          >
            {recording ? "Recording response window..." : "● Record Caller Response (3s)"}
          </button>
        </div>
      )}

      {result && (
        <div className={`challenge-result ${result.passed ? "pass" : "fail"}`}>
          <div style={{ fontSize: "16px", fontWeight: "700", marginBottom: "8px" }}>
            {result.passed ? "🛡️ CHALLENGE PASSED — AUTHENTIC CALLER" : "🚨 CHALLENGE FAILED — SUSPECTED CLONE / REPLAY"}
          </div>

          <div className="challenge-breakdown-grid">
            <div className="challenge-stat-card">
              <div className="challenge-stat-label">Response Latency</div>
              <div className="challenge-stat-value" style={{ color: result.timing.timing_ok ? "var(--green)" : "var(--red)" }}>
                {result.timing.elapsed_sec}s ({result.timing.timing_ok ? "Normal" : "Laggy"})
              </div>
            </div>

            <div className="challenge-stat-card">
              <div className="challenge-stat-label">Anti-Replay Check</div>
              <div className="challenge-stat-value" style={{ color: !result.replay_check.is_replay ? "var(--green)" : "var(--red)" }}>
                {result.replay_check.is_replay ? "REPLAY DETECTED" : "Fresh Signal"}
              </div>
            </div>

            <div className="challenge-stat-card">
              <div className="challenge-stat-label">Speaker Similarity</div>
              <div className="challenge-stat-value" style={{ color: result.speaker_similarity >= 0.7 ? "var(--green)" : "var(--red)" }}>
                {(result.speaker_similarity * 100).toFixed(1)}% Match
              </div>
            </div>
          </div>

          <div className="muted small" style={{ marginTop: "10px" }}>
            Content note: {result.content_check?.note || "Acoustic envelope verified against phonetic template."}
          </div>
        </div>
      )}

      <div className="status-line">{status}</div>
    </div>
  );
}
