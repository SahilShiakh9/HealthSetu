import { z } from 'zod';
import {
  LanguageEnum,
  RiskTierEnum,
  ScreeningSourceEnum,
  AnswerValueEnum,
  DurationUnitEnum,
  SeverityLevelEnum,
  SyndromeEnum,
} from '../enums.js';

export const AnswerItemSchema = z.object({
  questionId: z.string(),
  symptomId: z.string(),
  value: AnswerValueEnum,
  at: z.number().int(),
});
export type AnswerItem = z.infer<typeof AnswerItemSchema>;

export const ConditionProbabilitySchema = z.object({
  name: z.string(),
  probability: z.number().min(0).max(1),
});
export type ConditionProbability = z.infer<typeof ConditionProbabilitySchema>;

export const ScreeningEngineTypeEnum = z.enum(['rules', 'naive-bayes', 'ml']);
export type ScreeningEngineType = z.infer<typeof ScreeningEngineTypeEnum>;

export const ScreeningEngineSchema = z.object({
  type: ScreeningEngineTypeEnum,
  version: z.string(),
  source: z.string(),
});
export type ScreeningEngine = z.infer<typeof ScreeningEngineSchema>;

export const CreateScreeningSchema = z.object({
  clientId: z.string().uuid(),
  language: LanguageEnum,
  symptoms: z.array(z.string()),
  answers: z.array(AnswerItemSchema).default([]),
  duration: z
    .object({
      value: z.number().positive(),
      unit: DurationUnitEnum,
    })
    .optional(),
  severity: SeverityLevelEnum.default('unknown'),
  emergencyFlags: z.array(z.string()).default([]),
  riskTier: RiskTierEnum,
  isEmergency: z.boolean().default(false),
  possibleConditions: z.array(ConditionProbabilitySchema).default([]),
  symptomGroups: z.array(SyndromeEnum).default([]),
  recommendedSpecialty: z.string().default('General Physician'),
  source: ScreeningSourceEnum.default('device'),
  modelVersion: z.string().default('1.0.0-rules'),
  triageConfigVersion: z.string().default('1.0.0'),
  engine: ScreeningEngineSchema.optional(),
  imageIds: z.array(z.string()).default([]),
  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
      accuracyM: z.number().optional(),
    })
    .optional(),
  villageCode: z.string().optional(),
  inputMethod: z.enum(['voice', 'text']).default('text'),
  voiceTranscript: z.string().optional(),
  candidateCategory: z.string().optional(),
  referralStatus: z.enum(['none', 'pending', 'referred', 'completed']).default('none'),
  status: z.enum(['started', 'in_progress', 'completed', 'interrupted', 'draft']).default('completed'),
  district: z.string().optional(),
  block: z.string().optional(),
  isOfflineSync: z.boolean().default(false),
  clientCreatedAt: z.number().int(),
});
export type CreateScreeningInput = z.infer<typeof CreateScreeningSchema>;

export const ScreeningResponseSchema = CreateScreeningSchema.extend({
  id: z.string(),
  patientId: z.string(),
  submittedBy: z.string(),
  receivedAt: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ScreeningResponse = z.infer<typeof ScreeningResponseSchema>;

export const OnlineAssistRequestSchema = z.object({
  symptoms: z.array(z.string()),
  answers: z.array(AnswerItemSchema).optional(),
  ageBand: z.string().optional(),
  gender: z.string().optional(),
});
export type OnlineAssistRequest = z.infer<typeof OnlineAssistRequestSchema>;

export const OnlineAssistResponseSchema = z.object({
  topConditions: z.array(ConditionProbabilitySchema),
  riskTier: RiskTierEnum,
  recommendedSpecialty: z.string(),
  confidence: z.number().min(0).max(1),
  modelVersion: z.string(),
  source: ScreeningSourceEnum,
});
export type OnlineAssistResponse = z.infer<typeof OnlineAssistResponseSchema>;

export const CandidateScreeningRequestSchema = z.object({
  text: z.string().min(1),
  language: z.string().default('en'),
});
export type CandidateScreeningRequest = z.infer<typeof CandidateScreeningRequestSchema>;

export const CandidateScreeningResponseSchema = z.object({
  status: z.string(),
  possible_category: z.string().nullable(),
  matched_signs: z.array(z.string()),
  message: z.string(),
  risk_tier: RiskTierEnum,
  recommended_specialty: z.string(),
  model_version: z.string(),
  is_clinical_diagnosis: z.boolean().default(false),
  disclaimer: z.string(),
});
export type CandidateScreeningResponse = z.infer<typeof CandidateScreeningResponseSchema>;

export const VoiceDialogueRequestSchema = z.object({
  sessionId: z.string().optional(),
  text: z.string().min(1),
  language: LanguageEnum.default('en'),
  answerContext: z
    .object({
      questionId: z.string(),
      symptomId: z.string(),
      value: z.enum(['yes', 'no', 'unknown']),
    })
    .optional(),
  currentSymptoms: z.array(z.string()).optional().default([]),
  negatedSymptoms: z.array(z.string()).optional().default([]),
  answeredQuestions: z.record(z.string(), z.enum(['yes', 'no', 'unknown'])).optional().default({}),
  questionHistory: z.array(z.string()).optional().default([]),
  patientName: z.string().optional(),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        text: z.string(),
      })
    )
    .optional()
    .default([]),
});
export type VoiceDialogueRequest = z.input<typeof VoiceDialogueRequestSchema>;

export const VoiceDialogueResponseSchema = z.object({
  sessionId: z.string().optional(),
  isEmergency: z.boolean(),
  emergencyFlags: z.array(z.string()),
  extractedSymptoms: z.array(z.string()),
  negatedSymptoms: z.array(z.string()).default([]),
  patientName: z.string().optional(),
  intent: z
    .enum([
      'greeting_or_intro',
      'symptom_report',
      'answering_question',
      'correction_or_negation',
      'general_query',
      'unclear_or_unrelated',
      'ready_for_assessment',
      'emergency',
    ])
    .default('symptom_report'),
  followUpQuestion: z
    .object({
      questionId: z.string(),
      symptomId: z.string(),
      text: z.string(),
    })
    .nullable(),
  isFinished: z.boolean(),
  candidateCategory: z.string().nullable(),
  riskTier: RiskTierEnum,
  recommendedSpecialty: z.string(),
  guidanceText: z.string(),
  modelVersion: z.string(),
});
export type VoiceDialogueResponse = z.infer<typeof VoiceDialogueResponseSchema>;
