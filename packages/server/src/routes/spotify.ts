import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  getPlaylists,
  getPlaylistTracks,
  getSpotifyToken,
} from '../controllers/spotifyController';

const router = Router();

router.use(authMiddleware);

router.get('/token', getSpotifyToken);
router.get('/playlists', getPlaylists);
router.get('/playlists/:id/tracks', getPlaylistTracks);

export default router;
