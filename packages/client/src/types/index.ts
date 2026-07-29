export interface User {
  id: string;
  email: string;
  spotifyConnected?: boolean;
}

export interface Segment {
  startTime: number;  // seconds
  endTime: number;
  intensity: number;  // 1–10
  zone: number;       // 1–5
  method: string;
  cadence?: number;
}

export interface Route {
  _id: string;
  userId: string;
  name: string;
  totalDuration: number; // seconds
  playlistId?: string;
  playlistName?: string;
  segments: Segment[];
  createdAt: string;
  updatedAt: string;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  tracks: number;
  image?: string;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  durationMs: number;
  image?: string;
}

export interface TrackZoneMapping {
  track: SpotifyTrack;
  zones: number[];       // zone numbers covered
  primaryZone: number;
}

export const ZONE_COLORS: Record<number, string> = {
  1: '#1a90d9', // Blue
  2: '#5aad3c', // Green
  3: '#c8d62b', // Yellow-green
  4: '#e07e1b', // Orange
  5: '#cc2a1a', // Red
};

export const ZONE_NAMES: Record<number, string> = {
  1: 'Zona 1 — Recuperación',
  2: 'Zona 2 — Resistencia',
  3: 'Zona 3 — Aeróbico',
  4: 'Zona 4 — Umbral',
  5: 'Zona 5 — VO2 Max',
};

export const ZONE_INTENSITY_RANGES: Record<number, [number, number]> = {
  1: [1, 2],
  2: [3, 4],
  3: [5, 6],
  4: [7, 8],
  5: [9, 10],
};

export function intensityToZone(intensity: number): number {
  if (intensity <= 2) return 1;
  if (intensity <= 4) return 2;
  if (intensity <= 6) return 3;
  if (intensity <= 8) return 4;
  return 5;
}
