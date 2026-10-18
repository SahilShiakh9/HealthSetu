import { Schema, model, type Document } from 'mongoose';

export interface IOtpCode extends Document {
  identifier: string; // phone or email
  codeHash: string;
  purpose: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

const OtpCodeSchema = new Schema<IOtpCode>(
  {
    identifier: {
      type: String,
      required: true,
      index: true,
    },
    codeHash: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      default: 'LOGIN',
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB TTL index: expires immediately at expiresAt
    },
    attempts: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

export const OtpCode = model<IOtpCode>('OtpCode', OtpCodeSchema);
