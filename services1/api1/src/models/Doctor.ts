import { Schema, model, type Document, Types } from 'mongoose';
import type { DoctorAvailability, DoctorVerificationStatus } from '@healthsetu/contracts';

export interface IWeeklySlot {
  dayOfWeek: number; // 0 (Sun) - 6 (Sat)
  start: string; // HH:mm
  end: string; // HH:mm
}

export interface IDoctor extends Document {
  userId: Types.ObjectId;
  specialties: string[];
  languages: string[];
  registrationNumber: string;
  medicalCouncil?: string;
  registrationYear?: number;
  qualification: string;
  additionalQualification?: string;
  experienceYears: number;
  verificationStatus: DoctorVerificationStatus;
  reviewerNotes?: string;
  availability: DoctorAvailability;
  consultationModes: string[];
  bio?: string;
  lastHeartbeatAt?: Date;
  maxQueue: number;
  facilityId?: Types.ObjectId;
  districtCode?: string;
  weeklyAvailability: IWeeklySlot[];
  rollingAvgConsultMinutes: number;
  isMock: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DoctorSchema = new Schema<IDoctor>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    specialties: {
      type: [String],
      default: ['General Physician'],
      index: true,
    },
    languages: {
      type: [String],
      default: ['en', 'hi'],
      index: true,
    },
    registrationNumber: {
      type: String,
      default: 'MCI-PENDING',
    },
    medicalCouncil: {
      type: String,
      default: '',
    },
    registrationYear: {
      type: Number,
      default: 2020,
    },
    qualification: {
      type: String,
      default: 'MBBS',
    },
    additionalQualification: {
      type: String,
      default: '',
    },
    experienceYears: {
      type: Number,
      default: 1,
    },
    verificationStatus: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'],
      default: 'PENDING',
      index: true,
    },
    reviewerNotes: {
      type: String,
      default: '',
    },
    availability: {
      type: String,
      enum: ['AVAILABLE', 'BUSY', 'BREAK', 'OFFLINE'],
      default: 'OFFLINE',
      index: true,
    },
    consultationModes: {
      type: [String],
      default: ['VIDEO', 'AUDIO'],
    },
    bio: {
      type: String,
      default: '',
    },
    lastHeartbeatAt: {
      type: Date,
      default: null,
    },
    maxQueue: {
      type: Number,
      default: 10,
    },
    facilityId: {
      type: Schema.Types.ObjectId,
      ref: 'Facility',
      index: true,
    },
    districtCode: {
      type: String,
      index: true,
    },
    weeklyAvailability: [
      {
        dayOfWeek: { type: Number, required: true },
        start: { type: String, required: true },
        end: { type: String, required: true },
      },
    ],
    rollingAvgConsultMinutes: {
      type: Number,
      default: 10,
    },
    isMock: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

export const Doctor = model<IDoctor>('Doctor', DoctorSchema);
