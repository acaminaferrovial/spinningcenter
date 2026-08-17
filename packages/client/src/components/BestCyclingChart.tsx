import React, { useRef, useEffect, useCallback } from 'react';
import { Segment, ZONE_COLORS } from '../types';

interface Props {
  segments: Segment[];
  totalDuration: number; // seconds
  currentTime?: number;  // seconds — shows animated cursor
  height?: number;
  width?: number;
  interactive?: boolean;
  onSeek?: (time: number, committed: boolean) => void;
  className?: string;
}

const PAD_TOP = 10;
const PAD_BOTTOM = 28;
const PAD_LEFT = 48;
const PAD_RIGHT = 12;

function xToTime(x: number, totalDuration: number, width: number): number {
  const chartW = width - PAD_LEFT - PAD_RIGHT;
  return Math.max(0, Math.min(totalDuration, ((x - PAD_LEFT) / chartW) * totalDuration));
}

const ZONE_BAND_COLORS = [
  '#cc2a1a', // Zone 5 top
  '#c85022',
  '#e07e1b', // Zone 4
  '#c8a020',
  '#c8d62b', // Zone 3
  '#90c030',
  '#5aad3c', // Zone 2
  '#3090a0',
  '#1a90d9', // Zone 1 bottom
  '#1060a0',
];

function intensityToY(intensity: number, height: number, padding: number): number {
  // intensity 10 → top (padding), intensity 1 → bottom (height - padding)
  const usable = height - padding * 2;
  return padding + (usable * (10 - intensity)) / 9;
}

function timeToX(time: number, totalDuration: number, width: number, padLeft: number, padRight: number): number {
  return padLeft + ((width - padLeft - padRight) * time) / totalDuration;
}

function getSegmentColor(intensity: number): string {
  const zone = intensity <= 2 ? 1 : intensity <= 4 ? 2 : intensity <= 6 ? 3 : intensity <= 8 ? 4 : 5;
  return ZONE_COLORS[zone];
}

