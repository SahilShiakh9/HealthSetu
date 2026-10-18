import { describe, it, expect } from 'vitest';
import { symptomNormalizer } from '../engine/symptomNormalizer.js';

describe('Symptom Normalizer', () => {
  it('cleans and normalizes text to NFC lowercased alphanumeric', () => {
    const raw = '  Fever, Chills! & High-Temp??  ';
    const cleaned = symptomNormalizer.cleanText(raw);
    expect(cleaned).toBe('fever chills high temp');
  });

  it('matches exact symptom terms in English', () => {
    const matches = symptomNormalizer.normalizeText('cough', 'en');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].symptomId).toBe('cough');
    expect(matches[0].confidence).toBe(1.0);
    expect(matches[0].needsConfirmation).toBe(false);
  });

  it('matches synonyms in Hindi', () => {
    const matches = symptomNormalizer.normalizeText('बुखार', 'hi');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].symptomId).toBe('fever');
    expect(matches[0].confidence).toBe(1.0);
  });

  it('matches synonyms in Marathi', () => {
    const matches = symptomNormalizer.normalizeText('ताप', 'mr');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].symptomId).toBe('fever');
  });

  it('matches fuzzy terms with Fuse.js and flags confidence', () => {
    const matches = symptomNormalizer.normalizeText('cuffing', 'en');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].symptomId).toBe('cough');
  });
});
