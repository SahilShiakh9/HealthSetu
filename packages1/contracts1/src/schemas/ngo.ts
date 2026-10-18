import { z } from 'zod';
import { RiskTierEnum, LanguageEnum } from '../enums.js';

export const NgoAnalyticsFilterSchema = z.object({
  timeRange: z.enum(['today', 'last7days', 'last30days', 'custom']).default('last7days'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  district: z.string().optional(),
  language: LanguageEnum.optional(),
  riskTier: RiskTierEnum.optional(),
  inputMethod: z.enum(['voice', 'text']).optional(),
  status: z.enum(['started', 'in_progress', 'completed', 'interrupted']).optional(),
});
export type NgoAnalyticsFilter = z.infer<typeof NgoAnalyticsFilterSchema>;

export const RegionalCohortSchema = z.object({
  region: z.string(),
  screeningsCount: z.number().int().min(0),
  highRiskCount: z.number().int().min(0),
  isMasked: z.boolean(), // true if k < 3 to prevent patient re-identification
});
export type RegionalCohort = z.infer<typeof RegionalCohortSchema>;

export const DailyTrendItemSchema = z.object({
  date: z.string(),
  total: z.number().int().min(0),
  highRisk: z.number().int().min(0),
  mediumRisk: z.number().int().min(0),
  lowRisk: z.number().int().min(0),
  emergencyFlags: z.number().int().min(0),
});
export type DailyTrendItem = z.infer<typeof DailyTrendItemSchema>;

export const NgoOverviewMetricsSchema = z.object({
  totalScreenings: z.number().int().min(0),
  startedToday: z.number().int().min(0),
  completedToday: z.number().int().min(0),
  inProgress: z.number().int().min(0),
  interrupted: z.number().int().min(0),
  highPriorityFlags: z.number().int().min(0),
  awaitingReferral: z.number().int().min(0),
  syncedVsPendingOffline: z.object({
    synced: z.number().int().min(0),
    pendingOffline: z.number().int().min(0),
  }),
  riskDistribution: z.object({
    low: z.number().int().min(0),
    medium: z.number().int().min(0),
    high: z.number().int().min(0),
  }),
  languageDistribution: z.record(z.string(), z.number().int().min(0)),
  inputMethodDistribution: z.object({
    voice: z.number().int().min(0),
    text: z.number().int().min(0),
  }),
  dailyTrends: z.array(DailyTrendItemSchema),
  regionalDistribution: z.array(RegionalCohortSchema),
  lastUpdated: z.string(),
});
export type NgoOverviewMetrics = z.infer<typeof NgoOverviewMetricsSchema>;

export const NgoActivityEventTypeEnum = z.enum([
  'screening.started',
  'screening.progress_updated',
  'screening.completed',
  'screening.urgent_flagged',
  'screening.referral_created',
  'screening.synced',
]);
export type NgoActivityEventType = z.infer<typeof NgoActivityEventTypeEnum>;

export const NgoActivityEventSchema = z.object({
  id: z.string(),
  type: NgoActivityEventTypeEnum,
  sessionRef: z.string(), // Pseudonymized, e.g. "SCR-4A19", zero PII
  timestamp: z.number().int(),
  riskTier: RiskTierEnum.optional(),
  language: LanguageEnum.optional(),
  inputMethod: z.enum(['voice', 'text']).optional(),
  district: z.string().optional(),
  summary: z.string(),
});
export type NgoActivityEvent = z.infer<typeof NgoActivityEventSchema>;