export default function BestCyclingChart({
  segments,
  totalDuration,
  currentTime,
  height = 300,
  width,
  interactive = false,
  onSeek,
  className = '',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seekingRef = useRef(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const PAD_TOP = 10;
    const PAD_BOTTOM = 28;
    const PAD_LEFT = 48;
    const PAD_RIGHT = 12;
    const chartH = H - PAD_TOP - PAD_BOTTOM;

    ctx.clearRect(0, 0, W, H);

    // ── Zone background bands ──────────────────────────────────────────────
    const bandH = chartH / ZONE_BAND_COLORS.length;
    ZONE_BAND_COLORS.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(PAD_LEFT, PAD_TOP + i * bandH, W - PAD_LEFT - PAD_RIGHT, bandH);
    });

    // ── Zone % labels on left axis ─────────────────────────────────────────
    const zoneLabels = [
      { pct: '100%', y: PAD_TOP },
      { pct: '90%', y: PAD_TOP + chartH * 0.1 },
      { pct: '80%', y: PAD_TOP + chartH * 0.3 },
      { pct: '70%', y: PAD_TOP + chartH * 0.5 },
      { pct: '60%', y: PAD_TOP + chartH * 0.7 },
      { pct: '50%', y: PAD_TOP + chartH * 0.9 },
    ];
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    zoneLabels.forEach(({ pct, y }) => {
      ctx.fillText(pct, PAD_LEFT - 4, y + 4);
      // dashed guide line
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD_LEFT, y);
      ctx.lineTo(W - PAD_RIGHT, y);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // ── Build profile points ───────────────────────────────────────────────
    if (segments.length === 0) return;

    // Build a smooth polyline: for each segment collect start and end points
    const points: { x: number; y: number; intensity: number }[] = [];
    segments.forEach((seg) => {
      points.push({
        x: timeToX(seg.startTime, totalDuration, W, PAD_LEFT, PAD_RIGHT),
        y: intensityToY(seg.intensity, H - PAD_BOTTOM, PAD_TOP),
        intensity: seg.intensity,
      });
      points.push({
        x: timeToX(seg.endTime, totalDuration, W, PAD_LEFT, PAD_RIGHT),
        y: intensityToY(seg.intensity, H - PAD_BOTTOM, PAD_TOP),
        intensity: seg.intensity,
      });
    });

    if (points.length < 2) return;

    const baselineY = H - PAD_BOTTOM;

    // ── Fill area under curve with zone colour (segmented) ─────────────────
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      ctx.beginPath();
      ctx.moveTo(p0.x, baselineY);
      ctx.lineTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p1.x, baselineY);
      ctx.closePath();
      const midIntensity = (p0.intensity + p1.intensity) / 2;
      ctx.fillStyle = getSegmentColor(midIntensity) + 'cc'; // semi-transparent
      ctx.fill();
    }

    // ── White line on top ──────────────────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // ── Segment change dots ────────────────────────────────────────────────
    for (let i = 0; i < points.length; i += 2) {
      if (i + 1 < points.length) {
        const nx = points[i + 1].x;
        const ny = points[i + 1].y;
        // Only draw dot at zone-change transitions
        if (i + 2 < points.length) {
          ctx.beginPath();
          ctx.arc(nx, ny, 5, 0, Math.PI * 2);
          ctx.fillStyle = '#000';
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    // ── Recovery segment markers (dashed vertical line at the start) ──────
    segments
      .filter((seg) => seg.method === 'Recuperación')
      .forEach((seg) => {
        const x = timeToX(seg.startTime, totalDuration, W, PAD_LEFT, PAD_RIGHT);
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, PAD_TOP);
        ctx.lineTo(x, baselineY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.font = '10px sans-serif';
        const label = '😮‍💨 Descanso';
        const labelWidth = ctx.measureText(label).width + 10;
        ctx.fillRect(x + 3, PAD_TOP, labelWidth, 15);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.fillText(label, x + 8, PAD_TOP + 11);
      });

    // ── Time axis labels ───────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    const numLabels = Math.min(8, Math.floor(totalDuration / 60));
    for (let i = 0; i <= numLabels; i++) {
      const t = (totalDuration * i) / numLabels;
      const x = timeToX(t, totalDuration, W, PAD_LEFT, PAD_RIGHT);
      const mins = Math.floor(t / 60);
      const secs = Math.floor(t % 60);
      ctx.fillText(
        `${mins}:${secs.toString().padStart(2, '0')}`,
        x,
        H - PAD_BOTTOM + 16
      );
    }

    // ── Current time cursor ────────────────────────────────────────────────
    if (currentTime !== undefined && currentTime >= 0) {
      const cx = timeToX(currentTime, totalDuration, W, PAD_LEFT, PAD_RIGHT);
      // Find intensity at current time
      const activeSeg = segments.find(
        (s) => currentTime >= s.startTime && currentTime <= s.endTime
      );
      const cy = activeSeg
        ? intensityToY(activeSeg.intensity, H - PAD_BOTTOM, PAD_TOP)
        : baselineY;

      // Vertical dashed line
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, PAD_TOP);
      ctx.lineTo(cx, baselineY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Cursor dot
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();
    }
  }, [segments, totalDuration, currentTime]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = (height || canvas.offsetHeight) * window.devicePixelRatio;
      canvas.style.width = canvas.offsetWidth + 'px';
      canvas.style.height = height + 'px';
      draw();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width === 0) {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio || 800;
      canvas.height = height * window.devicePixelRatio;
    }
    draw();
  }, [draw, height]);

  const emitSeek = useCallback(
    (clientX: number, committed: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas || !onSeek) return;
      const rect = canvas.getBoundingClientRect();
      const time = xToTime(clientX - rect.left, totalDuration, rect.width);
      onSeek(time, committed);
    },
    [onSeek, totalDuration]
  );

  const handlePointerDown = (e: React.MouseEvent) => {
    if (!interactive) return;
    seekingRef.current = true;
    emitSeek(e.clientX, false);
  };

  const handlePointerMove = (e: React.MouseEvent) => {
    if (!interactive || !seekingRef.current) return;
    emitSeek(e.clientX, false);
  };

  const handlePointerUp = (e: React.MouseEvent) => {
    if (!interactive || !seekingRef.current) return;
    seekingRef.current = false;
    emitSeek(e.clientX, true);
  };

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        width: width ? width + 'px' : '100%',
        height: height + 'px',
        cursor: interactive ? 'pointer' : 'default',
      }}
      onMouseDown={handlePointerDown}
      onMouseMove={handlePointerMove}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
    />
  );
}
