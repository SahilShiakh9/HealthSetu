import { Schema, model, type Document, Types } from 'mongoose';
import type { AffiliationStatus, AffiliationRole } from '@healthsetu/contracts';

export interface IDoctorAffiliation extends Document {
  doctorUserId: Types.ObjectId;
  facilityId: Types.ObjectId;
  status: AffiliationStatus;
  roleInFacility: AffiliationRole;
  requestedBy: Types.ObjectId;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DoctorAffiliationSchema = new Schema<IDoctorAffiliation>(
  {
    doctorUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    facilityId: {
      type: Schema.Types.ObjectId,
      ref: 'Facility',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'REJECTED', 'REVOKED'],
      default: 'PENDING',
      index: true,
    },
    roleInFacility: {
      type: String,
      enum: ['CONSULTANT', 'RESIDENT', 'MEDICAL_OFFICER'],
      default: 'CONSULTANT',
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  },
);

DoctorAffiliationSchema.index({ doctorUserId: 1, facilityId: 1 }, { unique: true });
DoctorAffiliationSchema.index({ facilityId: 1, status: 1 });

export const DoctorAffiliation = model<IDoctorAffiliation>(
  'DoctorAffiliation',
  DoctorAffiliationSchema,
);
