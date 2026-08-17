import { Router } from 'express';
import { login, me } from '../controllers/authController';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { authLimiter } from '../middleware/rateLimiter';
import { spotifyLoginWithState, spotifyCallback, getSpotifyAuthorizeUrl } from '../controllers/spotifyController';

const router = Router();

router.post('/login', authLimiter, asyncHandler(login));
router.get('/me', authLimiter, authMiddleware, asyncHandler<AuthRequest>(me));
router.get('/spotify/url', authLimiter, authMiddleware, getSpotifyAuthorizeUrl);
router.get('/spotify', authLimiter, authMiddleware, spotifyLoginWithState);
router.get('/spotify/callback', authLimiter, asyncHandler(spotifyCallback));

export default router;
