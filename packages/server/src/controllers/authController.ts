import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User';

function signToken(userId: string): string {
  const secret = process.env.JWT_SECRET || 'changeme';
  return jwt.sign({ userId }, secret, { expiresIn: 604800 }); // 7 days in seconds
}

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ message: 'Email and password are required' });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const token = signToken(String(user._id));
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        spotifyConnected: !!user.spotifyTokens,
      },
    });
  } catch (error) {
    if (error instanceof mongoose.Error.MongooseServerSelectionError) {
      res.status(503).json({ message: 'Database unavailable. Check MongoDB connection.' });
      return;
    }

    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const me = async (req: Request & { userId?: string }, res: Response): Promise<void> => {
  const user = await User.findById(req.userId).select('-passwordHash');
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  res.json({ id: user._id, email: user.email, spotifyConnected: !!user.spotifyTokens });
};
