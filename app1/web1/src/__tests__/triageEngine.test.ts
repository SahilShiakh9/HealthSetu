import { describe, it, expect } from 'vitest';
import { TriageEngine } from '../engine/triageEngine.js';
import triageRulesData from '../rules/triage.json';

describe('Triage Engine', () => {
  const engine = new TriageEngine(triageRulesData as any);

  it('calculates valid posteriors that sum to 1.0', () => {
    const posteriors = engine.calculatePosteriors({
      fever: 'yes',
      cough: 'yes',
      breathing_difficulty: 'no',
    });

    const sum = Object.values(posteriors).reduce((acc, p) => acc + p, 0);
    expect(sum).toBeCloseTo(1.0, 4);

    // Each probability should be between 0 and 1
    for (const prob of Object.values(posteriors)) {
      expect(prob).toBeGreaterThanOrEqual(0);
      expect(prob).toBeLessThanOrEqual(1);
    }
  });

  it('selects next most informative question via Information Gain', () => {
    const step = engine.evaluateStep(
      { fever: 'yes' },
      ['fever'],
      'moderate',
      false,
    );

    // If confidence is not yet reached, nextQuestionId should be suggested
    if (!step.shouldStop) {
      expect(step.nextQuestionId).not.toBeNull();
      expect(typeof step.nextQuestionId).toBe('string');
    }
    expect(step.topConditions.length).toBeGreaterThan(0);
  });

  it('stops when max questions limit is reached', () => {
    const asked = ['fever', 'cough', 'sore_throat', 'runny_nose', 'headache', 'body_pain', 'fatigue', 'vomiting'];
    const step = engine.evaluateStep(
      {
        fever: 'yes',
        cough: 'yes',
        sore_throat: 'no',
        runny_nose: 'no',
        headache: 'no',
        body_pain: 'no',
        fatigue: 'no',
        vomiting: 'no',
      },
      asked,
      'mild',
      false,
    );

    expect(step.shouldStop).toBe(true);
    expect(['MAX_QUESTIONS', 'CONFIDENCE_REACHED']).toContain(step.stopReason);
  });

  it('escalates risk tier to HIGH when emergency is indicated', () => {
    const step = engine.evaluateStep(
      { chest_pain: 'yes' },
      ['chest_pain'],
      'mild',
      true, // isEmergency
    );

    expect(step.riskTier).toBe('HIGH');
  });

  it('escalates risk tier by one level when severity is severe', () => {
    // For a cold (normally LOW base risk)
    const step = engine.evaluateStep(
      { runny_nose: 'yes', sore_throat: 'yes' },
      ['runny_nose', 'sore_throat'],
      'severe', // severe user self-rating
      false,
    );

    // Escalated from LOW to at least MEDIUM
    expect(['MEDIUM', 'HIGH']).toContain(step.riskTier);
  });

  it('includes mandatory review status and draft metadata in config', () => {
    expect(triageRulesData.reviewStatus).toBe('draft');
    expect(triageRulesData.needsClinicalReview).toBe(true);
  });
});
