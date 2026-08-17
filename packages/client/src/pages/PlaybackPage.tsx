import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import BestCyclingChart from '../components/BestCyclingChart';
import api from '../utils/api';
import { Route, Segment, ZONE_COLORS } from '../types';

// Spotify Web Playback SDK types (minimal) — window.Spotify itself is typed
// in types/spotify-sdk.d.ts, shared with the designer's preview player
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

const RECOVERY_METHOD = 'Recuperación';

// Time-to-next-recovery info: if we're inside a recovery segment, how long is
// left of it; otherwise how long until the next one starts. Handles routes
// with several recovery breaks.
function getRecoveryInfo(
  segments: Segment[],
  currentTime: number
): { inRecovery: boolean; seconds: number } | null {
  const active = segments.find((s) => currentTime >= s.startTime && currentTime <= s.endTime);
  if (active?.method === RECOVERY_METHOD) {
    return { inRecovery: true, seconds: active.endTime - currentTime };
  }
  const next = segments
    .filter((s) => s.method === RECOVERY_METHOD && s.startTime > currentTime)
    .sort((a, b) => a.startTime - b.startTime)[0];
  if (next) {
    return { inRecovery: false, seconds: next.startTime - currentTime };
  }
  return null;
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
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkError, setSdkError] = useState('');

  const playerRef = useRef<SpotifyPlayer | null>(null);
  const deviceIdRef = useRef<string>('');
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spotifyPosRef = useRef<number>(0); // ms into the current track
  const lastTrackIdRef = useRef<string | null>(null); // track currently loaded on the device

  // Load route
  useEffect(() => {
    if (id) {
      api.get('/routes/' + id).then((r) => setRoute(r.data));
    }
  }, [id]);

  // Init Spotify SDK
  useEffect(() => {
    let player: SpotifyPlayer | null = null;
    let cancelled = false;

    const initPlayer = () => {
      api.get('/spotify/token').then(({ data }) => {
        if (cancelled) return;

        const p: SpotifyPlayer = new window.Spotify.Player({
          name: 'SpinningCenter',
          getOAuthToken: (cb) => {
            api.get('/spotify/token').then(({ data }) => cb(data.accessToken));
          },
          volume,
        });
        player = p;

        p.addListener('ready', ({ device_id }: { device_id: string }) => {
          deviceIdRef.current = device_id;
          setSdkReady(true);
          setSdkError('');
        });

        p.addListener('not_ready', () => {
          setSdkReady(false);
        });

        p.addListener('initialization_error', ({ message }: { message: string }) => {
          setSdkError('No se pudo inicializar el reproductor: ' + message);
        });

        p.addListener('authentication_error', ({ message }: { message: string }) => {
          setSdkError('Error de autenticación con Spotify: ' + message + '. Prueba a reconectar Spotify.');
        });

        p.addListener('account_error', ({ message }: { message: string }) => {
          setSdkError('Esta función requiere Spotify Premium: ' + message);
        });

        p.addListener('playback_error', ({ message }: { message: string }) => {
          setSdkError('Error de reproducción: ' + message);
        });

        p.addListener('player_state_changed', (state: SpotifyPlayerState | null) => {
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

        p.connect();
        playerRef.current = p;
      });
    };

    if (window.Spotify) {
      initPlayer();
    } else if (!document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]')) {
      window.onSpotifyWebPlaybackSDKReady = initPlayer;
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.body.appendChild(script);
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer;
    }

    return () => {
      cancelled = true;
      if (player) player.disconnect();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, []);

  // Ramp the player's volume from `from` to `to` over `durationMs`. Spotify's
  // SDK doesn't support mixing two tracks (no true crossfade), but fading to
  // silence and back around a track switch softens the jump considerably.
  const fadeVolume = useCallback(async (from: number, to: number, durationMs: number) => {
    if (!playerRef.current) return;
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const v = from + (to - from) * (i / steps);
      await playerRef.current.setVolume(Math.max(0, Math.min(1, v)));
      await new Promise((resolve) => setTimeout(resolve, durationMs / steps));
    }
  }, []);

  // Play the song assigned to a segment, looping it so it covers however long
  // that segment/region lasts — this is the core of "one song per drawn tramo".
  // When `fade` is true (automatic zone→zone transitions during playback), the
  // volume dips to 0 and back up around the switch instead of cutting sharply.
  const playSegmentTrack = useCallback(
    async (segment: Segment, opts: { fade?: boolean } = {}) => {
      if (!segment.trackId || !deviceIdRef.current) return;
      const shouldFade = !!opts.fade && lastTrackIdRef.current !== null;

      try {
        if (shouldFade) await fadeVolume(volume, 0, 450);

        const { data } = await api.get('/spotify/token');

        // Loop the single track so it keeps playing for the whole segment
        await fetch(
          'https://api.spotify.com/v1/me/player/repeat?state=track&device_id=' + deviceIdRef.current,
          { method: 'PUT', headers: { Authorization: 'Bearer ' + data.accessToken } }
        );

        const res = await fetch(
          'https://api.spotify.com/v1/me/player/play?device_id=' + deviceIdRef.current,
          {
            method: 'PUT',
            headers: {
              Authorization: 'Bearer ' + data.accessToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              uris: ['spotify:track:' + segment.trackId],
              position_ms: segment.trackStartMs ?? 0,
            }),
          }
        );
        if (!res.ok) {
          const body = await res.text();
          throw new Error('Spotify API ' + res.status + ': ' + body);
        }
        lastTrackIdRef.current = segment.trackId;
        setSdkError('');

        if (shouldFade) {
          await fadeVolume(0, volume, 450);
        } else if (playerRef.current) {
          await playerRef.current.setVolume(volume);
        }
      } catch (err: any) {
        setSdkError(err?.message || 'No se pudo reproducir la canción de este tramo.');
        if (playerRef.current) await playerRef.current.setVolume(volume);
      }
    },
    [volume, fadeVolume]
  );

  const handleSeek = useCallback(
    (time: number, committed: boolean) => {
      if (!route) return;
      const clamped = Math.max(0, Math.min(route.totalDuration, time));
      setCurrentTime(clamped);

      if (!committed || !sdkReady || !deviceIdRef.current) return;

      const targetSeg = getActiveSegment(route.segments, clamped);
      if (!targetSeg?.trackId) return;

      lastTrackIdRef.current = null; // force a (re)start even if we land back on the same track
      void playSegmentTrack(targetSeg);
      setIsPlaying(true);
    },
    [route, sdkReady, playSegmentTrack]
  );

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

  // Whenever the active segment's song changes while playing, switch to it
  useEffect(() => {
    if (!isPlaying || !route) return;
    const seg = getActiveSegment(route.segments, currentTime);
    if (seg?.trackId && seg.trackId !== lastTrackIdRef.current) {
      void playSegmentTrack(seg, { fade: true });
    }
  }, [isPlaying, currentTime, route, playSegmentTrack]);

  const hasTrackAssignments = !!route?.segments.some((s) => s.trackId);

  const handlePlayPause = async () => {
    if (!hasTrackAssignments || !playerRef.current) {
      // No songs assigned or SDK unavailable — just advance time manually (demo mode)
      setIsPlaying((v) => !v);
      return;
    }

    if (!sdkReady || !deviceIdRef.current) {
      setSdkError('El reproductor de Spotify aún no está listo. Espera unos segundos e inténtalo de nuevo.');
      return;
    }

    try {
      if (lastTrackIdRef.current === null) {
        // Nothing loaded on the device yet — start this segment's song
        const seg = getActiveSegment(route!.segments, currentTime);
        if (seg?.trackId) await playSegmentTrack(seg);
      } else {
        // Already loaded — just toggle play/pause
        await playerRef.current.togglePlay();
      }
      setSdkError('');
    } catch (err: any) {
      setSdkError(err?.message || 'No se pudo iniciar la reproducción en Spotify.');
    }
  };

  const handleStop = () => {
    setIsPlaying(false);
    if (tickRef.current) clearInterval(tickRef.current);
  };

  const handleNext = () => {
    if (!route) return;
    const next = route.segments.find((s) => s.startTime > currentTime + 0.5);
    if (next) handleSeek(next.startTime, true);
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
  const recoveryInfo = getRecoveryInfo(route.segments, currentTime);

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
        {/* Recovery countdown, falls back to total time remaining */}
        <div className="playback-header-cell" style={recoveryInfo?.inRecovery ? { background: '#1a3a1a' } : undefined}>
          <div className="phc-label">
            {recoveryInfo
              ? (recoveryInfo.inRecovery ? 'Descansando' : 'Próximo descanso en')
              : 'Tiempo restante'}
          </div>
          <div className="phc-time">
            {formatTime(recoveryInfo ? recoveryInfo.seconds : totalRemaining)}
          </div>
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
          interactive
          onSeek={handleSeek}
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
        <button className="btn-icon" onClick={() => { handleStop(); setCurrentTime(0); lastTrackIdRef.current = null; }}>⏮</button>
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
        {!hasTrackAssignments && (
          <span style={{ marginLeft: 16, fontSize: '0.78rem', color: '#666' }}>
            (Sin canciones por tramo asignadas — modo demo)
          </span>
        )}
        {hasTrackAssignments && !sdkReady && !sdkError && (
          <span style={{ marginLeft: 16, fontSize: '0.78rem', color: '#666' }}>
            Conectando con Spotify…
          </span>
        )}
      </div>
      {sdkError && (
        <div className="error-msg" style={{ margin: '0 1rem 0.75rem' }}>
          {sdkError}
        </div>
      )}
    </div>
  );
}
