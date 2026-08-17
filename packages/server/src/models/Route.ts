import mongoose, { Document, Schema } from 'mongoose';

export interface ISegment {
  startTime: number; // seconds from start
  endTime: number;   // seconds from start
  intensity: number; // 1–10
  zone: number;      // 1–5
  method: string;    // "Escalada sentado", "Sprint", etc.
  cadence?: number;  // RPM
  // Song assigned to this specific segment/region, if any
  trackId?: string;  // Spotify track ID
  trackName?: string;
  artist?: string;
  image?: string;
  trackDurationMs?: number;
  trackStartMs?: number; // where in the song playback should start, in ms
}

export interface IRoute extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  totalDuration: number; // seconds
  playlistId?: string;
  playlistName?: string;
  segments: ISegment[];
  createdAt: Date;
  updatedAt: Date;
}

const SegmentSchema = new Schema<ISegment>({
  startTime: { type: Number, required: true },
  endTime: { type: Number, required: true },
  intensity: { type: Number, required: true, min: 1, max: 10 },
  zone: { type: Number, required: true, min: 1, max: 5 },
  method: { type: String, required: true, default: 'Llano' },
  cadence: { type: Number },
  trackId: { type: String },
  trackName: { type: String },
  artist: { type: String },
  image: { type: String },
  trackDurationMs: { type: Number },
  trackStartMs: { type: Number },
});

const RouteSchema = new Schema<IRoute>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    totalDuration: { type: Number, required: true }, // seconds
    playlistId: { type: String },
    playlistName: { type: String },
    segments: [SegmentSchema],
  },
  { timestamps: true }
);

export default mongoose.model<IRoute>('Route', RouteSchema);
