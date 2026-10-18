import { Schema, model, type Document, Types } from 'mongoose';
import type { Role } from '@healthsetu/contracts';

export interface IStaffAssignment extends Document {
  userId: Types.ObjectId;
  role: Role;
  facilityIds: string[];
  districtCode?: string;
  active: boolean;
  assignedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StaffAssignmentSchema = new Schema<IStaffAssignment>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      required: true,
      index: true,
    },
    facilityIds: {
      type: [String],
      required: true,
      default: [],
    },
    districtCode: {
      type: String,
      index: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

StaffAssignmentSchema.index({ userId: 1, active: 1 });
StaffAssignmentSchema.index({ facilityIds: 1, active: 1 });

export const StaffAssignment = model<IStaffAssignment>('StaffAssignment', StaffAssignmentSchema);
