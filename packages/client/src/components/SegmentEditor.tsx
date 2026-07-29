import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Segment, ZONE_COLORS, intensityToZone } from '../types';

interface Props {
  segments: Segment[];
  totalDuration: number;
  onChange: (segments: Segment[]) => void;
}

const PAD_TOP = 10;
const PAD_LEFT = 48;
const PAD_RIGHT = 12;
const PAD_BOTTOM = 28;

const ZONE_BAND_COLORS = [
  '#cc2a1a', '#c85022', '#e07e1b', '#c8a020',
  '#c8d62b', '#90c030', '#5aad3c', '#3090a0', '#1a90d9', '#1060a0',
];

const METHOD_OPTIONS = [
  'Llano', 'Escalada sentado', 'Sprint', 'Escalada de pie',
  'Fuerza', 'Recuperación', 'Intervalo', 'Velocidad',
];

function yToIntensity(y: number, H: number): number {
  const chartH = H - PAD_TOP - PAD_BOTTOM;
  const raw = 10 - ((y - PAD_TOP) / chartH) * 9;
  return Math.min(10, Math.max(1, Math.round(raw)));
}

function xToTime(x: number, totalDuration: number, W: number): number {
  const chartW = W - PAD_LEFT - PAD_RIGHT;
  return Math.max(0, Math.min(totalDuration, ((x - PAD_LEFT) / chartW) * totalDuration));
}

function intensityToY(intensity: number, H: number): number {
  const chartH = H - PAD_TOP - PAD_BOTTOM;
  return PAD_TOP + (chartH * (10 - intensity)) / 9;
}

function timeToX(time: number, totalDuration: number, W: number): number {
  const chartW = W - PAD_LEFT - PAD_RIGHT;
  return PAD_LEFT + (chartW * time) / totalDuration;
}

