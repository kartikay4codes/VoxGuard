import React from "react";

const STATUS_COLORS = {
  trusted: "#3ddc84",
  warning: "#ffb020",
  critical: "#ff4d4d",
  idle: "#4a5568",
};

export default function TrustGauge({ score = 0, status = "idle" }) {
  const clamped = Math.max(0, Math.min(100, score));
  const angle = (clamped / 100) * 180 - 90; // -90deg .. +90deg sweep
  const color = STATUS_COLORS[status] || STATUS_COLORS.idle;

  return (
    <div className="trust-gauge-card">
      <svg viewBox="0 0 200 125" width="280" height="155">
        {/* Background track */}
        <path
          d="M 25 105 A 75 75 0 0 1 175 105"
          fill="none"
          stroke="#161b22"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* Active colored arc */}
        <path
          d="M 25 105 A 75 75 0 0 1 175 105"
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * 235.6} 235.6`}
          style={{
            transition: "stroke-dasharray 0.35s ease, stroke 0.35s ease",
            filter: `drop-shadow(0 0 8px ${color}66)`,
          }}
        />
        {/* Indicator needle */}
        <line
          x1="100"
          y1="105"
          x2={100 + 60 * Math.cos((angle * Math.PI) / 180)}
          y2={105 + 60 * Math.sin((angle * Math.PI) / 180)}
          stroke="#e8ecef"
          strokeWidth="3.5"
          strokeLinecap="round"
          style={{ transition: "all 0.35s ease" }}
        />
        <circle cx="100" cy="105" r="6" fill="#e8ecef" />
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
