import mongoose, { Document, Schema } from 'mongoose';
import type {
  CallMode,
  ConsultationStatus,
  ConsultationType,
  OutcomeType,
  Language,
} from '@healthsetu/contracts';

export interface IConsultationOutcome {
  outcomeType: OutcomeType;
  assessment: string;
  diagnosisLabel: string;
  medications: Array<{
    name: string;
    dosage: string;
    frequency: string;
    durationDays: number;
    instructions?: string;
  }>;
  tests: string[];
  notes?: string;
  followUpDate?: string;
  referralFacilityId?: string;
  issuedAt: Date;
}

export interface IConsultationMessage {
  clientId: string;
  senderId: mongoose.Types.ObjectId;
  senderRole: string;
  kind: 'TEXT' | 'IMAGE' | 'VOICE';
  body: string;
  attachmentId?: string;
  at: Date;
}

export interface IConsultation extends Document {
  patientId: mongoose.Types.ObjectId;
  doctorId?: mongoose.Types.ObjectId;
  facilityId?: mongoose.Types.ObjectId;
  screeningId?: mongoose.Types.ObjectId;
  idempotencyKey: string;
  type: ConsultationType;
  scheduledFor?: Date;
  status: ConsultationStatus;
  callMode: CallMode;
  preferredLanguage: Language;
  requiredSpecialty: string;
  priorityRank: number; // 0: LOW, 1: MEDIUM, 2: HIGH
  effectivePriority: number;
  sequence: number;
  positionInQueue: number;
  estimatedWaitMinutes: number;
  zegoRoomId: string;
  startedAt?: Date;
  endedAt?: Date;
  outcome?: IConsultationOutcome;
  messages: IConsultationMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const ConsultationMessageSchema = new Schema<IConsultationMessage>({
  clientId: { type: String, required: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  senderRole: { type: String, required: true },
  kind: { type: String, enum: ['TEXT', 'IMAGE', 'VOICE'], default: 'TEXT' },
  body: { type: String, required: true },
  attachmentId: { type: String },
  at: { type: Date, default: () => new Date() },
});

const ConsultationOutcomeSchema = new Schema<IConsultationOutcome>({
  outcomeType: {
    type: String,
    enum: ['ADVICE', 'PRESCRIPTION', 'FOLLOW_UP', 'REFERRAL'],
    required: true,
  },
  assessment: { type: String, required: true },
  diagnosisLabel: { type: String, required: true },
  medications: [
    {
      name: { type: String, required: true },
      dosage: { type: String, required: true },
      frequency: { type: String, required: true },
      durationDays: { type: Number, required: true },
      instructions: { type: String },
    },
  ],
  tests: [{ type: String }],
  notes: { type: String },
  followUpDate: { type: String },
  referralFacilityId: { type: String },
  issuedAt: { type: Date, default: () => new Date() },
});

const ConsultationSchema = new Schema<IConsultation>(
  {
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
    screeningId: {
      type: Schema.Types.ObjectId,
      ref: 'Screening',
      index: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['NOW', 'SCHEDULED'],
      default: 'NOW',
    },
    scheduledFor: {
      type: Date,
    },
    status: {
      type: String,
      enum: [
        'REQUESTED',
        'QUEUED',
        'READY',
        'IN_PROGRESS',
        'DOCUMENTATION_PENDING',
        'COMPLETED',
        'CANCELLED',
        'MISSED',
        'EXPIRED',
      ],
      default: 'QUEUED',
      index: true,
    },
    callMode: {
      type: String,
      enum: ['VIDEO', 'AUDIO', 'CHAT'],
      default: 'VIDEO',
    },
    preferredLanguage: {
      type: String,
      enum: ['en', 'hi', 'mr'],
      default: 'hi',
    },
    requiredSpecialty: {
      type: String,
      default: 'General Physician',
      index: true,
    },
    priorityRank: {
      type: Number,
      default: 0,
      index: true,
    },
    effectivePriority: {
      type: Number,
      default: 10,
      index: true,
    },
    sequence: {
      type: Number,
      default: 1,
    },
    positionInQueue: {
      type: Number,
      default: 1,
    },
    estimatedWaitMinutes: {
      type: Number,
      default: 5,
    },
    zegoRoomId: {
      type: String,
      required: true,
      index: true,
    },
    startedAt: {
      type: Date,
    },
    endedAt: {
      type: Date,
    },
    outcome: ConsultationOutcomeSchema,
    messages: [ConsultationMessageSchema],
  },
  {
    timestamps: true,
  },
);

ConsultationSchema.index({ status: 1, effectivePriority: -1, createdAt: 1 });

export const Consultation = mongoose.model<IConsultation>('Consultation', ConsultationSchema);
