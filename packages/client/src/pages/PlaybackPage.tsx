import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import BestCyclingChart from '../components/BestCyclingChart';
import api from '../utils/api';
import { Route, Segment, ZONE_COLORS, ZONE_NAMES } from '../types';

// Spotify Web Playback SDK types (minimal)
declare global {
  interface Window {
    Spotify: {
      Player: new (options: SpotifyPlayerOptions) => SpotifyPlayer;
    };
    onSpotifyWebPlaybackSDKReady: () => void;
  }
}

interface SpotifyPlayerOptions {
  name: string;
  getOAuthToken: (cb: (token: string) => void) => void;
  volume?: number;
}

interface SpotifyPlayer {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, cb: (state: any) => void) => void;
  removeListener: (event: string) => void;
  togglePlay: () => Promise<void>;
  nextTrack: () => Promise<void>;
  setVolume: (vol: number) => Promise<void>;
  getCurrentState: () => Promise<SpotifyPlayerState | null>;
  _options: { getOAuthToken: (cb: (token: string) => void) => void };
}

interface SpotifyPlayerState {
  paused: boolean;
  position: number; // ms
  duration: number; // ms
  track_window: {
    current_track: {
      id: string;
      name: string;
      artists: { name: string }[];
      album: { images: { url: string }[] };
    };
  };
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getActiveSegment(segments: Segment[], currentTime: number): Segment | null {
  return segments.find((s) => currentTime >= s.startTime && currentTime <= s.endTime) || null;
}

export default function PlaybackPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [route, setRoute] = useState<Route | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [nowPlaying, setNowPlaying] = useState<{
    name: string; artist: string; image?: string;
  } | null>(null);

  const playerRef = useRef<SpotifyPlayer | null>(null);
  const deviceIdRef = useRef<string>('');
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spotifyPosRef = useRef<number>(0); // ms into playlist

  // Load route
  useEffect(() => {
    if (id) {
      api.get('/routes/' + id).then((r) => setRoute(r.data));
    }
  }, [id]);

  // Init Spotify SDK
  useEffect(() => {
    let player: SpotifyPlayer;

    const initPlayer = () => {
      api.get('/spotify/token').then(({ data }) => {
        player = new window.Spotify.Player({
          name: 'SpinningCenter',
          getOAuthToken: (cb) => {
            api.get('/spotify/token').then(({ data }) => cb(data.accessToken));
          },
          volume,
        });

        player.addListener('ready', ({ device_id }: { device_id: string }) => {
          deviceIdRef.current = device_id;
        });

        player.addListener('player_state_changed', (state: SpotifyPlayerState | null) => {
          if (!state) return;
          setIsPlaying(!state.paused);
          spotifyPosRef.current = state.position;
          const t = state.track_window.current_track;
          setNowPlaying({
            name: t.name,
            artist: t.artists.map((a) => a.name).join(', '),
            image: t.album.images?.[0]?.url,
          });
        });

        player.connect();
        playerRef.current = player;
      });
    };

    if (window.Spotify) {
      initPlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer;
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.body.appendChild(script);
    }

    return () => {
      if (playerRef.current) playerRef.current.disconnect();
    };
  }, []);

