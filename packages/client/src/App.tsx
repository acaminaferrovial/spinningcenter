import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import RouteDesignerPage from './pages/RouteDesignerPage';
import PlaybackPage from './pages/PlaybackPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Cargando…</div>;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <DashboardPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/routes/new"
            element={
              <PrivateRoute>
                <RouteDesignerPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/routes/:id/edit"
            element={
              <PrivateRoute>
                <RouteDesignerPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/routes/:id/play"
            element={
              <PrivateRoute>
                <PlaybackPage />
              </PrivateRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
