import { Router } from 'express';
import { register, login, me } from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimiter';
import { spotifyLoginWithState, spotifyCallback } from '../controllers/spotifyController';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.get('/me', authLimiter, authMiddleware, me);
router.get('/spotify', authLimiter, authMiddleware, spotifyLoginWithState);
router.get('/spotify/callback', spotifyCallback);

export default router;
