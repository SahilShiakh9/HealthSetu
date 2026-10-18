import { Schema, model, type Document, Types } from 'mongoose';

export type QueueEntryStatus = 'WAITING' | 'CALLED' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED' | 'MISSED';

export interface IQueueEntry extends Document {
  consultationId: Types.ObjectId;
  patientId: Types.ObjectId;
  doctorId?: Types.ObjectId;
  facilityId?: Types.ObjectId;
  poolKey: string;
  priorityRank: number; // 0: HIGH, 1: MEDIUM, 2: LOW
  effectivePriority: number;
  sequence: number;
  preferredDoctorId?: Types.ObjectId;
  status: QueueEntryStatus;
  joinedAt: Date;
  calledAt?: Date;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

const QueueEntrySchema = new Schema<IQueueEntry>(
  {
    consultationId: {
      type: Schema.Types.ObjectId,
      ref: 'Consultation',
      required: true,
      unique: true,
      index: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    facilityId: {
      type: Schema.Types.ObjectId,
      ref: 'Facility',
      index: true,
      sparse: true,
    },
    poolKey: {
      type: String,
      required: true,
      index: true,
    },
    priorityRank: {
      type: Number,
      required: true,
      index: true,
    },
    effectivePriority: {
      type: Number,
      required: true,
      index: true,
    },
    sequence: {
      type: Number,
      required: true,
      index: true,
    },
    preferredDoctorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    status: {
      type: String,
      enum: ['WAITING', 'CALLED', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'MISSED'],
      default: 'WAITING',
      required: true,
      index: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    calledAt: {
      type: Date,
      index: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// High-performance compound index for late binding atomic claim
QueueEntrySchema.index({ status: 1, poolKey: 1, effectivePriority: 1, sequence: 1 });

export const QueueEntry = model<IQueueEntry>('QueueEntry', QueueEntrySchema);
