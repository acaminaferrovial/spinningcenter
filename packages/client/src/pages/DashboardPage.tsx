import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Topbar from '../components/Topbar';
import BestCyclingChart from '../components/BestCyclingChart';
import api from '../utils/api';
import { Route } from '../types';
import { useAuth } from '../context/AuthContext';
import { startSpotifyConnect } from '../utils/spotify';

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if Spotify was just connected
    const params = new URLSearchParams(window.location.search);
    if (params.get('spotify') === 'connected') {
      window.history.replaceState({}, '', '/');
    }
    api
      .get('/routes')
      .then((r) => setRoutes(r.data))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('¿Eliminar esta ruta?')) return;
    await api.delete('/routes/' + id);
    setRoutes((prev) => prev.filter((r) => r._id !== id));
  };

  return (
    <div className="app-layout">
      <Topbar />
      <main className="main-content">
        {user && !user.spotifyConnected && (
          <div className="spotify-banner">
            <p>🎵 Conecta tu cuenta de Spotify para usar playlists en tus rutas.</p>
            <button className="btn btn-secondary" onClick={() => void startSpotifyConnect()}>
              Conectar Spotify
            </button>
          </div>
        )}

        <div className="page-header">
          <h2>Mis Rutas</h2>
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/routes/new')}>
            + Nueva ruta
          </button>
        </div>

        {loading ? (
          <p style={{ color: '#888' }}>Cargando rutas…</p>
        ) : routes.length === 0 ? (
          <div className="empty-state">
            <h3>Sin rutas todavía</h3>
            <p>Crea tu primera ruta de spinning con el diseñador.</p>
            <br />
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/routes/new')}>
              Crear primera ruta
            </button>
          </div>
        ) : (
          <div className="routes-grid">
            {routes.map((route) => (
              <div key={route._id} className="route-card" onClick={() => navigate('/routes/' + route._id + '/play')}>
                <BestCyclingChart
                  segments={route.segments}
                  totalDuration={route.totalDuration}
                  height={120}
                  className="route-card-canvas"
                />
                <div className="route-card-body">
                  <div className="route-card-name">{route.name}</div>
                  <div className="route-card-meta">
                    {formatDuration(route.totalDuration)} &nbsp;·&nbsp;{' '}
                    {route.segments.length} segmentos
                    {route.playlistName && <> &nbsp;·&nbsp; 🎵 {route.playlistName}</>}
                  </div>
                  <div className="route-card-actions">
                    <button
                      className="btn btn-green"
                      style={{ flex: 1, padding: '0.45rem', fontSize: '0.85rem' }}
                      onClick={(e) => { e.stopPropagation(); navigate('/routes/' + route._id + '/play'); }}
                    >
                      ▶ Reproducir
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
                      onClick={(e) => { e.stopPropagation(); navigate('/routes/' + route._id + '/edit'); }}
                    >
                      ✏️
                    </button>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
                      onClick={(e) => handleDelete(route._id, e)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
