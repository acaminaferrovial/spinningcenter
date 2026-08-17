import api from './api';

export async function startSpotifyConnect(): Promise<void> {
  const response = await api.get('/auth/spotify/url');
  window.location.assign(response.data.url);
}