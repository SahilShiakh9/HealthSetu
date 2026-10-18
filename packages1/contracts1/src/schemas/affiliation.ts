import { z } from 'zod';
import { AffiliationStatusEnum, AffiliationRoleEnum } from '../enums.js';

export const RequestAffiliationSchema = z.object({
  facilityId: z.string().min(1, 'Facility ID is required'),
  roleInFacility: AffiliationRoleEnum.default('CONSULTANT'),
  notes: z.string().max(500).optional(),
});
export type RequestAffiliationInput = z.infer<typeof RequestAffiliationSchema>;

export const InviteDoctorSchema = z.object({
  facilityId: z.string().min(1, 'Facility ID is required'),
  doctorId: z.string().optional(),
  doctorEmail: z.string().email().optional(),
  roleInFacility: AffiliationRoleEnum.default('CONSULTANT'),
  notes: z.string().max(500).optional(),
}).refine((data) => data.doctorId || data.doctorEmail, {
  message: 'Either doctorId or doctorEmail must be provided',
});
export type InviteDoctorInput = z.infer<typeof InviteDoctorSchema>;

export const UpdateAffiliationStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'REJECTED', 'REVOKED']),
  notes: z.string().max(500).optional(),
});
export type UpdateAffiliationStatusInput = z.infer<typeof UpdateAffiliationStatusSchema>;

export const DoctorAffiliationSummarySchema = z.object({
  id: z.string(),
  doctorId: z.string(),
  doctorName: z.string().optional(),
  doctorEmail: z.string().optional(),
  doctorPhone: z.string().optional(),
  specialties: z.array(z.string()).optional(),
  facilityId: z.string(),
  facilityName: z.string().optional(),
  facilityType: z.string().optional(),
  status: AffiliationStatusEnum,
  roleInFacility: AffiliationRoleEnum,
  approvedAt: z.string().optional(),
  createdAt: z.string(),
});
export type DoctorAffiliationSummary = z.infer<typeof DoctorAffiliationSummarySchema>;
