import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from '../config/db';
import User from '../models/User';

dotenv.config();

// Pass credentials via env vars so nothing sensitive ends up in source control:
//   SEED_EMAIL=you@example.com SEED_PASSWORD='...' npm run seed:admin
const EMAIL = process.env.SEED_EMAIL;
const PASSWORD = process.env.SEED_PASSWORD;

async function seed(): Promise<void> {
  if (!EMAIL || !PASSWORD) {
    console.error('Set SEED_EMAIL and SEED_PASSWORD env vars before running this script.');
    process.exit(1);
  }

  await connectDB();

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  await User.findOneAndUpdate(
    { email: EMAIL },
    { $set: { email: EMAIL, passwordHash } },
    { upsert: true, new: true }
  );

  console.log(`Seeded user ${EMAIL}`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
