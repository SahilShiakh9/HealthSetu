import { Schema, model, type Document, Types } from 'mongoose';
import type { AgeBand, Gender } from '@healthsetu/contracts';

export interface IPatient extends Document {
  userId: Types.ObjectId;
  ageBand?: AgeBand;
  age?: number;
  dateOfBirth?: Date;
  gender?: Gender;
  villageCode?: string;
  districtCode?: string;
  phcId?: Types.ObjectId;
  consentRefs: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const PatientSchema = new Schema<IPatient>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    ageBand: {
      type: String,
      enum: ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61+'],
    },
    age: {
      type: Number,
      min: 0,
      max: 130,
    },
    dateOfBirth: {
      type: Date,
    },
    gender: {
      type: String,
      enum: ['M', 'F', 'O', 'U'],
    },
    villageCode: {
      type: String,
      index: true,
    },
    districtCode: {
      type: String,
      index: true,
    },
    phcId: {
      type: Schema.Types.ObjectId,
      ref: 'Facility',
      index: true,
    },
    consentRefs: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Consent',
      },
    ],
  },
  {
    timestamps: true,
  },
);

export const Patient = model<IPatient>('Patient', PatientSchema);
