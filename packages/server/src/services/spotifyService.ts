import axios from 'axios';
import User from '../models/User';
import { encrypt, decrypt } from '../utils/crypto';

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

export async function refreshSpotifyToken(userId: string): Promise<string> {
  const user = await User.findById(userId);
  if (!user?.spotifyTokens) throw new Error('No Spotify tokens for user');

  const { accessToken, refreshToken, expiresAt } = user.spotifyTokens;

  // Return existing token if still valid (5 min buffer)
  if (new Date(expiresAt).getTime() - Date.now() > 5 * 60 * 1000) {
    return decrypt(accessToken);
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await axios.post(
    SPOTIFY_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: decrypt(refreshToken),
    }),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  const { access_token, expires_in, refresh_token: newRefreshToken } = response.data;
  const newExpiresAt = new Date(Date.now() + expires_in * 1000);

  user.spotifyTokens = {
    accessToken: encrypt(access_token),
    refreshToken: newRefreshToken ? encrypt(newRefreshToken) : refreshToken,
    expiresAt: newExpiresAt,
  };
  await user.save();

  return access_token;
}
