import mongoose, { Schema, Document } from 'mongoose';
import type {
  Syndrome,
  RiskTier,
  AgeBand,
  Gender,
} from '@healthsetu/contracts';

export interface IHealthSignalEvent extends Document {
  areaCode: string;
  phcId: string;
  districtCode: string;
  syndrome: Syndrome;
  riskTier: RiskTier;
  ageBand: AgeBand;
  gender: Gender;
  day: string; // YYYY-MM-DD
  createdAt: number;
}

const HealthSignalEventSchema = new Schema<IHealthSignalEvent>(
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
    riskTier: {
      type: String,
      required: true,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
      index: true,
    },
    ageBand: {
      type: String,
      required: true,
      enum: ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61+'],
    },
    gender: {
      type: String,
      required: true,
      enum: ['M', 'F', 'O', 'U'],
    },
    day: { type: String, required: true, index: true },
    createdAt: { type: Number, required: true, default: Date.now },
  },
  {
    timestamps: false,
    versionKey: false,
  },
);

HealthSignalEventSchema.index({ phcId: 1, day: 1, syndrome: 1 });
HealthSignalEventSchema.index({ areaCode: 1, day: 1, syndrome: 1 });

export const HealthSignalEvent = mongoose.model<IHealthSignalEvent>(
  'HealthSignalEvent',
  HealthSignalEventSchema,
);
