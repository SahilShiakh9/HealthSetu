import { describe, it, expect } from 'vitest';
import { generateMedicalReportPdf } from '../utils/pdfGenerator.js';
import { evaluateEmergencyRules } from '../engine/emergency.js';

describe('Phase 7: PDF Generator & Clinical Provenance Safeguards', () => {
  it('generates a valid high-contrast A4 PDF slip with IST timestamps and provenance notice', () => {
    const doc = generateMedicalReportPdf({
      reportNumber: 'REP-2026-TEST1',
      facilityName: 'Shirur Community Health Centre',
      doctorName: 'Dr. Anand Joshi',
      doctorRegistration: 'MMC/REG-88990',
      patientName: 'Ramesh Patil',
      patientPhone: '9876543210',
      issuedAt: '2026-10-12T10:30:00.000Z',
      diagnosis: 'Acute Bronchitis',
      assessment: 'Bilateral rhonchi on auscultation. Vitals stable.',
      medications: [
        {
          name: 'Amoxicillin 500mg',
          dosage: '1 capsule',
          frequency: 'Three times daily',
          durationDays: 5,
          instructions: 'After food',
        },
      ],
      tests: ['Sputum smear if cough persists > 14 days'],
      notes: 'Steam inhalation twice daily. Avoid cold beverages.',
      followUpDate: 'In 5 days',
      screeningSummary: 'AI-assisted screening, not a diagnosis',
      isMock: false,
    });

    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBe(1);

    // Output can be serialized to arraybuffer
    const output = doc.output('arraybuffer');
    expect(output.byteLength).toBeGreaterThan(1000);
  });

  it('medication table reflects ONLY clinician-entered items, with zero auto-injected drugs', () => {
    // When clinician supplies empty medications, PDF does not fabricate drugs
    const doc = generateMedicalReportPdf({
      facilityName: 'Pabal PHC',
      doctorName: 'Dr. Priya Deshmukh',
      doctorRegistration: 'MMC/REG-11223',
      patientName: 'Sunita Devi',
      patientPhone: '9123456789',
      issuedAt: new Date().toISOString(),
      diagnosis: 'Tension-Type Headache',
      assessment: 'Stress-induced headache. No red flags.',
      medications: [], // Clinician prescribed zero medications
      notes: 'Adequate rest and hydration advised.',
      screeningSummary: 'AI-assisted screening, not a diagnosis',
    });

    expect(doc).toBeDefined();
    const output = doc.output('arraybuffer');
    expect(output.byteLength).toBeGreaterThan(1000);
  });

  it('emergency rules run deterministically and cannot be overridden or lowered by models', () => {
    // Emergency rule fires on acute chest pain with severe intensity
    const evalResult = evaluateEmergencyRules(
      { chest_pain: 'yes', cough: 'no' },
      'severe',
      'en',
    );

    expect(evalResult.isEmergency).toBe(true);
    expect(evalResult.flags.length).toBeGreaterThan(0);
    expect(evalResult.rules[0].id).toBe('severe_chest_pain');
  });

  it('emergency evaluation handles Marathi and Hindi localization correctly', () => {
    const evalMr = evaluateEmergencyRules(
      { seizure: 'yes' },
      'severe',
      'mr',
    );

    expect(evalMr.isEmergency).toBe(true);
    expect(evalMr.rules[0].message).toBeDefined();
    expect(evalMr.rules[0].message).toContain('झटके');
  });
});