export default function SegmentEditor({ segments, totalDuration, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [currentMethod, setCurrentMethod] = useState('Llano');
  const [currentCadence, setCurrentCadence] = useState(80);
  const startRef = useRef<{ time: number; intensity: number } | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Zone bands
    const chartH = H - PAD_TOP - PAD_BOTTOM;
    const bandH = chartH / ZONE_BAND_COLORS.length;
    ZONE_BAND_COLORS.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(PAD_LEFT, PAD_TOP + i * bandH, W - PAD_LEFT - PAD_RIGHT, bandH);
    });

    // Axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    [10, 8, 6, 4, 2].forEach((intensity) => {
      const y = intensityToY(intensity, H);
      ctx.fillText(String(intensity), PAD_LEFT - 4, y + 4);
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD_LEFT, y);
      ctx.lineTo(W - PAD_RIGHT, y);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Draw segments
    segments.forEach((seg) => {
      const x0 = timeToX(seg.startTime, totalDuration, W);
      const x1 = timeToX(seg.endTime, totalDuration, W);
      const y = intensityToY(seg.intensity, H);
      const baselineY = H - PAD_BOTTOM;

      // Fill
      ctx.beginPath();
      ctx.moveTo(x0, baselineY);
      ctx.lineTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.lineTo(x1, baselineY);
      ctx.closePath();
      ctx.fillStyle = ZONE_COLORS[intensityToZone(seg.intensity)] + 'bb';
      ctx.fill();

      // Line
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Method label
      if (x1 - x0 > 50) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(x0 + 4, y - 18, Math.min(x1 - x0 - 8, 120), 16);
        ctx.fillStyle = '#fff';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(seg.method, x0 + 7, y - 5);
      }
    });

    // Time labels
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    const numLabels = Math.min(8, Math.floor(totalDuration / 60));
    for (let i = 0; i <= numLabels; i++) {
      const t = (totalDuration * i) / numLabels;
      const x = timeToX(t, totalDuration, W);
      const mins = Math.floor(t / 60);
      const secs = Math.floor(t % 60);
      ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, x, H - PAD_BOTTOM + 16);
    }
  }, [segments, totalDuration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = 280 * dpr;
      ctx_scale(canvas, dpr);
      draw();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => { draw(); }, [draw]);

  function ctx_scale(canvas: HTMLCanvasElement, dpr: number) {
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }

  const getPos = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left),
        y: (e.touches[0].clientY - rect.top),
      };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  };

  const getLogicalH = () => {
    const canvas = canvasRef.current!;
    return canvas.offsetHeight;
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const { x, y } = getPos(e);
    const canvas = canvasRef.current!;
    const W = canvas.offsetWidth;
    const H = getLogicalH();
    const time = xToTime(x, totalDuration, W);
    const intensity = yToIntensity(y, H);
    startRef.current = { time, intensity };
    setDrawing(true);
  };

  const handlePointerUp = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing || !startRef.current) return;
    setDrawing(false);

    const { x } = getPos(e);
    const canvas = canvasRef.current!;
    const W = canvas.offsetWidth;
    const endTime = xToTime(x, totalDuration, W);
    const { time: startTime, intensity } = startRef.current;

    const actualStart = Math.min(startTime, endTime);
    const actualEnd = Math.max(startTime, endTime);
    if (actualEnd - actualStart < 5) return; // too short

    const zone = intensityToZone(intensity);
    const newSeg: Segment = {
      startTime: actualStart,
      endTime: actualEnd,
      intensity,
      zone,
      method: currentMethod,
      cadence: currentCadence,
    };

    // Merge: remove overlapping segments or trim them
    const updated = mergeSegments(segments, newSeg, totalDuration);
    onChange(updated);
    startRef.current = null;
  };

  return (
    <div>
      <div className="canvas-toolbar">
        <div>
          <label>Método de trabajo &nbsp;</label>
          <select value={currentMethod} onChange={(e) => setCurrentMethod(e.target.value)}>
            {METHOD_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Cadencia (RPM) &nbsp;</label>
          <input
            type="number"
            value={currentCadence}
            onChange={(e) => setCurrentCadence(Number(e.target.value))}
            min={40}
            max={130}
            style={{ width: 70 }}
          />
        </div>
        <button
          className="btn btn-secondary"
          style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
          onClick={() => onChange([])}
        >
          Limpiar todo
        </button>
      </div>
      <p style={{ fontSize: '0.78rem', color: '#888', marginBottom: '0.5rem' }}>
        💡 Haz click y arrastra horizontalmente para dibujar un segmento de intensidad.
        La posición vertical define la intensidad (1–10).
      </p>
      <canvas
        ref={canvasRef}
        className="designer-canvas"
        style={{ height: '280px' }}
        onMouseDown={handlePointerDown}
        onMouseUp={handlePointerUp}
        onTouchStart={handlePointerDown}
        onTouchEnd={handlePointerUp}
      />
    </div>
  );
}

/** Merge a new segment into the existing list, removing/trimming overlaps */
function mergeSegments(existing: Segment[], incoming: Segment, totalDuration: number): Segment[] {
  const result: Segment[] = [];

  for (const seg of existing) {
    if (seg.endTime <= incoming.startTime || seg.startTime >= incoming.endTime) {
      // No overlap — keep as-is
      result.push(seg);
    } else if (seg.startTime < incoming.startTime && seg.endTime > incoming.endTime) {
      // incoming is inside seg → split
      result.push({ ...seg, endTime: incoming.startTime });
      result.push({ ...seg, startTime: incoming.endTime });
    } else if (seg.startTime < incoming.startTime) {
      // seg overlaps on the left → trim right side
      result.push({ ...seg, endTime: incoming.startTime });
    } else if (seg.endTime > incoming.endTime) {
      // seg overlaps on the right → trim left side
      result.push({ ...seg, startTime: incoming.endTime });
    }
    // fully inside incoming → discard
  }

  result.push(incoming);
  return result.filter((s) => s.endTime - s.startTime >= 1).sort((a, b) => a.startTime - b.startTime);
}
