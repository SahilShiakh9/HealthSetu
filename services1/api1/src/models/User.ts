import { Schema, model, type Document } from 'mongoose';
import type { Role, Language } from '@healthsetu/contracts';

export interface IUser extends Document {
  role: Role;
  name: string;
  phone?: string;
  email?: string;
  passwordHash?: string;
  language: Language;
  facilityId?: string;
  facilityIds?: string[];
  districtCode?: string;
  villageCode?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    role: {
      type: String,
      enum: ['PATIENT', 'ASHA', 'DOCTOR', 'PHC_OFFICER', 'ADMIN', 'HOSPITAL_ADMIN', 'GOVT_OFFICER', 'NGO_OBSERVER'],
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      sparse: true,
      unique: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      sparse: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      default: null,
    },
    language: {
      type: String,
      enum: ['en', 'hi', 'mr'],
      default: 'en',
    },
    facilityId: {
      type: String,
      index: true,
      sparse: true,
    },
    facilityIds: {
      type: [String],
      default: [],
    },
    districtCode: {
      type: String,
      index: true,
      sparse: true,
    },
    villageCode: {
      type: String,
      index: true,
      sparse: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export const User = model<IUser>('User', UserSchema);
