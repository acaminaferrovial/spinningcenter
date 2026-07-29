import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

function signToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: 604800 }); // 7 days in seconds
}

export const register = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ message: 'Email and password are required' });
    return;
  }

  const existing = await User.findOne({ email });
  if (existing) {
    res.status(409).json({ message: 'Email already registered' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ email, passwordHash });

  const token = signToken(String(user._id));
  res.status(201).json({ token, user: { id: user._id, email: user.email } });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ message: 'Email and password are required' });
    return;
  }

  const user = await User.findOne({ email });
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
};

export const me = async (req: Request & { userId?: string }, res: Response): Promise<void> => {
  const user = await User.findById(req.userId).select('-passwordHash -spotifyTokens');
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  res.json({ id: user._id, email: user.email });
};
