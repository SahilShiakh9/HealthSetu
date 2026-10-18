import { z } from 'zod';
import {
  CallModeEnum,
  ConsultationStatusEnum,
  ConsultationTypeEnum,
  OutcomeTypeEnum,
  QueueStatusEnum,
  CancelledByEnum,
  DoctorAvailabilityEnum,
} from '../enums.js';

export const RequestConsultationSchema = z.object({
  idempotencyKey: z.string().uuid(),
  screeningId: z.string(),
  doctorId: z.string().optional(),
  type: ConsultationTypeEnum.default('NOW'),
  scheduledFor: z.string().datetime().optional(),
  preferredLanguage: z.enum(['en', 'hi', 'mr']).default('hi'),
  requiredSpecialty: z.string().default('General Physician'),
});
export type RequestConsultationInput = z.infer<typeof RequestConsultationSchema>;

export const DoctorScoreBreakdownSchema = z.object({
  specialty: z.number(),
  availability: z.number(),
  queue: z.number(),
  language: z.number(),
  previousDoctor: z.number(),
  location: z.number(),
});
export type DoctorScoreBreakdown = z.infer<typeof DoctorScoreBreakdownSchema>;

export const RankedDoctorPreviewSchema = z.object({
  doctorId: z.string(),
  name: z.string(),
  specialties: z.array(z.string()),
  languages: z.array(z.string()),
  experienceYears: z.number(),
  availability: DoctorAvailabilityEnum,
  queueLength: z.number(),
  estimatedWaitMinutes: z.number(),
  score: z.number(),
  breakdown: DoctorScoreBreakdownSchema,
  qualification: z.string().optional(),
  additionalQualification: z.string().optional(),
  registrationNumber: z.string().optional(),
  medicalCouncil: z.string().optional(),
  facilityName: z.string().optional(),
  bio: z.string().optional(),
});
export type RankedDoctorPreview = z.infer<typeof RankedDoctorPreviewSchema>;

export const MatchingPreviewRequestSchema = z.object({
  screeningId: z.string(),
  requiredSpecialty: z.string().optional(),
  preferredLanguage: z.enum(['en', 'hi', 'mr']).default('hi'),
  villageCode: z.string().optional(),
  districtCode: z.string().optional(),
});
export type MatchingPreviewRequest = z.infer<typeof MatchingPreviewRequestSchema>;

export const MatchingPreviewResponseSchema = z.object({
  recommendedAction: z.enum(['CONSULT_NOW', 'BOOK_LATER']),
  maxWaitLimitMinutes: z.number(),
  doctors: z.array(RankedDoctorPreviewSchema),
});
export type MatchingPreviewResponse = z.infer<typeof MatchingPreviewResponseSchema>;

export const QueueEntrySchema = z.object({
  id: z.string(),
  consultationId: z.string(),
  doctorId: z.string(),
  patientId: z.string(),
  priorityRank: z.number().int().min(0).max(2),
  effectivePriority: z.number().int(),
  sequence: z.number().int(),
  status: QueueStatusEnum,
  positionInQueue: z.number().int(),
  estimatedWaitMinutes: z.number(),
  calledAt: z.number().int().optional(),
  joinedAt: z.number().int(),
  idempotencyKey: z.string(),
});
export type QueueEntry = z.infer<typeof QueueEntrySchema>;

export const ChangeModeSchema = z.object({
  mode: CallModeEnum,
  reason: z.string().optional(),
});
export type ChangeModeInput = z.infer<typeof ChangeModeSchema>;

export const MedicationItemSchema = z.object({
  name: z.string(),
  dosage: z.string(),
  frequency: z.string(),
  durationDays: z.number().positive(),
  instructions: z.string().optional(),
});
export type MedicationItem = z.infer<typeof MedicationItemSchema>;

export const CompleteConsultationSchema = z.object({
  outcomeType: OutcomeTypeEnum,
  assessment: z.string().min(1),
  diagnosisLabel: z.string().min(1),
  medications: z.array(MedicationItemSchema).default([]),
  tests: z.array(z.string()).default([]),
  notes: z.string().optional(),
  followUpDate: z.string().optional(),
  referralFacilityId: z.string().optional(),
});
export type CompleteConsultationInput = z.infer<typeof CompleteConsultationSchema>;

export const SendMessageSchema = z.object({
  clientId: z.string().uuid(),
  kind: z.enum(['TEXT', 'IMAGE', 'VOICE']).default('TEXT'),
  body: z.string().min(1),
  attachmentId: z.string().optional(),
});
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
