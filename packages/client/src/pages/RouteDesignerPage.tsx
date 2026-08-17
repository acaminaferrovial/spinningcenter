import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Topbar from '../components/Topbar';
import SegmentEditor from '../components/SegmentEditor';
import BestCyclingChart from '../components/BestCyclingChart';
import api from '../utils/api';
import { startSpotifyConnect } from '../utils/spotify';
import { useSpotifyPreviewPlayer } from '../utils/useSpotifyPreviewPlayer';
import { Segment, SpotifyPlaylist, SpotifyTrack, ZONE_COLORS, METHOD_OPTIONS, intensityToZone } from '../types';

function formatMs(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const DEFAULT_INTENSITY = 5;
const DEFAULT_METHOD = 'Llano';
const DEFAULT_CADENCE = 80;

// Ensure segments cover [0, totalDuration] with no blank gaps, filling any hole
// with a flat default segment so the canvas is never left partially empty.
function fillGaps(segments: Segment[], totalDuration: number): Segment[] {
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);
  const result: Segment[] = [];
  let cursor = 0;
  for (const seg of sorted) {
    if (seg.startTime > cursor + 0.5) {
      result.push({
        startTime: cursor,
        endTime: seg.startTime,
        intensity: DEFAULT_INTENSITY,
        zone: intensityToZone(DEFAULT_INTENSITY),
        method: DEFAULT_METHOD,
        cadence: DEFAULT_CADENCE,
      });
    }
    result.push(seg);
    cursor = Math.max(cursor, seg.endTime);
  }
  if (cursor < totalDuration - 0.5) {
    result.push({
      startTime: cursor,
      endTime: totalDuration,
      intensity: DEFAULT_INTENSITY,
      zone: intensityToZone(DEFAULT_INTENSITY),
      method: DEFAULT_METHOD,
      cadence: DEFAULT_CADENCE,
    });
  }
  return result;
}

