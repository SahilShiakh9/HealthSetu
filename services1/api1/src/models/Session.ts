import { Schema, model, type Document, Types } from 'mongoose';

export interface ISession extends Document {
  userId: Types.ObjectId;
  sid: string;
  refreshFamilyId: string;
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt?: Date | null;
  userAgent?: string;
  expiresAt?: Date | null;
}

const SessionSchema = new Schema<ISession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    refreshFamilyId: {
      type: String,
      required: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    revokedAt: {
      type: Date,
      default: null,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    userAgent: {
      type: String,
      default: 'Unknown',
    },
  },
  {
    timestamps: true,
  },
);

// TTL index to automatically purge expired sessions after 30 days
SessionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

export const Session = model<ISession>('Session', SessionSchema);
