import React, { useState } from "react";
import { startMicChunkStream } from "../audioUtils";
import { startChallenge, respondChallenge } from "../api";

export default function ChallengePanel({ sessionId }) {
  const [phrase, setPhrase] = useState(null);
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("");

  const issueChallenge = async () => {
    if (!sessionId) {
      setStatus("Start a call session first.");
      return;
    }
    setResult(null);
    const ch = await startChallenge(sessionId);
    setPhrase(ch);
    setStatus("Say the phrase out loud now.");
  };

  const recordResponse = async () => {
    setRecording(true);
    const stop = await startMicChunkStream({
      chunkSeconds: 3,
      onChunk: async (blob) => {
        stop();
        setRecording(false);
        setStatus("Verifying response...");
        try {
          const res = await respondChallenge(sessionId, blob);
          setResult(res);
          setStatus("");
        } catch (err) {
          setStatus(`Verification failed: ${err.message}`);
        }
      },
      onError: (err) => setStatus(`Mic error: ${err.message}`),
    });
  };

  return (
    <div className="panel">
      <h2>3. Challenge-Response</h2>
      <p className="muted">
        Issues a fresh, never-before-heard passphrase mid-call. A replayed or pre-recorded
        clone can't answer a challenge it's never heard.
      </p>
      <button className="btn" onClick={issueChallenge}>
        Issue challenge
      </button>
      {phrase && (
        <div className="challenge-phrase">
          Say: <strong>&ldquo;{phrase.phrase}&rdquo;</strong>
        </div>
      )}
      {phrase && (
        <button className="btn btn-primary" onClick={recordResponse} disabled={recording}>
          {recording ? "Recording response..." : "Record response"}
        </button>
      )}
      {result && (
        <div className={`challenge-result ${result.passed ? "pass" : "fail"}`}>
          <div>{result.passed ? "CHALLENGE PASSED" : "CHALLENGE FAILED"}</div>
          <div className="muted">
            timing: {result.timing.elapsed_sec}s ({result.timing.timing_ok ? "ok" : "failed"}) ·
            {" "}replay check: {result.replay_check.is_replay ? "REPLAY DETECTED" : "ok"} ·
            {" "}speaker similarity: {result.speaker_similarity}
          </div>
          <div className="muted small">
            content check: {result.content_check.note}
          </div>
        </div>
      )}
      <div className="status-line">{status}</div>
    </div>
  );
}
