import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { apiLimiter } from '../middleware/rateLimiter';
import {
  getRoutes,
  getRoute,
  createRoute,
  updateRoute,
  deleteRoute,
} from '../controllers/routeController';

const router = Router();

router.use(apiLimiter);
router.use(authMiddleware);

router.get('/', asyncHandler<AuthRequest>(getRoutes));
router.get('/:id', asyncHandler<AuthRequest>(getRoute));
router.post('/', asyncHandler<AuthRequest>(createRoute));
router.put('/:id', asyncHandler<AuthRequest>(updateRoute));
router.delete('/:id', asyncHandler<AuthRequest>(deleteRoute));

export default router;
