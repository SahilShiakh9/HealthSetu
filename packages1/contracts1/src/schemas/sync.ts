import { z } from 'zod';
import { OutboxEventTypeEnum, OutboxStatusEnum } from '../enums.js';

export const OutboxEventSchema = z.object({
  eventId: z.string().uuid(),
  type: OutboxEventTypeEnum,
  payload: z.unknown(),
  ownerUserId: z.string().optional(),
  createdAt: z.number().int(),
  attempts: z.number().int().default(0),
  nextAttemptAt: z.number().int().default(0),
  status: OutboxStatusEnum.default('pending'),
});
export type OutboxEvent = z.infer<typeof OutboxEventSchema>;

export const SyncPushRequestSchema = z.object({
  events: z.array(OutboxEventSchema),
});
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;

export const SyncItemResultSchema = z.object({
  eventId: z.string().uuid(),
  status: z.enum(['applied', 'duplicate', 'rejected']),
  serverId: z.string().optional(),
  error: z.string().optional(),
});
export type SyncItemResult = z.infer<typeof SyncItemResultSchema>;

export const SyncPushResponseSchema = z.object({
  results: z.array(SyncItemResultSchema),
});
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;

export const SyncManifestResponseSchema = z.object({
  triageConfigVersion: z.string(),
  triageConfigEtag: z.string(),
  facilitiesVersion: z.string(),
  facilitiesEtag: z.string(),
  guidanceVersion: z.string(),
  guidanceEtag: z.string(),
  serverTime: z.number().int(),
});
export type SyncManifestResponse = z.infer<typeof SyncManifestResponseSchema>;
