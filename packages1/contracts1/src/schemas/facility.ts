import { z } from 'zod';
import { FacilityTypeEnum, RiskTierEnum, SyndromeEnum } from '../enums.js';

export const GeoPointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number(), z.number()]), // [lng, lat]
});
export type GeoPoint = z.infer<typeof GeoPointSchema>;

export const FacilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: FacilityTypeEnum,
  location: GeoPointSchema,
  villageCode: z.string().optional(),
  districtCode: z.string(),
  services: z.array(z.string()),
  servicesMask: z.number().int(),
  open24x7: z.boolean(),
  openHours: z.string().default('8:00 AM - 4:00 PM'),
  phone: z.string().default(''),
  address: z.string().optional(),
  sourceAttribution: z.string().optional(),
  osmId: z.string().optional(),
  capacityPerDay: z.number().optional(),
  currentLoad: z.number().optional(),
  emergencyCapable: z.boolean(),
  dataSource: z.enum(['MOCK_DEMO', 'MANUAL_VERIFIED', 'ABDM_HFR', 'OPEN_STREET_MAP', 'GEOAPIFY']).optional().default('MOCK_DEMO'),
  sources: z.array(z.string()).optional(),
  verifiedAt: z.string().optional(),
  isMock: z.boolean().default(true),
  updatedAt: z.number().int(),
});
export type Facility = z.infer<typeof FacilitySchema>;

export const PublicFacilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: FacilityTypeEnum,
  location: GeoPointSchema,
  villageCode: z.string().optional(),
  districtCode: z.string(),
  services: z.array(z.string()),
  servicesMask: z.number().int().optional(),
  open24x7: z.boolean(),
  openHours: z.string().default('8:00 AM - 4:00 PM'),
  phone: z.string().default(''),
  address: z.string().optional(),
  sourceAttribution: z.string().optional(),
  osmId: z.string().optional(),
  emergencyCapable: z.boolean(),
  dataSource: z.enum(['MOCK_DEMO', 'MANUAL_VERIFIED', 'ABDM_HFR', 'OPEN_STREET_MAP', 'GEOAPIFY']).optional().default('MOCK_DEMO'),
  sources: z.array(z.string()).optional(),
  verifiedAt: z.string().optional(),
  isMock: z.boolean().default(true),
  updatedAt: z.number().int(),
});
export type PublicFacility = z.infer<typeof PublicFacilitySchema>;

export const NearbyFacilitiesQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  riskTier: RiskTierEnum.optional(),
  syndrome: SyndromeEnum.optional(),
  maxRadiusKm: z.coerce.number().default(50),
  strategy: z.enum(['mongodb', 'geoapify', 'overpass', 'hybrid']).optional(),
});
export type NearbyFacilitiesQuery = z.infer<typeof NearbyFacilitiesQuerySchema>;

export const RankedFacilitySchema = z.object({
  facility: z.union([FacilitySchema, PublicFacilitySchema]),
  distanceKm: z.number(),
  approxTravelTimeMinutes: z.number(),
  score: z.number(),
  isEmergencyMatch: z.boolean(),
  notes: z.string().optional(),
  bearingDeg: z.number().optional(),
  breakdown: z
    .object({
      proximity: z.number(),
      tierFit: z.number(),
      load: z.number(),
      serviceFit: z.number(),
    })
    .optional(),
});
export type RankedFacility = z.infer<typeof RankedFacilitySchema>;

