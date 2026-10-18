import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { createApp } from '../app.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { HealthSignalEvent } from '../models/HealthSignalEvent.js';
import { EpidemicAlert } from '../models/EpidemicAlert.js';
import { intelligenceService } from '../services/intelligence.service.js';
import { createAccessToken } from '../services/auth.service.js';

let mongod: MongoMemoryServer;
let app: any;
let officerToken: string;
let officerId: string;

describe('Phase 6 Health Intelligence Pipeline & Outbreak Detection', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    app = createApp();

    // Create a PHC Officer user assigned to phc-pabal and phc-test
    const officer = await User.create({
      phone: '9876543299',
      name: 'Dr. PHC Surveillance Officer',
      role: 'PHC_OFFICER',
      language: 'en',
      facilityId: 'phc-pabal',
      facilityIds: ['phc-pabal', 'phc-test'],
      districtCode: 'PUNE',
    });
    officerId = officer._id.toString();
    const sid = crypto.randomUUID();
    await Session.create({
      userId: officer._id,
      sid,
      refreshFamilyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    officerToken = await createAccessToken(officer, sid);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await HealthSignalEvent.deleteMany({});
    await EpidemicAlert.deleteMany({});
  });

  it('correctly derives syndrome categories from reported symptoms', () => {
    expect(intelligenceService.deriveSyndrome(['dry cough', 'breathlessness'])).toBe('respiratory');
    expect(intelligenceService.deriveSyndrome(['high fever', 'chills'])).toBe('febrile_illness');
    expect(intelligenceService.deriveSyndrome(['vomiting', 'loose stools'])).toBe('gastrointestinal');
    expect(intelligenceService.deriveSyndrome(['skin rash', 'fever'])).toBe('fever_with_rash');
  });

  it('ingests an anonymized signal with zero patient identifiers (DPDP Act compliance)', async () => {
    await intelligenceService.ingestScreeningSignal({
      symptoms: ['fever', 'chills'],
      riskTier: 'HIGH',
      villageCode: 'VIL-412208',
      phcId: 'phc-pabal',
      createdAt: new Date('2026-10-10T10:00:00Z'),
    });

    const event = await HealthSignalEvent.findOne({ areaCode: 'VIL-412208' });
    expect(event).toBeDefined();
    expect(event?.syndrome).toBe('febrile_illness');
    expect(event?.riskTier).toBe('HIGH');
    expect(event?.day).toBe('2026-10-10');

    // Verify zero PHI is present
    const rawObj = event?.toObject();
    expect(rawObj).not.toHaveProperty('patientId');
    expect(rawObj).not.toHaveProperty('phone');
    expect(rawObj).not.toHaveProperty('name');
  });

  it('generates synthetic outbreak dataset and triggers high severity alert', async () => {
    await intelligenceService.generateSyntheticOutbreak('phc-pabal', 'VIL-412208', 'febrile_illness');

    const total = await HealthSignalEvent.countDocuments({ phcId: 'phc-pabal' });
    expect(total).toBeGreaterThan(15);

    const alerts = await intelligenceService.getAlerts('phc-pabal');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0].severity).toBe('HIGH');
    expect(alerts[0].zScore).toBeGreaterThanOrEqual(3.0);
    expect(alerts[0].syndrome).toBe('febrile_illness');
  });

  it('enforces k-anonymity (k >= 3) by suppressing cells < 3 in summary and aggregates', async () => {
    // Add exactly 2 signals for respiratory in Kendur (should be suppressed as '<3')
    await HealthSignalEvent.create([
      {
        areaCode: 'VIL-412208',
        phcId: 'phc-test',
        districtCode: 'pune',
        syndrome: 'respiratory',
        riskTier: 'LOW',
        ageBand: '21-30',
        gender: 'M',
        day: '2026-10-11',
        createdAt: Date.now(),
      },
      {
        areaCode: 'VIL-412208',
        phcId: 'phc-test',
        districtCode: 'pune',
        syndrome: 'respiratory',
        riskTier: 'LOW',
        ageBand: '21-30',
        gender: 'F',
        day: '2026-10-11',
        createdAt: Date.now(),
      },
    ]);

    const res = await request(app)
      .get('/api/v1/intelligence/aggregates?phcId=phc-test')
      .set('Authorization', `Bearer ${officerToken}`)
      .expect(200);

    expect(res.body.aggregates.length).toBe(1);
    expect(res.body.aggregates[0].count).toBe('<3');
  });

  it('allows PHC officer to acknowledge epidemic alerts via PATCH /api/v1/intelligence/alerts/:id/acknowledge', async () => {
    const alert = await EpidemicAlert.create({
      areaCode: 'VIL-412208',
      phcId: 'phc-pabal',
      districtCode: 'pune',
      syndrome: 'febrile_illness',
      day: '2026-10-11',
      observedCount: 12,
      baselineMean: 2.0,
      zScore: 3.5,
      severity: 'HIGH',
      status: 'OPEN',
      message: 'Sudden spike in fever cases in Kendur',
      insufficientBaseline: false,
      createdAt: new Date(),
    });

    const res = await request(app)
      .patch(`/api/v1/intelligence/alerts/${alert._id}/acknowledge`)
      .set('Authorization', `Bearer ${officerToken}`)
      .expect(200);

    expect(res.body.message).toBe('Alert acknowledged');

    const updated = await EpidemicAlert.findById(alert._id);
    expect(updated?.status).toBe('ACKNOWLEDGED');
  });

  it('returns valid epidemiological summary via GET /api/v1/intelligence/summary', async () => {
    const res = await request(app)
      .get('/api/v1/intelligence/summary?phcId=phc-pabal')
      .set('Authorization', `Bearer ${officerToken}`)
      .expect(200);

    expect(res.body.status).toBe('success');
    expect(res.body.summary).toHaveProperty('totalScreenings');
    expect(res.body.summary).toHaveProperty('highRiskCases');
    expect(res.body.summary).toHaveProperty('feverCases');
    expect(res.body.summary).toHaveProperty('respiratoryCases');
  });
});
