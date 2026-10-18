import { Schema, model, type Document, Types } from 'mongoose';
import type { IEncounterMedication } from './Encounter.js';

export interface IReport extends Document {
  encounterId: Types.ObjectId;
  consultationId: Types.ObjectId;
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  reportNumber: string;
  patientName: string;
  patientPhone?: string;
  doctorName: string;
  doctorRegistration: string;
  facilityName?: string;
  diagnosis: string;
  assessment: string;
  medications: IEncounterMedication[];
  tests: string[];
  notes?: string;
  followUpDate?: string;
  referralFacilityId?: string;
  issuedAt: Date;
  isMock: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    encounterId: {
      type: Schema.Types.ObjectId,
      ref: 'Encounter',
      required: true,
      unique: true,
      index: true,
    },
    consultationId: {
      type: Schema.Types.ObjectId,
      ref: 'Consultation',
      required: true,
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
      required: true,
      index: true,
    },
    reportNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    patientName: {
      type: String,
      required: true,
    },
    patientPhone: {
      type: String,
    },
    doctorName: {
      type: String,
      required: true,
    },
    doctorRegistration: {
      type: String,
      required: true,
    },
    facilityName: {
      type: String,
      default: 'Primary Health Telemedicine Network',
    },
    diagnosis: {
      type: String,
      required: true,
    },
    assessment: {
      type: String,
      required: true,
    },
    medications: [
      {
        name: { type: String, required: true },
        dosage: { type: String, required: true },
        frequency: { type: String, required: true },
        durationDays: { type: Number, required: true },
        instructions: { type: String },
      },
    ],
    tests: {
      type: [String],
      default: [],
    },
    notes: {
      type: String,
    },
    followUpDate: {
      type: String,
    },
    referralFacilityId: {
      type: String,
    },
    issuedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
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

ReportSchema.index({ patientId: 1, issuedAt: -1 });
ReportSchema.index({ doctorId: 1, issuedAt: -1 });

export const Report = model<IReport>('Report', ReportSchema);
