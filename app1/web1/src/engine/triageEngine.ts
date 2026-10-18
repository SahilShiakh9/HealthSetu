import type { RiskTier, Syndrome, Language } from '@healthsetu/contracts';

export interface TriageConfig {
  version: string;
  reviewStatus: string;
  diseases: string[];
  priors: Record<string, number>;
  likelihoods: Record<string, Record<string, number>>;
  diseaseMeta: Record<
    string,
    { syndrome: Syndrome; specialty: string; baseRisk: RiskTier }
  >;
  questions: Record<
    string,
    { text: Record<Language, string>; audio?: Record<Language, string> }
  >;
  config: {
    maxQuestions: number;
    stopConfidence: number;
    minInfoGain: number;
  };
}

export interface PosteriorResult {
  disease: string;
  probability: number;
  syndrome: Syndrome;
  specialty: string;
  baseRisk: RiskTier;
}

export interface TriageStepResult {
  nextQuestionId: string | null;
  shouldStop: boolean;
  stopReason?: 'CONFIDENCE_REACHED' | 'MAX_QUESTIONS' | 'LOW_INFO_GAIN' | 'NO_MORE_QUESTIONS';
  topConditions: PosteriorResult[];
  confidence: number;
  syndromes: Syndrome[];
  recommendedSpecialty: string;
  riskTier: RiskTier;
  isUncertain: boolean;
}

export class TriageEngine {
  constructor(private config: TriageConfig) {}

  public calculatePosteriors(
    symptoms: Record<string, 'yes' | 'no' | 'unknown'>,
  ): Record<string, number> {
    const logPosteriors: Record<string, number> = {};
    const epsilon = 1e-6;

    for (const disease of this.config.diseases) {
      const prior = Math.max(this.config.priors[disease] || epsilon, epsilon);
      let logProb = Math.log(prior);

      const dLikelihoods = this.config.likelihoods[disease] || {};

      for (const [symptomId, answer] of Object.entries(symptoms)) {
        if (answer === 'unknown') continue;

        // Laplace smoothed probability
        const pSymGivenD = Math.min(Math.max(dLikelihoods[symptomId] ?? 0.05, 0.01), 0.99);

        if (answer === 'yes') {
          logProb += Math.log(pSymGivenD);
        } else if (answer === 'no') {
          logProb += Math.log(1 - pSymGivenD);
        }
      }

      logPosteriors[disease] = logProb;
    }

    // Normalise in log-space using log-sum-exp
    const maxLog = Math.max(...Object.values(logPosteriors));
    let sumExp = 0;
    for (const disease of this.config.diseases) {
      sumExp += Math.exp(logPosteriors[disease] - maxLog);
    }
    const logSumExp = maxLog + Math.log(sumExp);

    const posteriors: Record<string, number> = {};
    for (const disease of this.config.diseases) {
      posteriors[disease] = Math.exp(logPosteriors[disease] - logSumExp);
    }

    return posteriors;
  }

  public calculateEntropy(probs: Record<string, number>): number {
    let entropy = 0;
    for (const p of Object.values(probs)) {
      if (p > 1e-9) {
        entropy -= p * Math.log2(p);
      }
    }
    return entropy;
  }