  // Start playlist on Spotify when user presses play
  const startSpotifyPlaylist = useCallback(async () => {
    if (!route?.playlistId || !deviceIdRef.current) return;
    const { data } = await api.get('/spotify/token');
    await fetch(
      'https://api.spotify.com/v1/me/player/play?device_id=' + deviceIdRef.current,
      {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + data.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ context_uri: 'spotify:playlist:' + route.playlistId }),
      }
    );
  }, [route]);

  // Tick every second to advance currentTime
  useEffect(() => {
    if (isPlaying) {
      tickRef.current = setInterval(() => {
        setCurrentTime((t) => {
          const next = t + 1;
          if (route && next >= route.totalDuration) {
            handleStop();
            return route.totalDuration;
          }
          return next;
        });
      }, 1000);
    } else {
      if (tickRef.current) clearInterval(tickRef.current);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [isPlaying, route]);

  const handlePlayPause = async () => {
    if (!isPlaying && currentTime === 0) {
      await startSpotifyPlaylist();
    }
    if (playerRef.current) {
      await playerRef.current.togglePlay();
    } else {
      // No Spotify SDK — just advance time manually (demo mode)
      setIsPlaying((v) => !v);
    }
  };

  const handleStop = () => {
    setIsPlaying(false);
    if (tickRef.current) clearInterval(tickRef.current);
  };

  const handleNext = async () => {
    if (playerRef.current) await playerRef.current.nextTrack();
  };

  const handleVolumeChange = async (v: number) => {
    setVolume(v);
    if (playerRef.current) await playerRef.current.setVolume(v);
  };

  if (!route) {
    return (
      <div className="playback-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888' }}>Cargando ruta…</p>
      </div>
    );
  }

  const activeSeg = getActiveSegment(route.segments, currentTime);
  const zone = activeSeg?.zone || 0;
  const zoneColor = zone ? ZONE_COLORS[zone] : '#444';
  const segTimeRemaining = activeSeg ? Math.max(0, activeSeg.endTime - currentTime) : 0;
  const totalRemaining = route.totalDuration - currentTime;

  return (
    <div className="playback-page">
      {/* Header overlay — Best Cycling style */}
      <div className="playback-header">
        {/* Zone number */}
        <div className="playback-header-cell" style={{ background: zoneColor }}>
          <div className="phc-label">Zona</div>
          <div className="phc-zone-number">{zone || '—'}</div>
        </div>
        {/* Resistance (intensity) */}
        <div className="playback-header-cell">
          <div className="phc-label">Resistencia</div>
          <div className="phc-value" style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: '0.75rem', color: '#888', marginRight: 4 }}>
              {zone ? (zone <= 2 ? 'Baja' : zone <= 3 ? 'Media' : zone <= 4 ? 'Alta' : 'Máxima') : '—'}
            </span>
            <span style={{ display: 'flex', gap: 2 }}>
              {[1,2,3,4,5].map((i) => (
                <span key={i} style={{
                  width: 8, height: 18,
                  background: i <= zone ? zoneColor : '#333',
                  borderRadius: 2,
                  display: 'inline-block',
                }} />
              ))}
            </span>
          </div>
        </div>
        {/* Cadence */}
        <div className="playback-header-cell">
          <div className="phc-label">Cadencia</div>
          <div className="phc-value">{activeSeg?.cadence ?? '—'}</div>
        </div>
        {/* Method */}
        <div className="playback-header-cell" style={{ background: '#222' }}>
          <div className="phc-label">Método de trabajo</div>
          <div className="phc-method">
            {formatTime(segTimeRemaining)}&nbsp;&nbsp;{activeSeg?.method || '—'}
          </div>
        </div>
        {/* Time remaining */}
        <div className="playback-header-cell">
          <div className="phc-label">Descanso / Tiempo</div>
          <div className="phc-time">{formatTime(totalRemaining)}</div>
        </div>
      </div>

      {/* Chart */}
      <div className="chart-area">
        <BestCyclingChart
          segments={route.segments}
          totalDuration={route.totalDuration}
          currentTime={currentTime}
          className="playback-canvas"
          height={window.innerHeight - 64 - 60}
        />

        {/* Now playing overlay */}
        {nowPlaying && (
          <div className="now-playing">
            {nowPlaying.image && <img src={nowPlaying.image} alt="cover" />}
            <div className="now-playing-info">
              <div className="track-name">{nowPlaying.name}</div>
              <div className="track-artist">{nowPlaying.artist}</div>
            </div>
          </div>
        )}

        {/* Back button */}
        <button
          className="btn btn-secondary"
          style={{ position: 'absolute', top: 12, right: 12, padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
          onClick={() => { handleStop(); navigate('/'); }}
        >
          ✕ Salir
        </button>
      </div>

      {/* Controls bar */}
      <div className="playback-controls">
        <button className="btn-icon" onClick={() => { handleStop(); setCurrentTime(0); }}>⏮</button>
        <button className="btn-icon btn-play" onClick={handlePlayPause}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button className="btn-icon" onClick={handleNext}>⏭</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 16 }}>
          <span style={{ fontSize: '0.8rem', color: '#888' }}>🔊</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
          />
        </div>
        <span style={{ marginLeft: 16, fontSize: '0.9rem', color: '#888', fontVariantNumeric: 'tabular-nums' }}>
          {formatTime(currentTime)} / {formatTime(route.totalDuration)}
        </span>
        {!route.playlistId && (
          <span style={{ marginLeft: 16, fontSize: '0.78rem', color: '#666' }}>
            (Sin playlist asignada — modo demo)
          </span>
        )}
      </div>
    </div>
  );
}
