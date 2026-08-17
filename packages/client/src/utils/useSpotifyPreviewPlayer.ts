import { useEffect, useRef, useState, useCallback } from 'react';
import api from './api';

// window.Spotify itself is typed in types/spotify-sdk.d.ts, shared with the
// full playback page's player.
interface SpotifySDKPlayer {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, cb: (state: any) => void) => void;
  pause: () => Promise<void>;
}

function loadSdkScript(onReady: () => void) {
  if (window.Spotify) {
    onReady();
    return;
  }
  const previous = window.onSpotifyWebPlaybackSDKReady;
  window.onSpotifyWebPlaybackSDKReady = () => {
    previous?.();
    onReady();
  };
  if (!document.querySelector('script[src="https://sdk.scdn.co/spotify-player.js"]')) {
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);
  }
}

/**
 * Lightweight Spotify Connect player for one-off previews (e.g. "hear this
 * song from this point"), separate from the full playback page's player.
 */
export function useSpotifyPreviewPlayer(playerName: string) {
  const playerRef = useRef<SpotifySDKPlayer | null>(null);
  const deviceIdRef = useRef<string>('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let player: SpotifySDKPlayer | null = null;
    let cancelled = false;

    const initPlayer = () => {
      api.get('/spotify/token').then(({ data }) => {
        if (cancelled) return;

        const p: SpotifySDKPlayer = new window.Spotify.Player({
          name: playerName,
          getOAuthToken: (cb) => {
            api.get('/spotify/token').then(({ data }) => cb(data.accessToken));
          },
          volume: 0.7,
        });
        player = p;

        p.addListener('ready', ({ device_id }: { device_id: string }) => {
          deviceIdRef.current = device_id;
          setReady(true);
          setError('');
        });
        p.addListener('not_ready', () => setReady(false));
        p.addListener('initialization_error', ({ message }: { message: string }) => {
          setError('No se pudo inicializar el reproductor: ' + message);
        });
        p.addListener('authentication_error', ({ message }: { message: string }) => {
          setError('Error de autenticación con Spotify: ' + message);
        });
        p.addListener('account_error', ({ message }: { message: string }) => {
          setError('Esta función requiere Spotify Premium: ' + message);
        });
        p.addListener('playback_error', ({ message }: { message: string }) => {
          setError('Error de reproducción: ' + message);
        });

        p.connect();
        playerRef.current = p;
      });
    };

    loadSdkScript(initPlayer);

    return () => {
      cancelled = true;
      if (player) player.disconnect();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, [playerName]);

  const play = useCallback(async (trackId: string, positionMs: number) => {
    if (!deviceIdRef.current) {
      setError('El reproductor de Spotify aún no está listo. Espera unos segundos.');
      return;
    }
    try {
      const { data } = await api.get('/spotify/token');
      const res = await fetch(
        'https://api.spotify.com/v1/me/player/play?device_id=' + deviceIdRef.current,
        {
          method: 'PUT',
          headers: {
            Authorization: 'Bearer ' + data.accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ uris: ['spotify:track:' + trackId], position_ms: positionMs }),
        }
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error('Spotify API ' + res.status + ': ' + body);
      }
      setError('');
    } catch (err: any) {
      setError(err?.message || 'No se pudo reproducir el adelanto.');
    }
  }, []);

  const pause = useCallback(async () => {
    if (playerRef.current) await playerRef.current.pause();
  }, []);

  return { ready, error, play, pause };
}
