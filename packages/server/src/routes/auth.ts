import { Router } from 'express';
import { register, login, me } from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';
import { spotifyLoginWithState, spotifyCallback } from '../controllers/spotifyController';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authMiddleware, me);
router.get('/spotify', authMiddleware, spotifyLoginWithState);
router.get('/spotify/callback', spotifyCallback);

export default router;
