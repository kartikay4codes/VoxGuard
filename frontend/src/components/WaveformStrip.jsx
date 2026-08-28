import React, { useRef, useEffect } from "react";

/**
 * Renders a scrolling oscilloscope-style trace. Driven by real
 * Uint8Array time-domain data from an AnalyserNode (see audioUtils.js
 * onLevel callback) when live; renders a flat idle line otherwise.
 */
export default function WaveformStrip({ levelData, active }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    // grid
    ctx.strokeStyle = "rgba(94, 200, 255, 0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.strokeStyle = "rgba(94, 200, 255, 0.15)";
    ctx.stroke();

    if (!levelData || !active) {
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.strokeStyle = "rgba(122, 133, 144, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      return;
    }

    ctx.beginPath();
    const step = width / levelData.length;
    for (let i = 0; i < levelData.length; i++) {
      const v = levelData[i] / 128.0; // 0..2, 1 = silence
      const y = (v * height) / 2;
      const x = i * step;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#5ec8ff";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#5ec8ff";
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [levelData, active]);

  return (
    <div className="waveform-strip">
      <canvas ref={canvasRef} className="waveform-canvas" />
      <div className="waveform-label">
        <span className={`led ${active ? "led-live" : ""}`} />
        {active ? "LIVE SIGNAL" : "NO SIGNAL"}
      </div>
    </div>
  );
}
