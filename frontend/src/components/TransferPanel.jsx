import React, { useEffect, useState } from "react";
import { getTransferStatus, releaseTransfer } from "../api";

export default function TransferPanel({ sessionId }) {
  const [status, setStatus] = useState("pending");

  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(async () => {
      try {
        const res = await getTransferStatus(sessionId);
        setStatus(res.transfer_status);
      } catch {
        /* session might not exist yet */
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [sessionId]);

  const doRelease = async () => {
    const res = await releaseTransfer(sessionId);
    setStatus(res.transfer_status);
  };

  return (
    <div className="panel">
      <h2>4. Linked Wire-Transfer Approval</h2>
      <p className="muted">
        Simulates a webhook into a payment/approval system. The moment risk crosses threshold
        mid-call, the linked transfer auto-holds -- no human has to notice the fraud in time.
      </p>
      <div className={`transfer-pill large transfer-${status}`}>{status.toUpperCase()}</div>
      {status === "held" && (
        <button className="btn" onClick={doRelease}>
          Manual override: release hold
        </button>
      )}
    </div>
  );
}
