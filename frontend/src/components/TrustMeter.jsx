import React from "react";

const STATUS_META = {
  trusted: { color: "#3ddc84", label: "TRUSTED" },
  warning: { color: "#ffb020", label: "WARNING" },
  critical: { color: "#ff4d4d", label: "CRITICAL" },
  idle: { color: "#4a5568", label: "STANDBY" },
};

const SEGMENTS = 24;

export default function TrustMeter({ score = 0, status = "idle" }) {
  const clamped = Math.max(0, Math.min(100, score));
  const meta = STATUS_META[status] || STATUS_META.idle;
  const litSegments = Math.round((clamped / 100) * SEGMENTS);

  return (
    <div className="trust-meter">
      <div className="trust-meter-header">
        <span className="trust-meter-title">VOICE-TRUST SCORE</span>
        <span className="trust-meter-status" style={{ color: meta.color }}>
          {meta.label}
        </span>
      </div>
      <div className="trust-meter-row">
        <div className="trust-meter-bar" role="meter" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
          {Array.from({ length: SEGMENTS }).map((_, i) => {
            const isLit = i < litSegments;
            const segColor =
              i < SEGMENTS * 0.45 ? "#3ddc84" : i < SEGMENTS * 0.65 ? "#ffb020" : "#ff4d4d";
            return (
              <span
                key={i}
                className="trust-meter-segment"
                style={{
                  background: isLit ? segColor : "#1c2128",
                  boxShadow: isLit ? `0 0 6px ${segColor}99` : "none",
                }}
              />
            );
          })}
        </div>
        <div className="trust-meter-readout" style={{ color: meta.color }}>
          {clamped.toFixed(1)}
        </div>
      </div>
      <div className="trust-meter-ticks">
        <span>0</span>
        <span>25</span>
        <span>50</span>
        <span>75</span>
        <span>100</span>
      </div>
    </div>
  );
}
