import React, { useEffect, useState } from "react";
import { getTransferStatus, releaseTransfer } from "../api";

export default function TransferPanel({ sessionId }) {
  const [status, setStatus] = useState("pending");
  const [overrideNote, setOverrideNote] = useState("");
  const [actionMsg, setActionMsg] = useState("");

  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(async () => {
      try {
        const res = await getTransferStatus(sessionId);
        setStatus(res.transfer_status);
      } catch {
        /* session might not exist yet */
      }
    }, 1200);
    return () => clearInterval(interval);
  }, [sessionId]);

  const doRelease = async () => {
    if (!sessionId) return;
    setActionMsg("Processing security override & clearing webhook lock...");
    try {
      const res = await releaseTransfer(sessionId);
      setStatus(res.transfer_status);
      setActionMsg("✓ Hold released by security officer override.");
    } catch (err) {
      setActionMsg(`Failed to release hold: ${err.message}`);
    }
  };

  return (
    <div className="panel">
      <div className="panel-header-row">
        <div>
          <div className="panel-eyebrow">MODULE 04 — FRAUD PREVENTION WEBHOOK</div>
          <h2>Linked High-Value Wire Authorization</h2>
        </div>
        <div className={`transfer-pill large transfer-${status}`}>
          <span className={`led ${status === "held" ? "led-danger" : status === "released" ? "led-live" : "led-warn"}`} />
          WIRE {status.toUpperCase()}
        </div>
      </div>

      <p className="muted">
        Simulates an automated webhook integration with corporate ERP &amp; SWIFT banking rails.
        The instant deepfake or voice spoof indicators cross risk thresholds mid-call, the pending wire
        is locked automatically before funds exit the organization.
      </p>

      <div className="transfer-card">
        <div className="transfer-card-header">
          <span className="transfer-tx-id">TX-REF: #SWIFT-2026-98421</span>
          <span className="muted small">Session: {sessionId || "Awaiting Call"}</span>
        </div>

        <div className="transfer-grid">
          <div>
            <div className="transfer-field-label">Transfer Amount</div>
            <div className="transfer-field-value amount">$250,000.00 USD</div>
          </div>
          <div>
            <div className="transfer-field-label">Beneficiary</div>
            <div className="transfer-field-value">Apex Global Offshore Ltd</div>
          </div>
          <div>
            <div className="transfer-field-label">Routing Bank</div>
            <div className="transfer-field-value">Chase Commercial (NYC)</div>
          </div>
          <div>
            <div className="transfer-field-label">Settlement Status</div>
            <div className="transfer-field-value">
              {status === "held" ? (
                <span style={{ color: "var(--red)" }}>🔒 FROZEN (VOICE SPOOF TRIGGER)</span>
              ) : status === "released" ? (
                <span style={{ color: "var(--green)" }}>✓ SETTLED (AUTHORIZED)</span>
              ) : (
                <span style={{ color: "var(--amber)" }}>⏳ PENDING AUDIO VERIFICATION</span>
              )}
            </div>
          </div>
        </div>

        {status === "held" && (
          <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--panel-border)" }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <input
                className="text-input"
                style={{ flex: 1, margin: 0 }}
                placeholder="Security analyst override justification..."
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
              />
              <button className="btn btn-primary" onClick={doRelease}>
                🔓 Security Officer Override: Release Hold
              </button>
            </div>
          </div>
        )}
      </div>

      {actionMsg && <div className="status-line">{actionMsg}</div>}
    </div>
  );
}
