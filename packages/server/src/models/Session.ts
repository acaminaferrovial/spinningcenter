import mongoose, { Document, Schema } from 'mongoose';

export interface ISession extends Document {
  userId: mongoose.Types.ObjectId;
  routeId: mongoose.Types.ObjectId;
  startedAt: Date;
  completedAt?: Date;
  progress: number; // seconds elapsed
}

const SessionSchema = new Schema<ISession>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  routeId: { type: Schema.Types.ObjectId, ref: 'Route', required: true },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  progress: { type: Number, default: 0 },
});

export default mongoose.model<ISession>('Session', SessionSchema);
