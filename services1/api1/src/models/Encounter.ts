import { Schema, model, type Document, Types } from 'mongoose';

export interface IEncounterMedication {
  name: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  instructions?: string;
}

export interface IEncounter extends Document {
  consultationId: Types.ObjectId;
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  screeningId?: Types.ObjectId;
  status: 'DRAFT' | 'FINAL';
  version: number;
  supersedes?: Types.ObjectId;
  assessment: string;
  diagnosisLabel: string;
  medications: IEncounterMedication[];
  tests: string[];
  notes?: string;
  followUpDate?: string;
  referralFacilityId?: string;
  finalizedAt?: Date;
  finalizedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const EncounterMedicationSchema = new Schema<IEncounterMedication>(
  {
    name: { type: String, required: true },
    dosage: { type: String, required: true },
    frequency: { type: String, required: true },
    durationDays: { type: Number, required: true },
    instructions: { type: String },
  },
  { _id: false },
);

const EncounterSchema = new Schema<IEncounter>(
  {
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
    screeningId: {
      type: Schema.Types.ObjectId,
      ref: 'Screening',
      index: true,
    },
    status: {
      type: String,
      enum: ['DRAFT', 'FINAL'],
      default: 'DRAFT',
      required: true,
      index: true,
    },
    version: {
      type: Number,
      default: 1,
      required: true,
    },
    supersedes: {
      type: Schema.Types.ObjectId,
      ref: 'Encounter',
      index: true,
    },
    assessment: {
      type: String,
      required: true,
    },
    diagnosisLabel: {
      type: String,
      required: true,
    },
    medications: {
      type: [EncounterMedicationSchema],
      default: [],
    },
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
    finalizedAt: {
      type: Date,
      index: true,
    },
    finalizedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  },
);

EncounterSchema.index({ consultationId: 1, version: -1 });
EncounterSchema.index({ patientId: 1, status: 1 });
EncounterSchema.index({ doctorId: 1, status: 1 });

export const Encounter = model<IEncounter>('Encounter', EncounterSchema);
