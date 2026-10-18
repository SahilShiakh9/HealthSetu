import { z } from 'zod';

export const RoleEnum = z.enum([
  'PATIENT',
  'ASHA',
  'DOCTOR',
  'PHC_OFFICER',
  'ADMIN',
  'HOSPITAL_ADMIN',
  'GOVT_OFFICER',
  'NGO_OBSERVER',
]);
export type Role = z.infer<typeof RoleEnum>;

export const OrganizationStatusEnum = z.enum(['PENDING_APPROVAL', 'APPROVED', 'SUSPENDED']);
export type OrganizationStatus = z.infer<typeof OrganizationStatusEnum>;

export const AffiliationStatusEnum = z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'REVOKED']);
export type AffiliationStatus = z.infer<typeof AffiliationStatusEnum>;

export const AffiliationRoleEnum = z.enum(['CONSULTANT', 'RESIDENT', 'MEDICAL_OFFICER']);
export type AffiliationRole = z.infer<typeof AffiliationRoleEnum>;

export const RiskTierEnum = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export type RiskTier = z.infer<typeof RiskTierEnum>;

export const LanguageEnum = z.enum(['en', 'hi', 'mr']);
export type Language = z.infer<typeof LanguageEnum>;

export const SyndromeEnum = z.enum([
  'respiratory',
  'gastrointestinal',
  'febrile_illness',
  'fever_with_rash',
  'neurological',
  'cardiovascular',
  'skin',
  'musculoskeletal',
  'other',
]);
export type Syndrome = z.infer<typeof SyndromeEnum>;

export const DoctorAvailabilityEnum = z.enum(['AVAILABLE', 'BUSY', 'BREAK', 'OFFLINE']);
export type DoctorAvailability = z.infer<typeof DoctorAvailabilityEnum>;

export const DoctorVerificationStatusEnum = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']);
export type DoctorVerificationStatus = z.infer<typeof DoctorVerificationStatusEnum>;

export const CallModeEnum = z.enum(['VIDEO', 'AUDIO', 'CHAT']);
export type CallMode = z.infer<typeof CallModeEnum>;

export const FacilityTypeEnum = z.enum(['SC', 'PHC', 'CHC', 'SDH', 'DH', 'PRIVATE', 'CLINIC', 'PHARMACY']);
export type FacilityType = z.infer<typeof FacilityTypeEnum>;

export const QueueStatusEnum = z.enum(['WAITING', 'CALLED', 'ACTIVE', 'DONE', 'CANCELLED', 'MISSED']);
export type QueueStatus = z.infer<typeof QueueStatusEnum>;

export const ConsultationStatusEnum = z.enum([
  'REQUESTED',
  'QUEUED',
  'READY',
  'IN_PROGRESS',
  'DOCUMENTATION_PENDING',
  'COMPLETED',
  'CANCELLED',
  'MISSED',
  'EXPIRED',
]);
export type ConsultationStatus = z.infer<typeof ConsultationStatusEnum>;

export const ConsultationTypeEnum = z.enum(['NOW', 'SCHEDULED']);
export type ConsultationType = z.infer<typeof ConsultationTypeEnum>;

export const OutcomeTypeEnum = z.enum(['ADVICE', 'PRESCRIPTION', 'FOLLOW_UP', 'REFERRAL']);
export type OutcomeType = z.infer<typeof OutcomeTypeEnum>;

export const CancelledByEnum = z.enum(['PATIENT', 'DOCTOR', 'SYSTEM']);
export type CancelledBy = z.infer<typeof CancelledByEnum>;

export const ConsentPurposeEnum = z.enum([
  'SCREENING_STORAGE',
  'TELECONSULTATION',
  'ANONYMISED_ANALYTICS',
]);
export type ConsentPurpose = z.infer<typeof ConsentPurposeEnum>;

export const UploadKindEnum = z.enum(['IMAGE', 'VOICE', 'DOCUMENT']);
export type UploadKind = z.infer<typeof UploadKindEnum>;

export const AgeBandEnum = z.enum(['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61+']);
export type AgeBand = z.infer<typeof AgeBandEnum>;

export const GenderEnum = z.enum(['M', 'F', 'O', 'U']);
export type Gender = z.infer<typeof GenderEnum>;

export const AlertSeverityEnum = z.enum(['WATCH', 'HIGH']);
export type AlertSeverity = z.infer<typeof AlertSeverityEnum>;

export const AlertStatusEnum = z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']);
export type AlertStatus = z.infer<typeof AlertStatusEnum>;

export const ScreeningSourceEnum = z.enum(['device', 'api', 'api-fallback']);
export type ScreeningSource = z.infer<typeof ScreeningSourceEnum>;

export const AnswerValueEnum = z.enum(['yes', 'no', 'unknown']);
export type AnswerValue = z.infer<typeof AnswerValueEnum>;

export const DurationUnitEnum = z.enum(['hours', 'days', 'weeks']);
export type DurationUnit = z.infer<typeof DurationUnitEnum>;

export const SeverityLevelEnum = z.enum(['mild', 'moderate', 'severe', 'unknown']);
export type SeverityLevel = z.infer<typeof SeverityLevelEnum>;

export const ConnectionQualityEnum = z.enum(['GOOD', 'WEAK', 'VERY_WEAK']);
export type ConnectionQuality = z.infer<typeof ConnectionQualityEnum>;

export const OutboxStatusEnum = z.enum(['pending', 'sending', 'synced', 'failed', 'rejected']);
export type OutboxStatus = z.infer<typeof OutboxStatusEnum>;

export const OutboxEventTypeEnum = z.enum([
  'SCREENING_CREATED',
  'CONSENT_GIVEN',
  'CONSULTATION_REQUESTED',
  'MESSAGE_SENT',
  'PROFILE_UPDATED',
]);
export type OutboxEventType = z.infer<typeof OutboxEventTypeEnum>;
