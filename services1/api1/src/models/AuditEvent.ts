import { Schema, model, type Document, Types } from 'mongoose';
import type { Role } from '@healthsetu/contracts';

export interface IAuditEvent extends Document {
  actorId?: Types.ObjectId;
  actorRole?: Role;
  action: string;
  resourceType: string;
  resourceId?: string;
  ip?: string;
  at: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const AuditEventSchema = new Schema<IAuditEvent>(
  {
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    actorRole: {
      type: String,
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    resourceType: {
      type: String,
      required: true,
      index: true,
    },
    resourceId: {
      type: String,
      index: true,
    },
    ip: {
      type: String,
    },
    at: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
);

export const AuditEvent = model<IAuditEvent>('AuditEvent', AuditEventSchema);
