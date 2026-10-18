import mongoose, { Schema, Document } from 'mongoose';
import type {
  Syndrome,
  AlertSeverity,
  AlertStatus,
} from '@healthsetu/contracts';

export interface IEpidemicAlert extends Document {
  areaCode: string;
  phcId: string;
  districtCode: string;
  syndrome: Syndrome;
  day: string;
  observedCount: number;
  baselineMean: number;
  zScore: number;
  severity: AlertSeverity;
  status: AlertStatus;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  message: string;
  insufficientBaseline: boolean;
  workflowStage?: 'DETECTED' | 'UNDER_REVIEW' | 'INVESTIGATION' | 'ACTION_REQUIRED' | 'RESOLVED';
  investigationNotes?: string;
  assignedTo?: string;
  actionPlan?: string;
  dueDate?: string;
  resolvedReason?: string;
  resolvedBy?: string;
  resolvedAt?: Date;
  createdAt: Date;
}

const EpidemicAlertSchema = new Schema<IEpidemicAlert>(
  {
    areaCode: { type: String, required: true, index: true },
    phcId: { type: String, required: true, index: true },
    districtCode: { type: String, required: true, index: true },
    syndrome: {
      type: String,
      required: true,
      enum: [
        'respiratory',
        'gastrointestinal',
        'febrile_illness',
        'fever_with_rash',
        'neurological',
        'cardiovascular',
        'skin',
        'musculoskeletal',
        'other',
      ],
      index: true,
    },
    day: { type: String, required: true, index: true },
    observedCount: { type: Number, required: true },
    baselineMean: { type: Number, required: true },
    zScore: { type: Number, required: true },
    severity: {
      type: String,
      required: true,
      enum: ['WATCH', 'HIGH'],
      default: 'WATCH',
    },
    status: {
      type: String,
      required: true,
      enum: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'],
      default: 'OPEN',
      index: true,
    },
    workflowStage: {
      type: String,
      enum: ['DETECTED', 'UNDER_REVIEW', 'INVESTIGATION', 'ACTION_REQUIRED', 'RESOLVED'],
      default: 'DETECTED',
      index: true,
    },
    investigationNotes: { type: String },
    assignedTo: { type: String },
    actionPlan: { type: String },
    dueDate: { type: String },
    resolvedReason: { type: String },
    resolvedBy: { type: String },
    resolvedAt: { type: Date },
    acknowledgedBy: { type: String },
    acknowledgedAt: { type: Date },
    message: { type: String, required: true },
    insufficientBaseline: { type: Boolean, default: false },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
    versionKey: false,
  },
);

EpidemicAlertSchema.index({ phcId: 1, status: 1 });
EpidemicAlertSchema.index({ areaCode: 1, syndrome: 1, day: 1 });

export const EpidemicAlert = mongoose.model<IEpidemicAlert>(
  'EpidemicAlert',
  EpidemicAlertSchema,
);
