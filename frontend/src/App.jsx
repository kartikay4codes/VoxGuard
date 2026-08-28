import React, { useState } from "react";
import EnrollPanel from "./components/EnrollPanel";
import CallSimulator from "./components/CallSimulator";
import ChallengePanel from "./components/ChallengePanel";
import TransferPanel from "./components/TransferPanel";

const MODULES = [
  { id: "enroll", label: "Voice-DNA Enroll", num: "01" },
  { id: "call", label: "Live Call Firewall", num: "02" },
  { id: "challenge", label: "Liveness Challenge", num: "03" },
  { id: "transfer", label: "Linked Wire Hold", num: "04" },
];

export default function App() {
  const [active, setActive] = useState("enroll");
  const [userId, setUserId] = useState("cfo_priya");
  const [enrolled, setEnrolled] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  return (
    <div className="console-shell">
      <aside className="nav-rail">
        <div className="brand-mark">
          <div className="brand-icon">🛡️</div>
          <div>
            <span className="brand-text">VoxGuard</span>
            <span className="brand-badge">PRO v2.0</span>
          </div>
        </div>

        <nav>
          {MODULES.map((m) => (
            <button
              key={m.id}
              className={`nav-item ${active === m.id ? "nav-item-active" : ""}`}
              onClick={() => setActive(m.id)}
            >
              <span className="nav-item-num">{m.num}</span>
              {m.label}
            </button>
          ))}
        </nav>

        <div className="nav-rail-footer">
          <div className="status-row">
            <span className="led led-live" />
            <span>Firewall Active</span>
          </div>
          <div className="muted small" style={{ fontFamily: "var(--font-mono)" }}>
            {sessionId ? `Session #${sessionId}` : "Standby (No session)"}
          </div>
        </div>
      </aside>

      <main className="console-main">
        <header className="console-header">
          <div className="console-title-group">
            <div className="console-title">
              Deepfake Voice Firewall
              <span className="status-badge-chip">
                <span className="led led-live" /> REAL-TIME PROTECTED
              </span>
            </div>
            <div className="muted">
              Live biometric authentication &amp; synthetic speech detection for corporate authorizations.
            </div>
          </div>

          <div className="meta-chips-bar">
            <div className="meta-chip">
              Target ID: <strong>{userId || "None"}</strong>
            </div>
            <div className="meta-chip">
              Session: <strong>{sessionId || "Inactive"}</strong>
            </div>
          </div>
        </header>

        <div className="module-area">
          {active === "enroll" && (
            <EnrollPanel
              userId={userId}
              setUserId={setUserId}
              onEnrolled={(id) => {
                setUserId(id);
                setEnrolled(true);
              }}
            />
          )}
          {active === "call" && (
            <CallSimulator
              userId={userId}
              onSession={(sid) => setSessionId(sid)}
            />
          )}
          {active === "challenge" && <ChallengePanel sessionId={sessionId} />}
          {active === "transfer" && <TransferPanel sessionId={sessionId} />}
        </div>

        <footer className="app-footer">
          <div>
            VoxGuard Endpoint: <code>http://localhost:8000</code>
          </div>
          <div>
            {!enrolled
              ? "Tip: Record sample audio in Module 01 before starting a live call."
              : `Active Voice-DNA Profile: ${userId}`}
          </div>
        </footer>
      </main>
    </div>
  );
}
