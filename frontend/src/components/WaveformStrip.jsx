import React, { useRef, useEffect, useState } from "react";

/**
 * Renders a cyber-oscilloscope audio stream trace with neon glow,
 * grid reticle, and real-time amplitude RMS level meter.
 */
export default function WaveformStrip({ levelData, active }) {
  const canvasRef = useRef(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const [rmsDb, setRmsDb] = useState("-∞ dB");

  // Resize observer to avoid querying clientWidth/clientHeight in draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth || 300;
      const h = canvas.clientHeight || 94;
      sizeRef.current = { width: w, height: h };
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = sizeRef.current;
    if (!width || !height) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Background fine grid
    ctx.strokeStyle = "rgba(94, 200, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Center baseline
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.strokeStyle = "rgba(94, 200, 255, 0.18)";
    ctx.stroke();

    if (!levelData || !active) {
      // Flat standby line
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.strokeStyle = "rgba(122, 134, 148, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      setRmsDb("STANDBY");
      return;
    }

    // Calculate RMS volume
    let sumSquares = 0;
    for (let i = 0; i < levelData.length; i++) {
      const norm = (levelData[i] - 128) / 128;
      sumSquares += norm * norm;
    }
    const rms = Math.sqrt(sumSquares / levelData.length);
    const db = rms > 0.001 ? Math.round(20 * Math.log10(rms)) : -60;
    setRmsDb(`${db > -60 ? db : "-∞"} dB`);

    // Draw audio curve with gradient area fill
    ctx.beginPath();
    const step = width / (levelData.length - 1);
    for (let i = 0; i < levelData.length; i++) {
      const v = levelData[i] / 128.0; // 0..2, 1 = baseline
      const y = (v * height) / 2;
      const x = i * step;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    // Stroke line with glow
    ctx.strokeStyle = "#5ec8ff";
    ctx.lineWidth = 2.2;
    ctx.shadowColor = "rgba(94, 200, 255, 0.8)";
    ctx.shadowBlur = 8;
    ctx.stroke();

    // Subtle gradient fill under curve
    ctx.lineTo(width, height / 2);
    ctx.lineTo(0, height / 2);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, "rgba(94, 200, 255, 0.12)");
    grad.addColorStop(0.5, "rgba(94, 200, 255, 0.03)");
    grad.addColorStop(1, "rgba(167, 139, 250, 0.08)");
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.restore();
  }, [levelData, active]);

  return (
    <div className="waveform-strip">
      <canvas ref={canvasRef} className="waveform-canvas" />
      <div className="waveform-label">
        <span className={`led ${active ? "led-live" : ""}`} />
        {active ? "LIVE SIGNAL STREAM" : "AUDIO STREAM INACTIVE"}
      </div>
      <div className="waveform-meter">
        {rmsDb}
      </div>
    </div>
  );
}
