import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { apiLimiter } from '../middleware/rateLimiter';
import {
  getPlaylists,
  getPlaylistTracks,
  getSpotifyToken,
} from '../controllers/spotifyController';

const router = Router();

router.use(apiLimiter);
router.use(authMiddleware);

router.get('/token', asyncHandler<AuthRequest>(getSpotifyToken));
router.get('/playlists', asyncHandler<AuthRequest>(getPlaylists));
router.get('/playlists/:id/tracks', asyncHandler<AuthRequest>(getPlaylistTracks));

export default router;
