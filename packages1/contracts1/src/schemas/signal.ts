import { z } from 'zod';
import {
  AgeBandEnum,
  GenderEnum,
  RiskTierEnum,
  SyndromeEnum,
  AlertSeverityEnum,
  AlertStatusEnum,
} from '../enums.js';

export const HealthSignalEventSchema = z.object({
  areaCode: z.string(), // villageCode
  phcId: z.string(),
  districtCode: z.string(),
  syndrome: SyndromeEnum,
  riskTier: RiskTierEnum,
  ageBand: AgeBandEnum,
  gender: GenderEnum,
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  createdAt: z.number().int(),
});
export type HealthSignalEvent = z.infer<typeof HealthSignalEventSchema>;

export const HealthAggregateItemSchema = z.object({
  day: z.string(),
  areaCode: z.string(),
  phcId: z.string(),
  districtCode: z.string(),
  syndrome: SyndromeEnum,
  riskTier: RiskTierEnum,
  ageBand: AgeBandEnum,
  count: z.union([z.number(), z.literal('<3')]),
});
export type HealthAggregateItem = z.infer<typeof HealthAggregateItemSchema>;

export const EpidemicAlertSchema = z.object({
  id: z.string(),
  areaCode: z.string(),
  phcId: z.string(),
  districtCode: z.string(),
  syndrome: SyndromeEnum,
  day: z.string(),
  observedCount: z.number(),
  baselineMean: z.number(),
  zScore: z.number(),
  severity: AlertSeverityEnum,
  status: AlertStatusEnum,
  acknowledgedBy: z.string().optional(),
  message: z.string(),
  insufficientBaseline: z.boolean().default(false),
  createdAt: z.string(),
  workflowStage: z.enum(['DETECTED', 'UNDER_REVIEW', 'INVESTIGATION', 'ACTION_REQUIRED', 'RESOLVED']).optional(),
  investigationNotes: z.string().optional(),
  assignedTo: z.string().optional(),
  actionPlan: z.string().optional(),
  dueDate: z.string().optional(),
  resolvedReason: z.string().optional(),
  resolvedBy: z.string().optional(),
  resolvedAt: z.string().optional(),
});
export type EpidemicAlert = z.infer<typeof EpidemicAlertSchema>;

export const PhcSummaryResponseSchema = z.object({
  totalScreenings: z.union([z.number(), z.literal('<3')]),
  highRiskCases: z.union([z.number(), z.literal('<3')]),
  feverCases: z.union([z.number(), z.literal('<3')]),
  respiratoryCases: z.union([z.number(), z.literal('<3')]),
  totalScreeningsChangePct: z.number().optional(),
  highRiskChangePct: z.number().optional(),
  feverChangePct: z.number().optional(),
  respiratoryChangePct: z.number().optional(),
  isDemoData: z.boolean().default(false),
  dataAgeSeconds: z.number(),
});
export type PhcSummaryResponse = z.infer<typeof PhcSummaryResponseSchema>;
