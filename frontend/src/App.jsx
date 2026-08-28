import React, { useState } from "react";
import EnrollPanel from "./components/EnrollPanel";
import CallSimulator from "./components/CallSimulator";
import ChallengePanel from "./components/ChallengePanel";
import TransferPanel from "./components/TransferPanel";

const MODULES = [
  { id: "enroll", label: "Enroll", num: "01" },
  { id: "call", label: "Live Call", num: "02" },
  { id: "challenge", label: "Challenge", num: "03" },
  { id: "transfer", label: "Transfer Hold", num: "04" },
];

export default function App() {
  const [active, setActive] = useState("enroll");
  const [userId, setUserId] = useState("");
  const [enrolled, setEnrolled] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  return (
    <div className="console-shell">
      <aside className="nav-rail">
        <div className="brand-mark">
          <span className="brand-dot" />
          VoxGuard
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
            System active
          </div>
          <div className="session-id muted">
            {sessionId ? `session ${sessionId}` : "no active session"}
          </div>
        </div>
      </aside>

      <main className="console-main">
        <header className="console-header">
          <div>
            <div className="console-title">Deepfake Voice Firewall</div>
            <div className="muted">Live scoring for corporate calls — preventative, not forensic.</div>
          </div>
        </header>

        <div className="module-area">
          {active === "enroll" && (
            <EnrollPanel userId={userId} setUserId={setUserId} onEnrolled={() => setEnrolled(true)} />
          )}
          {active === "call" && <CallSimulator userId={userId} onSession={setSessionId} />}
          {active === "challenge" && <ChallengePanel sessionId={sessionId} />}
          {active === "transfer" && <TransferPanel sessionId={sessionId} />}
        </div>

        <footer className="app-footer">
          Backend must be running at the URL set in VITE_API_URL (default http://localhost:8000).
          {!enrolled && " Enroll a voice first before starting a call."}
        </footer>
      </main>
    </div>
  );
}
