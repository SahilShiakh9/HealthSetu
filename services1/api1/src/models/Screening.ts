import mongoose, { Document, Schema } from 'mongoose';
import {
  RiskTier,
  ScreeningSource,
  SeverityLevel,
  DurationUnit,
  Language,
} from '@healthsetu/contracts';

export interface IScreening extends Document {
  clientId: string;
  patientId: mongoose.Types.ObjectId;
  submittedBy: mongoose.Types.ObjectId;
  language: Language;
  symptoms: string[];
  answers: Array<{
    questionId: string;
    symptomId: string;
    value: 'yes' | 'no' | 'unknown';
    at: number;
  }>;
  duration?: {
    value: number;
    unit: DurationUnit;
  };
  severity: SeverityLevel;
  emergencyFlags: string[];
  riskTier: RiskTier;
  isEmergency: boolean;
  possibleConditions: Array<{
    name: string;
    probability: number;
  }>;
  symptomGroups: string[];
  recommendedSpecialty: string;
  source: ScreeningSource;
  modelVersion: string;
  triageConfigVersion: string;
  engine?: {
    type: 'rules' | 'naive-bayes' | 'ml';
    version: string;
    source: string;
  };
  imageIds: string[];
  location?: {
    lat: number;
    lng: number;
    accuracyM?: number;
  };
  villageCode?: string;
  inputMethod: 'voice' | 'text';
  voiceTranscript?: string;
  candidateCategory?: string;
  referralStatus: 'none' | 'pending' | 'referred' | 'completed';
  status: 'started' | 'in_progress' | 'completed' | 'interrupted';
  district?: string;
  block?: string;
  isOfflineSync: boolean;
  assignedNgoId?: mongoose.Types.ObjectId;
  clientCreatedAt: number;
  receivedAt: number;
  createdAt: Date;
  updatedAt: Date;
}

const ScreeningSchema = new Schema<IScreening>(
  {
    clientId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    submittedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    language: {
      type: String,
      required: true,
    },
    symptoms: {
      type: [String],
      default: [],
    },
    answers: [
      {
        questionId: { type: String, required: true },
        symptomId: { type: String, required: true },
        value: { type: String, required: true, enum: ['yes', 'no', 'unknown'] },
        at: { type: Number, required: true },
      },
    ],
    duration: {
      value: { type: Number },
      unit: { type: String, enum: ['days', 'weeks', 'months'] },
    },
    severity: {
      type: String,
      default: 'unknown',
    },
    emergencyFlags: {
      type: [String],
      default: [],
    },
    riskTier: {
      type: String,
      required: true,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
      index: true,
    },
    isEmergency: {
      type: Boolean,
      default: false,
      index: true,
    },
    possibleConditions: [
      {
        name: { type: String, required: true },
        probability: { type: Number, required: true },
      },
    ],
    symptomGroups: {
      type: [String],
      default: [],
    },
    recommendedSpecialty: {
      type: String,
      default: 'General Physician',
    },
    source: {
      type: String,
      default: 'device',
      enum: ['device', 'server', 'api-fallback', 'ml-assist'],
    },
    modelVersion: {
      type: String,
      default: '1.0.0-rules',
    },
    triageConfigVersion: {
      type: String,
      default: '1.0.0',
    },
    engine: {
      type: {
        type: String,
        enum: ['rules', 'naive-bayes', 'ml'],
        default: 'naive-bayes',
      },
      version: {
        type: String,
        default: '1.0.0',
      },
      source: {
        type: String,
        default: 'on-device-laplace-naive-bayes',
      },
    },
    imageIds: {
      type: [String],
      default: [],
    },
    location: {
      lat: { type: Number },
      lng: { type: Number },
      accuracyM: { type: Number },
    },
    villageCode: {
      type: String,
      index: true,
    },
    inputMethod: {
      type: String,
      enum: ['voice', 'text'],
      default: 'text',
      index: true,
    },
    voiceTranscript: {
      type: String,
    },
    candidateCategory: {
      type: String,
      index: true,
    },
    referralStatus: {
      type: String,
      enum: ['none', 'pending', 'referred', 'completed'],
      default: 'none',
      index: true,
    },
    status: {
      type: String,
      enum: ['started', 'in_progress', 'completed', 'interrupted'],
      default: 'completed',
      index: true,
    },
    district: {
      type: String,
      index: true,
    },
    block: {
      type: String,
      index: true,
    },
    isOfflineSync: {
      type: Boolean,
      default: false,
      index: true,
    },
    assignedNgoId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    clientCreatedAt: {
      type: Number,
      required: true,
    },
    receivedAt: {
      type: Number,
      required: true,
      default: () => Date.now(),
    },
  },
  {
    timestamps: true,
  }
);

ScreeningSchema.index({ createdAt: -1 });
ScreeningSchema.index({ riskTier: 1, createdAt: -1 });
ScreeningSchema.index({ language: 1, createdAt: -1 });
ScreeningSchema.index({ district: 1, createdAt: -1 });

export const Screening = mongoose.model<IScreening>('Screening', ScreeningSchema);
