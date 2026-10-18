import { describe, it, expect } from 'vitest';
import { evaluateEmergencyRules } from '../engine/emergency.js';

describe('Emergency Rules Engine', () => {
  it('detects no emergency when symptoms are benign', () => {
    const result = evaluateEmergencyRules(
      {
        fever: 'yes',
        cough: 'yes',
        runny_nose: 'yes',
      },
      'mild',
      'en',
    );

    expect(result.isEmergency).toBe(false);
    expect(result.flags).toHaveLength(0);
    expect(result.rules).toHaveLength(0);
  });

  it('triggers emergency immediately on unconsciousness', () => {
    const result = evaluateEmergencyRules(
      {
        loss_of_consciousness: 'yes',
        fever: 'no',
      },
      'severe',
      'en',
    );

    expect(result.isEmergency).toBe(true);
    expect(result.flags).toContain('unconsciousness');
    expect(result.rules[0].message).toContain('Loss of consciousness or fainting detected');
  });

  it('triggers emergency on severe chest pain', () => {
    const result = evaluateEmergencyRules(
      {
        chest_pain: 'yes',
      },
      'severe',
      'hi',
    );

    expect(result.isEmergency).toBe(true);
    expect(result.flags).toContain('severe_chest_pain');
    // Check localized message in Hindi
    expect(result.rules[0].message).toContain('सीने में गंभीर दर्द');
  });

  it('triggers emergency on breathing difficulty with severe rating', () => {
    const result = evaluateEmergencyRules(
      {
        breathing_difficulty: 'yes',
      },
      'severe',
      'mr',
    );

    expect(result.isEmergency).toBe(true);
    expect(result.flags).toContain('severe_breathing_difficulty');
    // Check localized message in Marathi
    expect(result.rules[0].message).toContain('श्वास घेण्यास तीव्र अडचण');
  });

  it('triggers emergency on stroke symptoms', () => {
    const result = evaluateEmergencyRules(
      {
        face_droop: 'yes',
      },
      'moderate',
      'en',
    );

    expect(result.isEmergency).toBe(true);
    expect(result.flags).toContain('stroke_signs');
  });
});
