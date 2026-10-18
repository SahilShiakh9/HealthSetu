import { Schema, model, type Document, Types } from 'mongoose';
import type { ConsentPurpose, Language } from '@healthsetu/contracts';

export interface IConsent extends Document {
  subjectId: Types.ObjectId;
  purpose: ConsentPurpose;
  granted: boolean;
  policyVersion: string;
  language: Language;
  givenAt: Date;
  revokedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ConsentSchema = new Schema<IConsent>(
  {
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    purpose: {
      type: String,
      enum: ['SCREENING_STORAGE', 'TELECONSULTATION', 'ANONYMISED_ANALYTICS'],
      required: true,
      index: true,
    },
    granted: {
      type: Boolean,
      required: true,
      default: true,
    },
    policyVersion: {
      type: String,
      required: true,
      default: '1.0.0',
    },
    language: {
      type: String,
      enum: ['en', 'hi', 'mr'],
      required: true,
      default: 'en',
    },
    givenAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for querying active consent
ConsentSchema.index({ subjectId: 1, purpose: 1, granted: 1 });

export const Consent = model<IConsent>('Consent', ConsentSchema);
