import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSpotifyConnect = () => {
    window.location.href = '/api/auth/spotify';
  };

  return (
    <header className="topbar">
      <Link to="/" className="topbar-brand">⚡ SpinningCenter</Link>
      <div className="topbar-actions">
        {user && !user.spotifyConnected && (
          <button className="btn btn-spotify" style={{ padding: '0.45rem 1rem', fontSize: '0.85rem' }} onClick={handleSpotifyConnect}>
            🎵 Conectar Spotify
          </button>
        )}
        {user && user.spotifyConnected && (
          <span style={{ fontSize: '0.8rem', color: '#1db954' }}>✓ Spotify conectado</span>
        )}
        <span style={{ fontSize: '0.85rem', color: '#888' }}>{user?.email}</span>
        <button className="btn btn-secondary" style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }} onClick={handleLogout}>
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}