export default function RouteDesignerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [name, setName] = useState('Nueva ruta');
  const [totalDuration, setTotalDuration] = useState(2700); // 45 min default
  const [segments, setSegments] = useState<Segment[]>(() => fillGaps([], 2700));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Spotify
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyPlaylist | null>(null);
  const [tracks, setTracks] = useState<SpotifyTrack[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [spotifyError, setSpotifyError] = useState('');

  // Song picker for a specific drawn segment/region
  const [pickerSegmentIndex, setPickerSegmentIndex] = useState<number | null>(null);

  // Preview player — lets you hear a song from its assigned start point
  const preview = useSpotifyPreviewPlayer('SpinningCenter Designer');
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing route
  useEffect(() => {
    if (isEdit && id) {
      api.get('/routes/' + id).then((r) => {
        setName(r.data.name);
        setTotalDuration(r.data.totalDuration);
        setSegments(fillGaps(r.data.segments, r.data.totalDuration));
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

  const handleDurationChange = (newDuration: number) => {
    setTotalDuration(newDuration);
    setSegments((prev) => {
      const trimmed = prev
        .filter((s) => s.startTime < newDuration)
        .map((s) => ({ ...s, endTime: Math.min(s.endTime, newDuration) }));
      return fillGaps(trimmed, newDuration);
    });
  };

  const loadTracks = async (playlistId: string) => {
    setLoadingTracks(true);
    try {
      const r = await api.get('/spotify/playlists/' + playlistId + '/tracks');
      setTracks(r.data);
    } finally {
      setLoadingTracks(false);
    }
  };

  const handleSelectPlaylist = async (playlist: SpotifyPlaylist) => {
    setSelectedPlaylist(playlist);
    await loadTracks(playlist.id);
  };

  const handleAssignTrack = (segmentIndex: number, track: SpotifyTrack) => {
    setSegments((prev) => prev.map((seg, i) => (
      i === segmentIndex
        ? {
            ...seg,
            trackId: track.id,
            trackName: track.name,
            artist: track.artist,
            image: track.image,
            trackDurationMs: track.durationMs,
            trackStartMs: 0,
          }
        : seg
    )));
    setPickerSegmentIndex(null);
  };

  const handleRemoveTrack = (segmentIndex: number) => {
    setSegments((prev) => prev.map((seg, i) => {
      if (i !== segmentIndex) return seg;
      const { trackId, trackName, artist, image, trackDurationMs, trackStartMs, ...rest } = seg;
      return rest;
    }));
  };

  // Delete the drawn tramo itself (not just its song) — the freed time range
  // reverts to the flat default intensity, same as an untouched part of the canvas.
  const handleDeleteSegment = (segmentIndex: number) => {
    setSegments((prev) => fillGaps(prev.filter((_, i) => i !== segmentIndex), totalDuration));
  };

  const handleMethodChange = (segmentIndex: number, method: string) => {
    setSegments((prev) => prev.map((s, i) => (i === segmentIndex ? { ...s, method } : s)));
  };

  const handleTrackStartChange = (segmentIndex: number, startSecs: number) => {
    const seg = segments[segmentIndex];
    const maxSecs = seg.trackDurationMs ? seg.trackDurationMs / 1000 : Infinity;
    const clampedMs = Math.round(Math.max(0, Math.min(maxSecs, startSecs)) * 1000);

    setSegments((prev) => prev.map((s, i) => (i === segmentIndex ? { ...s, trackStartMs: clampedMs } : s)));

    // Preview the song from this new point after a short pause, so it doesn't
    // fire on every single keystroke/spinner click while you're adjusting it
    if (seg.trackId) {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
      previewDebounceRef.current = setTimeout(() => {
        void preview.play(seg.trackId!, clampedMs);
      }, 600);
    }
  };

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
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <label style={{ fontSize: '0.8rem', color: '#888', marginRight: '0.5rem' }}>Duración (mm:ss)</label>
              <input
                type="number"
                value={Math.floor(totalDuration / 60)}
                onChange={(e) => handleDurationChange(Number(e.target.value) * 60 + (totalDuration % 60))}
                min={0}
                max={180}
                style={{
                  width: 55,
                  padding: '0.65rem 0.5rem',
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  color: 'var(--text)',
                  fontSize: '1rem',
                  textAlign: 'right',
                }}
              />
              <span style={{ margin: '0 0.25rem', color: 'var(--text)' }}>:</span>
              <input
                type="number"
                value={Math.floor(totalDuration % 60)}
                onChange={(e) => handleDurationChange(Math.floor(totalDuration / 60) * 60 + Number(e.target.value))}
                min={0}
                max={59}
                style={{
                  width: 55,
                  padding: '0.65rem 0.5rem',
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

          {/* Canción por tramo */}
          <div className="playlist-section">
            <h3>Canción por tramo</h3>
            <p style={{ fontSize: '0.78rem', color: '#888', marginBottom: '0.5rem' }}>
              En vez de una playlist entera, elige una canción para cada tramo que has dibujado en el
              canvas. Sonará esa canción (en bucle) mientras dure ese tramo. Al cambiar "Empieza en" se
              reproduce un adelanto automáticamente desde ese punto.
            </p>
            {!preview.ready && !preview.error && (
              <p style={{ fontSize: '0.78rem', color: '#666', marginBottom: '0.5rem' }}>
                Conectando con Spotify para poder previsualizar…
              </p>
            )}
            {preview.error && (
              <p className="error-msg" style={{ marginBottom: '0.5rem' }}>{preview.error}</p>
            )}
            {preview.ready && (
              <button
                className="btn btn-secondary"
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem', marginBottom: '0.5rem' }}
                onClick={() => void preview.pause()}
              >
                ⏸ Detener adelanto
              </button>
            )}
            {segments.map((seg, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.5rem 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span
                  className="zone-badge"
                  style={{ background: ZONE_COLORS[seg.zone], flexShrink: 0 }}
                >
                  {seg.zone}
                </span>
                <span style={{ fontSize: '0.8rem', minWidth: 110, flexShrink: 0, color: '#aaa' }}>
                  {formatTime(seg.startTime)}–{formatTime(seg.endTime)}
                </span>
                <span style={{ fontSize: '0.78rem', minWidth: 55, flexShrink: 0, color: '#666' }}>
                  ({formatTime(seg.endTime - seg.startTime)})
                </span>
                <select
                  value={seg.method}
                  onChange={(e) => handleMethodChange(i, e.target.value)}
                  style={{
                    minWidth: 140,
                    flexShrink: 0,
                    padding: '0.3rem 0.4rem',
                    background: 'var(--surface2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)',
                    color: 'var(--text)',
                    fontSize: '0.8rem',
                  }}
                >
                  {METHOD_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                {seg.trackId ? (
                  <>
                    {seg.image ? (
                      <img src={seg.image} alt={seg.trackName} style={{ width: 36, height: 36, borderRadius: 4 }} />
                    ) : (
                      <div style={{ width: 36, height: 36, background: 'var(--border)', borderRadius: 4, flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {seg.trackName}
                      </div>
                      <div style={{ color: '#aaa', fontSize: '0.78rem' }}>{seg.artist}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <label style={{ fontSize: '0.75rem', color: '#888' }}>Empieza en</label>
                      <input
                        type="number"
                        value={Math.floor((seg.trackStartMs ?? 0) / 1000)}
                        onChange={(e) => handleTrackStartChange(i, Number(e.target.value))}
                        min={0}
                        max={seg.trackDurationMs ? Math.floor(seg.trackDurationMs / 1000) : undefined}
                        step={5}
                        style={{
                          width: 60,
                          padding: '0.3rem 0.4rem',
                          background: 'var(--surface2)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)',
                          color: 'var(--text)',
                          fontSize: '0.78rem',
                        }}
                      />
                      <span style={{ fontSize: '0.75rem', color: '#666' }}>
                        s ({formatTime((seg.trackStartMs ?? 0) / 1000)}
                        {seg.trackDurationMs ? ' / ' + formatTime(seg.trackDurationMs / 1000) : ''})
                      </span>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.3rem 0.5rem', fontSize: '0.78rem' }}
                        title={preview.ready ? 'Escuchar desde este punto' : 'Conectando con Spotify…'}
                        onClick={() => void preview.play(seg.trackId!, seg.trackStartMs ?? 0)}
                      >
                        ▶
                      </button>
                    </div>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                      onClick={() => setPickerSegmentIndex(i)}
                    >
                      Cambiar
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                      onClick={() => handleRemoveTrack(i)}
                    >
                      Quitar
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1, color: '#666', fontSize: '0.82rem' }}>Sin canción asignada</div>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                      onClick={() => setPickerSegmentIndex(i)}
                    >
                      Elegir canción
                    </button>
                  </>
                )}
                <button
                  className="btn btn-secondary"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                  title="Borrar este tramo — vuelve a intensidad por defecto"
                  onClick={() => handleDeleteSegment(i)}
                >
                  🗑
                </button>
              </div>
            ))}
          </div>

          {/* Track picker modal */}
          {pickerSegmentIndex !== null && (
            <div
              style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
              }}
              onClick={() => setPickerSegmentIndex(null)}
            >
              <div
                className="canvas-wrapper"
                style={{ width: 480, maxHeight: '75vh', display: 'flex', flexDirection: 'column' }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ marginBottom: '0.75rem' }}>
                  Elige la canción para el tramo {formatTime(segments[pickerSegmentIndex].startTime)}–{formatTime(segments[pickerSegmentIndex].endTime)}
                </h3>

                {spotifyError ? (
                  <div style={{ color: '#888', fontSize: '0.9rem' }}>
                    {spotifyError}{' '}
                    <button className="btn btn-spotify" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => void startSpotifyConnect()}>
                      Conectar Spotify
                    </button>
                  </div>
                ) : !selectedPlaylist ? (
                  <>
                    <p style={{ fontSize: '0.82rem', color: '#888', marginBottom: '0.5rem' }}>
                      Elige una playlist para buscar canciones:
                    </p>
                    {loadingPlaylists ? (
                      <p style={{ color: '#888', fontSize: '0.9rem' }}>Cargando playlists…</p>
                    ) : (
                      <div className="playlist-grid" style={{ overflowY: 'auto' }}>
                        {playlists.map((pl) => (
                          <div
                            key={pl.id}
                            className="playlist-item"
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
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', color: '#888' }}>Playlist: {selectedPlaylist.name}</span>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() => { setSelectedPlaylist(null); setTracks([]); }}
                      >
                        Cambiar playlist
                      </button>
                    </div>
                    {loadingTracks ? (
                      <p style={{ color: '#888', fontSize: '0.9rem' }}>Cargando canciones…</p>
                    ) : (
                      <div style={{ overflowY: 'auto' }}>
                        {tracks.map((track) => (
                          <div
                            key={track.id}
                            className="playlist-item"
                            style={{ marginBottom: 4 }}
                            onClick={() => handleAssignTrack(pickerSegmentIndex, track)}
                          >
                            {track.image ? (
                              <img src={track.image} alt={track.name} />
                            ) : (
                              <div style={{ width: 44, height: 44, background: 'var(--border)', borderRadius: 4, flexShrink: 0 }} />
                            )}
                            <div className="playlist-item-info">
                              <div className="playlist-item-name">{track.name}</div>
                              <div className="playlist-item-tracks">{track.artist} · {formatMs(track.durationMs)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                <button
                  className="btn btn-secondary"
                  style={{ marginTop: '0.75rem', alignSelf: 'flex-end', padding: '0.4rem 0.9rem' }}
                  onClick={() => setPickerSegmentIndex(null)}
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
