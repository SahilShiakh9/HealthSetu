import mongoose, { Document, Schema } from 'mongoose';
import type { FacilityType } from '@healthsetu/contracts';

export interface IFacility extends Document {
  facilityId: string;
  name: string;
  type: FacilityType;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  villageCode?: string;
  districtCode: string;
  services: string[];
  servicesMask: number;
  open24x7: boolean;
  openHours: string;
  phone: string;
  address?: string;
  sourceAttribution?: string;
  osmId?: string;
  capacityPerDay?: number;
  currentLoad?: number;
  emergencyCapable: boolean;
  dataSource: 'MOCK_DEMO' | 'MANUAL_VERIFIED' | 'ABDM_HFR' | 'OPEN_STREET_MAP' | 'GEOAPIFY';
  verifiedAt?: Date;
  isMock: boolean;
  organizationStatus: 'PENDING_APPROVAL' | 'APPROVED' | 'SUSPENDED';
  adminUserIds: mongoose.Types.ObjectId[];
  verificationDocumentUrl?: string;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  updatedAtTimestamp: number;
  createdAt: Date;
  updatedAt: Date;
}

const FacilitySchema = new Schema<IFacility>(
  {
    facilityId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['SC', 'PHC', 'CHC', 'SDH', 'DH', 'PRIVATE', 'CLINIC', 'PHARMACY'],
      index: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [lng, lat]
        required: true,
      },
    },
    villageCode: {
      type: String,
      index: true,
    },
    districtCode: {
      type: String,
      required: true,
      index: true,
    },
    services: {
      type: [String],
      default: [],
    },
    servicesMask: {
      type: Number,
      default: 0,
    },
    open24x7: {
      type: Boolean,
      default: false,
    },
    openHours: {
      type: String,
      default: '8:00 AM - 4:00 PM',
    },
    phone: {
      type: String,
      default: '',
    },
    address: {
      type: String,
      default: '',
    },
    sourceAttribution: {
      type: String,
      default: '© OpenStreetMap contributors',
    },
    osmId: {
      type: String,
      sparse: true,
      index: true,
    },
    capacityPerDay: {
      type: Number,
    },
    currentLoad: {
      type: Number,
    },
    emergencyCapable: {
      type: Boolean,
      default: false,
      index: true,
    },
    dataSource: {
      type: String,
      enum: ['MOCK_DEMO', 'MANUAL_VERIFIED', 'ABDM_HFR', 'OPEN_STREET_MAP', 'GEOAPIFY'],
      default: 'MOCK_DEMO',
      index: true,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    isMock: {
      type: Boolean,
      default: true,
    },
    organizationStatus: {
      type: String,
      enum: ['PENDING_APPROVAL', 'APPROVED', 'SUSPENDED'],
      default: 'APPROVED',
      index: true,
    },
    adminUserIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    verificationDocumentUrl: {
      type: String,
      default: null,
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
    updatedAtTimestamp: {
      type: Number,
      default: () => Date.now(),
    },
  },
  {
    timestamps: true,
  },
);

// 2dsphere geospatial index for spatial queries
FacilitySchema.index({ location: '2dsphere' });

export const FacilityModel = mongoose.model<IFacility>('Facility', FacilitySchema);
export const Facility = FacilityModel;
