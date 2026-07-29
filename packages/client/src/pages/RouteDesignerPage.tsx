import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Topbar from '../components/Topbar';
import SegmentEditor from '../components/SegmentEditor';
import BestCyclingChart from '../components/BestCyclingChart';
import api from '../utils/api';
import { Segment, SpotifyPlaylist, SpotifyTrack, TrackZoneMapping, ZONE_COLORS, intensityToZone } from '../types';

function formatMs(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function computeTrackZones(tracks: SpotifyTrack[], segments: Segment[]): TrackZoneMapping[] {
  let cursor = 0;
  return tracks.map((track) => {
    const trackStartSec = cursor;
    const trackEndSec = cursor + track.durationMs / 1000;
    cursor = trackEndSec;

    const zonesHit = new Set<number>();
    for (const seg of segments) {
      const overlap = Math.min(seg.endTime, trackEndSec) - Math.max(seg.startTime, trackStartSec);
      if (overlap > 0) zonesHit.add(seg.zone);
    }
    const zones = Array.from(zonesHit).sort();
    const primaryZone = zones.length > 0 ? zones[Math.floor(zones.length / 2)] : 0;
    return { track, zones, primaryZone };
  });
}

export default function RouteDesignerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [name, setName] = useState('Nueva ruta');
  const [totalDuration, setTotalDuration] = useState(2700); // 45 min default
  const [segments, setSegments] = useState<Segment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Spotify
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyPlaylist | null>(null);
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [trackMappings, setTrackMappings] = useState<TrackZoneMapping[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [spotifyError, setSpotifyError] = useState('');

  // Load existing route
  useEffect(() => {
    if (isEdit && id) {
      api.get('/routes/' + id).then((r) => {
        setName(r.data.name);
        setTotalDuration(r.data.totalDuration);
        setSegments(r.data.segments);
        if (r.data.playlistId) {
          setSelectedPlaylist({ id: r.data.playlistId, name: r.data.playlistName || '', tracks: 0 });
          loadTracks(r.data.playlistId);
        }
      });
    }
  }, [id]);

  // Load playlists
  useEffect(() => {
    setLoadingPlaylists(true);
    api
      .get('/spotify/playlists')
      .then((r) => setPlaylists(r.data))
      .catch(() => setSpotifyError('Conecta Spotify desde la barra superior.'))
      .finally(() => setLoadingPlaylists(false));
  }, []);

  const loadTracks = async (playlistId: string) => {
    const r = await api.get('/spotify/playlists/' + playlistId + '/tracks');
    setTracks(r.data);
  };

  const handleSelectPlaylist = async (playlist: SpotifyPlaylist) => {
    setSelectedPlaylist(playlist);
    await loadTracks(playlist.id);
  };

  // Recompute track zones whenever tracks or segments change
  useEffect(() => {
    if (tracks.length > 0 && segments.length > 0) {
      setTrackMappings(computeTrackZones(tracks, segments));
    }
  }, [tracks, segments]);

  const handleSave = async () => {
    if (!name.trim()) { setError('Ponle un nombre a la ruta'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name,
        totalDuration,
        segments,
        playlistId: selectedPlaylist?.id,
        playlistName: selectedPlaylist?.name,
      };
      if (isEdit) {
        await api.put('/routes/' + id, payload);
      } else {
        await api.post('/routes', payload);
      }
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-layout">
      <Topbar />
      <main className="main-content">
        <div className="designer-layout">
          {/* Header */}
          <div className="designer-header">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de la ruta…"
            />
            <div>
              <label style={{ fontSize: '0.8rem', color: '#888', marginRight: '0.5rem' }}>Duración (min)</label>
              <input
                type="number"
                value={Math.floor(totalDuration / 60)}
                onChange={(e) => setTotalDuration(Number(e.target.value) * 60)}
                min={5}
                max={120}
                style={{
                  width: 70,
                  padding: '0.65rem 0.75rem',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text)',
                  fontSize: '1rem',
                }}
              />
            </div>
            <button className="btn btn-secondary" onClick={() => navigate('/')}>Cancelar</button>
            <button className="btn btn-primary" style={{ width: 'auto', minWidth: 120 }} onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : isEdit ? '💾 Guardar cambios' : '💾 Guardar ruta'}
            </button>
          </div>

          {error && <p className="error-msg">{error}</p>}

          {/* Canvas Editor */}
          <div className="canvas-wrapper">
            <h3 style={{ fontSize: '0.85rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
              Diseñador de intensidad
            </h3>
            <SegmentEditor
              segments={segments}
              totalDuration={totalDuration}
              onChange={setSegments}
            />
          </div>

          {/* Preview */}
          {segments.length > 0 && (
            <div className="canvas-wrapper">
              <h3 style={{ fontSize: '0.85rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                Vista previa (estilo Best Cycling)
              </h3>
              <BestCyclingChart
                segments={segments}
                totalDuration={totalDuration}
                height={220}
              />
            </div>
          )}

          {/* Playlist Picker */}
          <div className="playlist-section">
            <h3>Playlist de Spotify</h3>
            {spotifyError ? (
              <div style={{ color: '#888', fontSize: '0.9rem' }}>
                {spotifyError}{' '}
                <button className="btn btn-spotify" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => (window.location.href = '/api/auth/spotify')}>
                  Conectar Spotify
                </button>
              </div>
            ) : loadingPlaylists ? (
              <p style={{ color: '#888', fontSize: '0.9rem' }}>Cargando playlists…</p>
            ) : (
              <div className="playlist-grid">
                {playlists.map((pl) => (
                  <div
                    key={pl.id}
                    className={`playlist-item${selectedPlaylist?.id === pl.id ? ' selected' : ''}`}
                    onClick={() => handleSelectPlaylist(pl)}
                  >
                    {pl.image ? (
                      <img src={pl.image} alt={pl.name} />
                    ) : (
                      <div style={{ width: 44, height: 44, background: 'var(--border)', borderRadius: 4, flexShrink: 0 }} />
                    )}
                    <div className="playlist-item-info">
                      <div className="playlist-item-name">{pl.name}</div>
                      <div className="playlist-item-tracks">{pl.tracks} canciones</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Track-zone mapping table */}
          {trackMappings.length > 0 && (
            <div className="playlist-section">
              <h3>Canciones → Zonas</h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="track-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Canción</th>
                      <th>Artista</th>
                      <th>Duración</th>
                      <th>Zona(s)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trackMappings.map(({ track, zones, primaryZone }, i) => (
                      <tr key={track.id}>
                        <td style={{ color: '#888' }}>{i + 1}</td>
                        <td style={{ fontWeight: 600 }}>{track.name}</td>
                        <td style={{ color: '#aaa' }}>{track.artist}</td>
                        <td style={{ color: '#aaa', fontVariantNumeric: 'tabular-nums' }}>{formatMs(track.durationMs)}</td>
                        <td>
                          {zones.length === 0 ? (
                            <span style={{ color: '#555' }}>—</span>
                          ) : (
                            zones.map((z) => (
                              <span
                                key={z}
                                className="zone-badge"
                                style={{ background: ZONE_COLORS[z] }}
                              >
                                {z}
                              </span>
                            ))
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