  public evaluateStep(
    answeredSymptoms: Record<string, 'yes' | 'no' | 'unknown'>,
    askedQuestionIds: string[],
    severity?: string,
    isEmergency: boolean = false,
  ): TriageStepResult {
    const posteriors = this.calculatePosteriors(answeredSymptoms);
    const sortedDiseases = Object.entries(posteriors)
      .sort(([, a], [, b]) => b - a)
      .map(([disease, prob]) => {
        const meta = this.config.diseaseMeta[disease] || {
          syndrome: 'other',
          specialty: 'General Physician',
          baseRisk: 'LOW',
        };
        return {
          disease,
          probability: Math.round(prob * 1000) / 1000,
          syndrome: meta.syndrome,
          specialty: meta.specialty,
          baseRisk: (meta.baseRisk || (meta as any).base_risk || 'LOW') as RiskTier,
        };
      });

    const topConditions = sortedDiseases.slice(0, 3);
    const topProb = topConditions[0]?.probability || 0;
    const confidence = topProb;

    // Check stopping conditions
    if (confidence >= this.config.config.stopConfidence) {
      return this.formatResult(
        null,
        true,
        'CONFIDENCE_REACHED',
        topConditions,
        confidence,
        severity,
        isEmergency,
      );
    }

    if (askedQuestionIds.length >= this.config.config.maxQuestions) {
      return this.formatResult(
        null,
        true,
        'MAX_QUESTIONS',
        topConditions,
        confidence,
        severity,
        isEmergency,
      );
    }

    // Candidate symptoms to ask next (must be askable and not yet asked)
    const askedSet = new Set(askedQuestionIds);
    const availableSymptoms = Object.keys(this.config.questions).filter(
      (sId) => !askedSet.has(sId) && !answeredSymptoms[sId],
    );

    if (availableSymptoms.length === 0) {
      return this.formatResult(
        null,
        true,
        'NO_MORE_QUESTIONS',
        topConditions,
        confidence,
        severity,
        isEmergency,
      );
    }

    // Calculate Information Gain for each unasked symptom
    const currentEntropy = this.calculateEntropy(posteriors);
    let bestGain = -1;
    let bestSymptom: string | null = null;

    for (const sym of availableSymptoms) {
      // P(sym = yes) = sum_d P(d) * P(sym | d)
      let pYes = 0;
      for (const d of this.config.diseases) {
        const pSymD = this.config.likelihoods[d]?.[sym] ?? 0.05;
        pYes += posteriors[d] * pSymD;
      }
      pYes = Math.max(Math.min(pYes, 0.99), 0.01);
      const pNo = 1 - pYes;

      // Posterior if yes
      const postYes = this.calculatePosteriors({ ...answeredSymptoms, [sym]: 'yes' });
      const hYes = this.calculateEntropy(postYes);

      // Posterior if no
      const postNo = this.calculatePosteriors({ ...answeredSymptoms, [sym]: 'no' });
      const hNo = this.calculateEntropy(postNo);

      const expectedAfterEntropy = pYes * hYes + pNo * hNo;
      const infoGain = currentEntropy - expectedAfterEntropy;

      if (infoGain > bestGain) {
        bestGain = infoGain;
        bestSymptom = sym;
      }
    }

    if (bestGain < this.config.config.minInfoGain || !bestSymptom) {
      return this.formatResult(
        null,
        true,
        'LOW_INFO_GAIN',
        topConditions,
        confidence,
        severity,
        isEmergency,
      );
    }

    return this.formatResult(
      bestSymptom,
      false,
      undefined,
      topConditions,
      confidence,
      severity,
      isEmergency,
    );
  }

  private formatResult(
    nextQuestionId: string | null,
    shouldStop: boolean,
    stopReason: TriageStepResult['stopReason'],
    topConditions: PosteriorResult[],
    confidence: number,
    severity?: string,
    isEmergency: boolean = false,
  ): TriageStepResult {
    // Collect distinct syndromes
    const syndromeSet = new Set<Syndrome>();
    for (const c of topConditions) {
      syndromeSet.add(c.syndrome);
    }
    const syndromes = Array.from(syndromeSet);

    // Primary recommended specialty from top disease
    const recommendedSpecialty = topConditions[0]?.specialty || 'General Physician';

    // Risk tier computation per Section 11.5
    let riskTier: RiskTier = 'LOW';
    if (topConditions.length > 0) {
      const topBaseRisk = topConditions[0].baseRisk;
      riskTier = topBaseRisk;
    }

    // Escalations:
    // 1. Emergency rule match -> HIGH
    if (isEmergency) {
      riskTier = 'HIGH';
    } else {
      // 2. Severe user severity -> escalate one level
      if (severity === 'severe') {
        if (riskTier === 'LOW') riskTier = 'MEDIUM';
        else if (riskTier === 'MEDIUM') riskTier = 'HIGH';
      }

      // 3. Low confidence uncertainty -> at least MEDIUM per Section 11.5
      if (confidence < 0.4) {
        if (riskTier === 'LOW') {
          riskTier = 'MEDIUM';
        }
      }
    }

    return {
      nextQuestionId,
      shouldStop,
      stopReason,
      topConditions,
      confidence,
      syndromes,
      recommendedSpecialty,
      riskTier,
      isUncertain: confidence < 0.4,
    };
  }
}
