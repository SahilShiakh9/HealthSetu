import { z } from 'zod';
import { LanguageEnum } from '../enums.js';

export const GuidanceTopicCategorySchema = z.enum([
  'MATERNAL_CHILD',
  'FIRST_AID',
  'INFECTIOUS_DISEASES',
  'HYGIENE_NUTRITION',
  'EMERGENCY_SIGNS',
]);
export type GuidanceTopicCategory = z.infer<typeof GuidanceTopicCategorySchema>;

export const GuidanceStepSchema = z.object({
  step: z.number().int().positive(),
  text: z.object({
    en: z.string(),
    hi: z.string(),
    mr: z.string(),
  }),
});
export type GuidanceStep = z.infer<typeof GuidanceStepSchema>;

export const GuidanceTopicSchema = z.object({
  id: z.string(),
  category: GuidanceTopicCategorySchema,
  title: z.object({
    en: z.string(),
    hi: z.string(),
    mr: z.string(),
  }),
  keywords: z.array(z.string()),
  summary: z.object({
    en: z.string(),
    hi: z.string(),
    mr: z.string(),
  }),
  keySteps: z.array(GuidanceStepSchema),
  emergencyWarning: z
    .object({
      en: z.string(),
      hi: z.string(),
      mr: z.string(),
    })
    .optional(),
  dos: z.array(z.object({ en: z.string(), hi: z.string(), mr: z.string() })).optional(),
  donts: z.array(z.object({ en: z.string(), hi: z.string(), mr: z.string() })).optional(),
});
export type GuidanceTopic = z.infer<typeof GuidanceTopicSchema>;

export const GuidanceQueryRequestSchema = z.object({
  query: z.string().min(1),
  language: LanguageEnum.optional().default('en'),
});
export type GuidanceQueryRequest = z.infer<typeof GuidanceQueryRequestSchema>;

export const GuidanceQueryResponseSchema = z.object({
  results: z.array(GuidanceTopicSchema),
  disclaimer: z.string(),
});
export type GuidanceQueryResponse = z.infer<typeof GuidanceQueryResponseSchema>;

export const SpeechRecognitionResultSchema = z.object({
  transcript: z.string(),
  confidence: z.number(),
  isFinal: z.boolean(),
  isMock: z.boolean().optional(),
});
export type SpeechRecognitionResult = z.infer<typeof SpeechRecognitionResultSchema>;

export const CompressedImageMetadataSchema = z.object({
  blobId: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  originalSizeBytes: z.number(),
  compressedSizeBytes: z.number(),
  width: z.number(),
  height: z.number(),
});
export type CompressedImageMetadata = z.infer<typeof CompressedImageMetadataSchema>;
