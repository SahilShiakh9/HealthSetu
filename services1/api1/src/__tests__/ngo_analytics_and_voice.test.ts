import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { voiceScreeningService } from '../services/voiceScreening.service.js';
import { ngoAnalyticsService } from '../services/ngoAnalytics.service.js';
import { Screening } from '../models/Screening.js';
import { User } from '../models/User.js';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('VoiceScreeningService Emergency Precedence & Multilingual Rules', () => {
  it('detects emergency warning signs in Marathi independently of LLM', () => {
    const text = 'मला दोन दिवसांपासून ताप आहे आणि आज छातीत दुखणे सुरू झाले';
    const result = voiceScreeningService.evaluateEmergencySigns(text, 'mr');
    expect(result.isEmergency).toBe(true);
    expect(result.flags).toContain('Chest Pain / Angina');
  });

  it('detects severe breathing difficulty in Hindi independently of LLM', () => {
    const text = 'मरीज को सांस लेने में तकलीफ हो रही है और चक्कर आ रहे हैं';
    const result = voiceScreeningService.evaluateEmergencySigns(text, 'hi');
    expect(result.isEmergency).toBe(true);
    expect(result.flags).toContain('Severe Breathing Difficulty');
  });

  it('detects stroke and paralysis warning signs in English', () => {
    const text = 'Patient has slurred speech and sudden face drooping';
    const result = voiceScreeningService.evaluateEmergencySigns(text, 'en');
    expect(result.isEmergency).toBe(true);
    expect(result.flags).toContain('Stroke / Paralysis Signs');
  });

  it('emergency rules take strict precedence over dialogue questioning', async () => {
    const response = await voiceScreeningService.handleDialogue({
      text: 'Severe chest tightness and cannot breathe',
      language: 'en',
      currentSymptoms: [],
      answeredQuestions: {},
      questionHistory: [],
    });

    expect(response.isEmergency).toBe(true);
    expect(response.riskTier).toBe('HIGH');
    expect(response.recommendedSpecialty).toBe('Emergency Medicine');
    expect(response.followUpQuestion).toBeNull();
    expect(response.isFinished).toBe(true);
  });

  it('asks ONE relevant follow-up question for non-emergency symptoms', async () => {
    const response = await voiceScreeningService.handleDialogue({
      text: 'I have had a mild cough for two days',
      language: 'en',
      currentSymptoms: [],
      answeredQuestions: {},
      questionHistory: [],
    });

    expect(response.isEmergency).toBe(false);
    expect(response.isFinished).toBe(false);
    expect(response.followUpQuestion).toBeDefined();
    expect(response.followUpQuestion?.symptomId).toBe('cough');
  });
});

describe('NgoAnalyticsService Aggregation & DPDP k-Anonymity', () => {
  it('correctly aggregates screening KPIs, languages, and input methods', async () => {
    const testUserId = new mongoose.Types.ObjectId();
    const testPatientId = new mongoose.Types.ObjectId();

    // Seed 4 screenings in 'DIST-PUNE-RURAL'
    await Screening.create([
      {
        clientId: 'test-scr-1',
        patientId: testPatientId,
        submittedBy: testUserId,
        language: 'mr',
        symptoms: ['cough'],
        riskTier: 'LOW',
        isEmergency: false,
        district: 'DIST-PUNE-RURAL',
        inputMethod: 'voice',
        status: 'completed',
        clientCreatedAt: Date.now(),
      },
      {
        clientId: 'test-scr-2',
        patientId: testPatientId,
        submittedBy: testUserId,
        language: 'hi',
        symptoms: ['fever'],
        riskTier: 'MEDIUM',
        isEmergency: false,
        district: 'DIST-PUNE-RURAL',
        inputMethod: 'text',
        status: 'completed',
        clientCreatedAt: Date.now(),
      },
      {
        clientId: 'test-scr-3',
        patientId: testPatientId,
        submittedBy: testUserId,
        language: 'en',
        symptoms: ['chest_pain'],
        riskTier: 'HIGH',
        isEmergency: true,
        district: 'DIST-PUNE-RURAL',
        inputMethod: 'voice',
        status: 'completed',
        clientCreatedAt: Date.now(),
      },
      {
        clientId: 'test-scr-4',
        patientId: testPatientId,
        submittedBy: testUserId,
        language: 'mr',
        symptoms: ['headache'],
        riskTier: 'LOW',
        isEmergency: false,
        district: 'DIST-PUNE-RURAL',
        inputMethod: 'voice',
        status: 'completed',
        clientCreatedAt: Date.now(),
      },
      // 1 screening in a different district
      {
        clientId: 'test-scr-isolated',
        patientId: testPatientId,
        submittedBy: testUserId,
        language: 'mr',
        symptoms: ['fever'],
        riskTier: 'LOW',
        isEmergency: false,
        district: 'DIST-NASHIK-RURAL',
        inputMethod: 'text',
        status: 'completed',
        clientCreatedAt: Date.now(),
      },
    ]);

    // 1. Unscoped / Admin query
    const allMetrics = await ngoAnalyticsService.getOverviewMetrics({
      timeRange: 'last30days',
    });

    expect(allMetrics.totalScreenings).toBeGreaterThanOrEqual(5);
    expect(allMetrics.riskDistribution.high).toBeGreaterThanOrEqual(1);
    expect(allMetrics.inputMethodDistribution.voice).toBeGreaterThanOrEqual(3);
    expect(allMetrics.languageDistribution.mr).toBeGreaterThanOrEqual(3);

    // 2. Check k-anonymity: DIST-NASHIK-RURAL has only 1 case (< 3), so it must be masked
    const nashikCohort = allMetrics.regionalDistribution.find((r) => r.region.includes('DIST-NASHIK-RURAL'));
    if (nashikCohort) {
      expect(nashikCohort.isMasked).toBe(true);
      expect(nashikCohort.region).toContain('(Masked <3 cases)');
    }

    // 3. Scoped query for NGO observer in DIST-PUNE-RURAL
    const scopedMetrics = await ngoAnalyticsService.getOverviewMetrics(
      { timeRange: 'last30days' },
      'DIST-PUNE-RURAL'
    );

    expect(scopedMetrics.totalScreenings).toBe(4);
    // Should NOT include DIST-NASHIK-RURAL
    const hasNashik = scopedMetrics.regionalDistribution.some((r) => r.region.includes('DIST-NASHIK-RURAL'));
    expect(hasNashik).toBe(false);

    // 4. Privacy-safe activity feed contains pseudonymized IDs (e.g., SCR-....)
    const activities = await ngoAnalyticsService.getRecentActivity(
      { timeRange: 'last30days' },
      'DIST-PUNE-RURAL'
    );
    expect(activities.length).toBe(4);
    for (const act of activities) {
      expect(act.sessionRef).toMatch(/^SCR-[A-Z0-9]{4}$/);
      expect((act as any).patientId).toBeUndefined();
      expect((act as any).name).toBeUndefined();
    }
  });
});
