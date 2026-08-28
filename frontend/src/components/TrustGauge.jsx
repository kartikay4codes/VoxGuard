import React from "react";

const STATUS_COLORS = {
  trusted: "#2ecc71",
  warning: "#f5a623",
  critical: "#e74c3c",
  idle: "#4a5568",
};

export default function TrustGauge({ score = 0, status = "idle" }) {
  const clamped = Math.max(0, Math.min(100, score));
  const angle = (clamped / 100) * 180 - 90; // -90deg .. +90deg sweep
  const color = STATUS_COLORS[status] || STATUS_COLORS.idle;

  return (
    <div className="trust-gauge">
      <svg viewBox="0 0 200 120" width="280" height="168">
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="#232936"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * 251.2} 251.2`}
          style={{ transition: "stroke-dasharray 0.4s ease, stroke 0.4s ease" }}
        />
        <line
          x1="100"
          y1="100"
          x2={100 + 65 * Math.cos((angle * Math.PI) / 180)}
          y2={100 + 65 * Math.sin((angle * Math.PI) / 180)}
          stroke="#e6e9ef"
          strokeWidth="3"
          style={{ transition: "all 0.4s ease" }}
        />
        <circle cx="100" cy="100" r="5" fill="#e6e9ef" />
      </svg>
      <div className="trust-gauge-readout">
        <div className="trust-score-number" style={{ color }}>
          {clamped.toFixed(1)}
        </div>
        <div className="trust-status-label" style={{ color }}>
          {status.toUpperCase()}
        </div>
      </div>
    </div>
  );
}
