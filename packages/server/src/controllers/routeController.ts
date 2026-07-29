import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Route from '../models/Route';

export const getRoutes = async (req: AuthRequest, res: Response): Promise<void> => {
  const routes = await Route.find({ userId: req.userId }).sort({ createdAt: -1 });
  res.json(routes);
};

export const getRoute = async (req: AuthRequest, res: Response): Promise<void> => {
  const route = await Route.findOne({ _id: req.params.id, userId: req.userId });
  if (!route) {
    res.status(404).json({ message: 'Route not found' });
    return;
  }
  res.json(route);
};

export const createRoute = async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, totalDuration, playlistId, playlistName, segments } = req.body;
  if (!name || !totalDuration) {
    res.status(400).json({ message: 'Name and totalDuration are required' });
    return;
  }
  const route = await Route.create({
    userId: req.userId,
    name,
    totalDuration,
    playlistId,
    playlistName,
    segments: segments || [],
  });
  res.status(201).json(route);
};

export const updateRoute = async (req: AuthRequest, res: Response): Promise<void> => {
  const route = await Route.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    req.body,
    { new: true, runValidators: true }
  );
  if (!route) {
    res.status(404).json({ message: 'Route not found' });
    return;
  }
  res.json(route);
};

export const deleteRoute = async (req: AuthRequest, res: Response): Promise<void> => {
  const route = await Route.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!route) {
    res.status(404).json({ message: 'Route not found' });
    return;
  }
  res.json({ message: 'Route deleted' });
};
