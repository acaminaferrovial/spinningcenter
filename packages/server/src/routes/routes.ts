import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
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

router.get('/', getRoutes);
router.get('/:id', getRoute);
router.post('/', createRoute);
router.put('/:id', updateRoute);
router.delete('/:id', deleteRoute);

export default router;
