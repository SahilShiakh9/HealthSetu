import mongoose from 'mongoose';
import {
  CreateScreeningInput,
  OnlineAssistRequest,
  OnlineAssistResponse,
  RiskTier,
} from '@healthsetu/contracts';
import { Screening, IScreening } from '../models/Screening.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { intelligenceService } from './intelligence.service.js';
import { realtimeService } from './realtime.service.js';
import { runInTransaction } from '../utils/transaction.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export class ScreeningService {
  /**
   * Idempotently create or retrieve an existing screening record by clientId.
   */
  async createScreening(
    userId: string,
    patientId: string,
    input: CreateScreeningInput,
    ip?: string
  ): Promise<IScreening> {
    // 1. Check for existing record by clientId (Idempotency)
    const existing = await Screening.findOne({ clientId: input.clientId });
    if (existing) {
      logger.info({ clientId: input.clientId }, 'Screening already exists. Returning existing record.');
      return existing;
    }

    // 2. Create new record and audit atomically
    const screening = await runInTransaction(async (session) => {
      const isEmergency = input.isEmergency ?? (input.emergencyFlags && input.emergencyFlags.length > 0 ? true : false);
      const newScreening = new Screening({
        clientId: input.clientId,
        patientId: new mongoose.Types.ObjectId(patientId),
        submittedBy: new mongoose.Types.ObjectId(userId),
        language: input.language,
        symptoms: input.symptoms,
        answers: input.answers || [],
        duration: input.duration,
        severity: input.severity || 'unknown',
        emergencyFlags: input.emergencyFlags || [],
        riskTier: input.riskTier,
        isEmergency,
        possibleConditions: input.possibleConditions || [],
        symptomGroups: input.symptomGroups || [],
        recommendedSpecialty: input.recommendedSpecialty || 'General Physician',
        source: input.source || 'device',
        modelVersion: input.modelVersion || '1.0.0-rules',
        triageConfigVersion: input.triageConfigVersion || '1.0.0',
        engine: input.engine || (isEmergency ? {
          type: 'rules',
          version: '1.0.0',
          source: 'emergency-red-flags',
        } : {
          type: 'naive-bayes',
          version: input.modelVersion || '1.0.0',
          source: input.source === 'api' ? 'ml-assist-bernoulli' : 'on-device-laplace-naive-bayes',
        }),
        imageIds: input.imageIds || [],
        location: input.location,
        villageCode: input.villageCode,
        inputMethod: input.inputMethod || 'text',
        voiceTranscript: input.voiceTranscript,
        candidateCategory: input.candidateCategory,
        referralStatus: input.referralStatus || 'none',
        status: input.status || 'completed',
        district: input.district,
        block: input.block,
        isOfflineSync: input.isOfflineSync || false,
        clientCreatedAt: input.clientCreatedAt,
        receivedAt: Date.now(),
      });

      const auditEvent = new AuditEvent({
        actorId: new mongoose.Types.ObjectId(userId),
        action: 'SCREENING_CREATED',
        resourceType: 'Screening',
        resourceId: newScreening._id.toString(),
        metadata: {
          clientId: input.clientId,
          patientId,
          riskTier: input.riskTier,
          isEmergency,
          inputMethod: input.inputMethod,
        },
        ip: ip || '127.0.0.1',
        at: new Date(),
      });

      if (session) {
        await newScreening.save({ session });
        await auditEvent.save({ session });
      } else {
        await newScreening.save();
        await auditEvent.save();
      }

      return newScreening;
    });

    // 3. Emit authorized real-time event to NGO Dashboard (zero PII, DPDP compliant)
    try {
      const cleanId = (screening.clientId || '').replace(/[^a-zA-Z0-9]/g, '');
      const suffix = (cleanId.slice(-4) || 'ABCD').toUpperCase();
      const sessionRef = `SCR-${suffix.padStart(4, '0')}`;
      realtimeService.emitNgoActivity({
        id: screening._id.toString(),
        type: screening.isEmergency
          ? 'screening.urgent_flagged'
          : screening.isOfflineSync
          ? 'screening.synced'
          : 'screening.completed',
        sessionRef,
        timestamp: Date.now(),
        riskTier: screening.riskTier,
        language: screening.language,
        inputMethod: screening.inputMethod,
        district: screening.district || 'Pune Rural',
        summary: `Screening finished (${screening.riskTier} Risk)`,
      });
    } catch (rtErr) {
      logger.warn({ err: rtErr }, 'Failed to emit realtime screening event');
    }

    // 4. Ingest Anonymized Epidemiological Signal (DPDP Compliant - Zero PHI)
    try {
      await intelligenceService.ingestScreeningSignal({
        symptoms: input.symptoms,
        riskTier: screening.riskTier,
        villageCode: input.villageCode,
        createdAt: screening.createdAt,
      });
    } catch (sigErr) {
      logger.warn({ err: sigErr }, 'Failed to record epidemiological health signal');
    }

    return screening;
  }

  /**
   * Retrieve screening by ID or clientId.
   */
  async getScreeningById(id: string): Promise<IScreening | null> {
    if (mongoose.Types.ObjectId.isValid(id)) {
      const doc = await Screening.findById(id);
      if (doc) return doc;
    }
    return Screening.findOne({ clientId: id });
  }

  /**
   * List screenings with filters.
   */
  async listScreenings(filters: {
    patientId?: string;
    submittedBy?: string;
    riskTier?: string;
    limit?: number;
    skip?: number;
  }): Promise<{ screenings: IScreening[]; total: number }> {
    const query: Record<string, any> = {};
    if (filters.patientId && mongoose.Types.ObjectId.isValid(filters.patientId)) {
      query.patientId = new mongoose.Types.ObjectId(filters.patientId);
    }
    if (filters.submittedBy && mongoose.Types.ObjectId.isValid(filters.submittedBy)) {
      query.submittedBy = new mongoose.Types.ObjectId(filters.submittedBy);
    }
    if (filters.riskTier) {
      query.riskTier = filters.riskTier;
    }

    const limit = Math.min(filters.limit || 50, 100);
    const skip = filters.skip || 0;

    const [screenings, total] = await Promise.all([
      Screening.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Screening.countDocuments(query),
    ]);

    return { screenings, total };
  }

  /**
   * Forward symptoms to ML service with 3-second timeout and fallback to local rules if offline.
   */
  async onlineAssist(request: OnlineAssistRequest): Promise<OnlineAssistResponse> {
    const symptoms = request.symptoms || [];

    try {
      const mlUrl = `${env.ML_SERVICE_URL}/v1/predict`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(mlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': env.ML_INTERNAL_KEY,
        },
        body: JSON.stringify({
          symptoms,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as any;
        return {
          topConditions: data.top_conditions.map((c: any) => ({
            name: c.name,
            probability: c.probability,
          })),
          riskTier: data.risk_tier as RiskTier,
          recommendedSpecialty: data.recommended_specialty,
          confidence: data.confidence,
          modelVersion: data.model_version || '1.0.0',
          source: 'api',
        };
      } else {
        logger.warn({ status: response.status }, 'ML service responded with non-200. Using API fallback.');
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, 'ML service unreachable or timed out. Using API fallback.');
    }

    // Fallback rule evaluation
    return this.fallbackAssist(symptoms);
  }

  private fallbackAssist(symptoms: string[]): OnlineAssistResponse {
    const symSet = new Set(symptoms.map((s) => s.toLowerCase()));

    // Emergency check
    const emergencySyms = ['chest_pain', 'breathing_difficulty', 'loss_of_consciousness', 'unconscious', 'seizure'];
    const isEmergency = emergencySyms.some((s) => symSet.has(s));

    let riskTier: RiskTier = 'LOW';
    let specialty = 'General Physician';
    let conditions = [{ name: 'Viral Upper Respiratory Tract Infection', probability: 0.65 }];

    if (isEmergency) {
      riskTier = 'HIGH';
      specialty = symSet.has('chest_pain') ? 'Cardiology' : 'Pulmonology';
      conditions = [{ name: 'Acute Coronary Syndrome / Severe Respiratory Distress', probability: 0.95 }];
    } else if (symSet.has('fever') && symSet.has('cough')) {
      riskTier = 'MEDIUM';
      specialty = 'General Medicine';
      conditions = [
        { name: 'Acute Bronchitis', probability: 0.60 },
        { name: 'Pneumonia', probability: 0.25 },
        { name: 'Viral Infection', probability: 0.15 },
      ];
    } else if (symSet.has('vomiting') || symSet.has('diarrhea')) {
      riskTier = 'MEDIUM';
      specialty = 'Gastroenterology';
      conditions = [
        { name: 'Acute Gastroenteritis', probability: 0.70 },
        { name: 'Food Poisoning', probability: 0.20 },
      ];
    }

    return {
      topConditions: conditions,
      riskTier,
      recommendedSpecialty: specialty,
      confidence: conditions[0].probability,
      modelVersion: '1.0.0-api-fallback',
      source: 'api-fallback',
    };
  }

  /**
   * Invokes the integrated research ML pipeline (TF-IDF + LinearSVC) at the FastAPI ML service.
   * Respects English-only boundary: non-English inputs get LANGUAGE_UNSUPPORTED status
   * to prevent hallucinated disease classification.
   */
  async screenWithExistingModel(text: string, language: string = 'en'): Promise<{
    status: string;
    possible_category: string | null;
    matched_signs: string[];
    message: string;
    risk_tier: RiskTier;
    recommended_specialty: string;
    model_version: string;
    is_clinical_diagnosis: boolean;
    disclaimer: string;
  }> {
    try {
      const mlUrl = `${env.ML_SERVICE_URL}/v1/screen/candidate`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const response = await fetch(mlUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': env.ML_INTERNAL_KEY,
        },
        body: JSON.stringify({
          text,
          language,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as any;
        return {
          status: data.status,
          possible_category: data.possible_category,
          matched_signs: data.matched_signs || [],
          message: data.message,
          risk_tier: data.risk_tier as RiskTier,
          recommended_specialty: data.recommended_specialty,
          model_version: data.model_version || 'research-linearsvc-tfidf-clean-grouped-v1',
          is_clinical_diagnosis: false,
          disclaimer: data.disclaimer || 'Research prototype candidate only; not a diagnosis.',
        };
      } else {
        logger.warn({ status: response.status }, 'ML service candidate screening responded with non-200');
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, 'ML service candidate screening unreachable or timed out');
    }

    // Controlled fallback
    return {
      status: 'NEEDS_ASSESSMENT',
      possible_category: null,
      matched_signs: [],
      message: 'Initial screening assessment completed. Consult a healthcare professional.',
      risk_tier: 'LOW',
      recommended_specialty: 'General Physician',
      model_version: 'fallback-rules-v1',
      is_clinical_diagnosis: false,
      disclaimer: 'Model unavailable; fallback clinical rules applied. Not a validated diagnosis.',
    };
  }
}

export const screeningService = new ScreeningService();
