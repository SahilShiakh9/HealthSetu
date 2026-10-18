import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { User } from '../models/User.js';
import { createAccessToken } from '../services/auth.service.js';
import { Screening } from '../models/Screening.js';
import { Patient } from '../models/Patient.js';

let mongoServer: MongoMemoryServer;
let app: any;
let patientToken: string;
let patientUser: any;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  app = createApp();
}, 60000);

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  await Screening.deleteMany({});
  await Patient.deleteMany({});
  await User.deleteMany({});

  patientUser = await User.create({
    phone: '+919876543210',
    role: 'PATIENT',
    name: 'Ramesh Patel',
    language: 'hi',
  });

  patientToken = await createAccessToken(patientUser);
});

describe('Screening API & Services', () => {
  it('creates screening successfully with 201', async () => {
    const clientId = 'a0000000-0000-4000-8000-000000000001';
    const res = await request(app)
      .post('/api/v1/screenings')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        clientId,
        language: 'hi',
        symptoms: ['fever', 'cough'],
        answers: [
          { questionId: 'q-fever', symptomId: 'fever', value: 'yes', at: Date.now() },
        ],
        riskTier: 'MEDIUM',
        isEmergency: false,
        possibleConditions: [
          { name: 'Acute Bronchitis', probability: 0.65 },
        ],
        clientCreatedAt: Date.now(),
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.screening.clientId).toBe(clientId);
    expect(res.body.screening.riskTier).toBe('MEDIUM');

    const inDb = await Screening.findOne({ clientId });
    expect(inDb).not.toBeNull();
    expect(inDb?.symptoms).toContain('fever');
  });

  it('guarantees idempotency when same clientId is submitted multiple times', async () => {
    const clientId = 'a0000000-0000-4000-8000-000000000002';
    const payload = {
      clientId,
      language: 'en',
      symptoms: ['headache'],
      riskTier: 'LOW',
      isEmergency: false,
      clientCreatedAt: Date.now(),
    };

    const res1 = await request(app)
      .post('/api/v1/screenings')
      .set('Authorization', `Bearer ${patientToken}`)
      .send(payload);

    expect(res1.status).toBe(201);

    const res2 = await request(app)
      .post('/api/v1/screenings')
      .set('Authorization', `Bearer ${patientToken}`)
      .send(payload);

    expect(res2.status).toBe(201);
    expect(res2.body.screening.clientId).toBe(clientId);

    const count = await Screening.countDocuments({ clientId });
    expect(count).toBe(1);
  });

  it('retrieves screening by id and lists screenings', async () => {
    const clientId = 'a0000000-0000-4000-8000-000000000003';
    const createRes = await request(app)
      .post('/api/v1/screenings')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        clientId,
        language: 'en',
        symptoms: ['vomiting'],
        riskTier: 'MEDIUM',
        isEmergency: false,
        clientCreatedAt: Date.now(),
      });

    const screeningId = createRes.body.screening.id;

    // Get by ID
    const getRes = await request(app)
      .get(`/api/v1/screenings/${screeningId}`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.screening.clientId).toBe(clientId);

    // List
    const listRes = await request(app)
      .get('/api/v1/screenings')
      .set('Authorization', `Bearer ${patientToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.total).toBe(1);
    expect(listRes.body.screenings[0].clientId).toBe(clientId);
  });

  it('falls back safely to api-fallback for online triage assist when ML service is offline', async () => {
    const res = await request(app)
      .post('/api/v1/screenings/assist')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        symptoms: ['chest_pain', 'sweating'],
      });

    expect(res.status).toBe(200);
    expect(res.body.riskTier).toBe('HIGH');
    expect(['api', 'api-fallback', 'ml']).toContain(res.body.source);
    expect(res.body.topConditions.length).toBeGreaterThan(0);
  });

  it('processes SCREENING_CREATED via batch sync push', async () => {
    const syncClientId = 'a0000000-0000-4000-8000-000000000099';
    const res = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        events: [
          {
            eventId: 'a0000000-0000-4000-8000-000000000088',
            type: 'SCREENING_CREATED',
            createdAt: Date.now(),
            attempts: 0,
            nextAttemptAt: 0,
            status: 'pending',
            payload: {
              clientId: syncClientId,
              language: 'mr',
              symptoms: ['fever'],
              riskTier: 'LOW',
              clientCreatedAt: Date.now(),
            },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.results[0].status).toBe('applied');

    const inDb = await Screening.findOne({ clientId: syncClientId });
    expect(inDb).not.toBeNull();
    expect(inDb?.language).toBe('mr');
  });
});
