import mongoose, { Document, Schema } from 'mongoose';

export interface ISpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  spotifyTokens?: ISpotifyTokens;
  createdAt: Date;
}

const SpotifyTokensSchema = new Schema<ISpotifyTokens>({
  accessToken: { type: String, required: true },
  refreshToken: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    spotifyTokens: { type: SpotifyTokensSchema, required: false },
  },
  { timestamps: true }
);

export default mongoose.model<IUser>('User', UserSchema);
