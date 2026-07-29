import { Request, Response } from 'express';
import axios from 'axios';
import { AuthRequest } from '../middleware/auth';
import User from '../models/User';
import { encrypt } from '../utils/crypto';
import { refreshSpotifyToken } from '../services/spotifyService';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

export const spotifyLogin = (_req: Request, res: Response): void => {
  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI!;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
  });

  res.redirect(`${SPOTIFY_AUTH_URL}?${params.toString()}`);
};

export const spotifyCallback = async (req: Request & { userId?: string }, res: Response): Promise<void> => {
  const { code, state } = req.query as { code?: string; state?: string };
  const userId = state; // we pass userId as state

  if (!code || !userId) {
    res.status(400).json({ message: 'Missing code or state' });
    return;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI!;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const tokenResponse = await axios.post(
    SPOTIFY_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  const { access_token, refresh_token, expires_in } = tokenResponse.data;
  const expiresAt = new Date(Date.now() + expires_in * 1000);

  await User.findByIdAndUpdate(userId, {
    spotifyTokens: {
      accessToken: encrypt(access_token),
      refreshToken: encrypt(refresh_token),
      expiresAt,
    },
  });

  res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?spotify=connected`);
};

export const spotifyLoginWithState = (req: AuthRequest, res: Response): void => {
  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI!;
  const userId = req.userId!;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri,
    state: userId,
  });

  res.redirect(`${SPOTIFY_AUTH_URL}?${params.toString()}`);
};

export const getPlaylists = async (req: AuthRequest, res: Response): Promise<void> => {
  const accessToken = await refreshSpotifyToken(req.userId!);
  const response = await axios.get(`${SPOTIFY_API_URL}/me/playlists?limit=50`, {
    headers: { Authorization: 'Bearer ' + accessToken },
  });

  const playlists = response.data.items.map((p: any) => ({
    id: p.id,
    name: p.name,
    tracks: p.tracks.total,
    image: p.images?.[0]?.url,
  }));

  res.json(playlists);
};

export const getPlaylistTracks = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const accessToken = await refreshSpotifyToken(req.userId!);

  const response = await axios.get(
    `${SPOTIFY_API_URL}/playlists/${id}/tracks?limit=100&fields=items(track(id,name,duration_ms,artists,album(images)))`,
    { headers: { Authorization: 'Bearer ' + accessToken } }
  );

  const tracks = response.data.items
    .filter((item: any) => item.track)
    .map((item: any) => ({
      id: item.track.id,
      name: item.track.name,
      artist: item.track.artists.map((a: any) => a.name).join(', '),
      durationMs: item.track.duration_ms,
      image: item.track.album.images?.[0]?.url,
    }));

  res.json(tracks);
};

export const getSpotifyToken = async (req: AuthRequest, res: Response): Promise<void> => {
  const accessToken = await refreshSpotifyToken(req.userId!);
  res.json({ accessToken });
};
