import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { User } from '../models/User.js';
import { Doctor } from '../models/Doctor.js';
import { Consultation } from '../models/Consultation.js';
import { Screening } from '../models/Screening.js';
import { createAccessToken } from '../services/auth.service.js';

let mongoServer: MongoMemoryServer;
let app: any;
let patientUser: any;
let patientToken: string;
let doctorUser: any;
let doctorToken: string;

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
  await Consultation.deleteMany({});
  await Doctor.deleteMany({});
  await User.deleteMany({});
  await Screening.deleteMany({});

  patientUser = await User.create({
    phone: '+919876543210',
    role: 'PATIENT',
    name: 'Savitri Devi',
    language: 'hi',
  });
  patientToken = await createAccessToken(patientUser);

  doctorUser = await User.create({
    phone: '+919876543211',
    role: 'DOCTOR',
    name: 'Dr. Rahul Sharma',
    language: 'hi',
  });
  doctorToken = await createAccessToken(doctorUser);

  await Doctor.create({
    userId: doctorUser._id,
    specialties: ['General Physician', 'Pulmonology'],
    languages: ['en', 'hi', 'mr'],
    registrationNumber: 'MCI-123456',
    qualification: 'MD Medicine',
    experienceYears: 8,
    verificationStatus: 'APPROVED',
    availability: 'AVAILABLE',
    rollingAvgConsultMinutes: 6,
    isMock: true,
  });
});

describe('Teleconsultation & Doctor Queue API', () => {
  it('previews matching doctors and wait times via POST /api/v1/consultations/preview', async () => {
    const res = await request(app)
      .post('/api/v1/consultations/preview')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        screeningId: '000000000000000000000001',
        requiredSpecialty: 'General Physician',
        preferredLanguage: 'hi',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.recommendedAction).toBe('CONSULT_NOW');
    expect(res.body.doctors.length).toBeGreaterThan(0);
    expect(res.body.doctors[0].name).toBe('Dr. Rahul Sharma');
    expect(res.body.doctors[0].score).toBeGreaterThan(50);
  });

  it('enqueues consultation request idempotently via POST /api/v1/consultations/request', async () => {
    const idempotencyKey = 'c0000000-0000-4000-8000-000000000001';
    const payload = {
      idempotencyKey,
      screeningId: '000000000000000000000001',
      preferredLanguage: 'hi',
      requiredSpecialty: 'General Physician',
    };

    const res1 = await request(app)
      .post('/api/v1/consultations/request')
      .set('Authorization', `Bearer ${patientToken}`)
      .send(payload);

    expect(res1.status).toBe(201);
    expect(res1.body.consultation.status).toBe('QUEUED');
    expect(res1.body.consultation.positionInQueue).toBe(1);

    // Second request with same idempotencyKey returns existing without error
    const res2 = await request(app)
      .post('/api/v1/consultations/request')
      .set('Authorization', `Bearer ${patientToken}`)
      .send(payload);

    expect(res2.status).toBe(201);
    expect(res2.body.consultation.idempotencyKey).toBe(idempotencyKey);

    const count = await Consultation.countDocuments({ idempotencyKey });
    expect(count).toBe(1);
  });

  it('checks queue status via GET /api/v1/consultations/queue/:id', async () => {
    const reqRes = await request(app)
      .post('/api/v1/consultations/request')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        idempotencyKey: 'c0000000-0000-4000-8000-000000000002',
        screeningId: '000000000000000000000001',
      });

    const consultId = reqRes.body.consultation._id;

    const queueRes = await request(app)
      .get(`/api/v1/consultations/queue/${consultId}`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(queueRes.status).toBe(200);
    expect(queueRes.body.positionInQueue).toBeGreaterThanOrEqual(1);
    expect(queueRes.body.estimatedWaitMinutes).toBeGreaterThan(0);
  });

  it('allows doctor to accept consultation and issues Zego RTC tokens', async () => {
    const reqRes = await request(app)
      .post('/api/v1/consultations/request')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        idempotencyKey: 'c0000000-0000-4000-8000-000000000003',
        screeningId: '000000000000000000000001',
      });

    const consultId = reqRes.body.consultation._id;

    // Doctor accepts
    const acceptRes = await request(app)
      .post(`/api/v1/consultations/${consultId}/accept`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({});

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.consultation.status).toBe('IN_PROGRESS');
    expect(acceptRes.body.zegoToken).toBeDefined();

    // Patient fetches room token
    const patientRoomRes = await request(app)
      .get(`/api/v1/consultations/${consultId}`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(patientRoomRes.status).toBe(200);
    expect(patientRoomRes.body.zego.token).toBeDefined();
    expect(patientRoomRes.body.zego.isMock).toBeDefined();
  });

  it('switches call mode when network degrades via PATCH /api/v1/consultations/:id/mode', async () => {
    const reqRes = await request(app)
      .post('/api/v1/consultations/request')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        idempotencyKey: 'c0000000-0000-4000-8000-000000000004',
        screeningId: '000000000000000000000001',
      });

    const consultId = reqRes.body.consultation._id;

    const modeRes = await request(app)
      .patch(`/api/v1/consultations/${consultId}/mode`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        mode: 'AUDIO',
        reason: 'Network bandwidth below 150kbps',
      });

    expect(modeRes.status).toBe(200);
    expect(modeRes.body.callMode).toBe('AUDIO');
  });

  it('completes consultation with full clinical prescription and outcome', async () => {
    const reqRes = await request(app)
      .post('/api/v1/consultations/request')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        idempotencyKey: 'c0000000-0000-4000-8000-000000000005',
        screeningId: '000000000000000000000001',
      });

    const consultId = reqRes.body.consultation._id;

    await request(app)
      .post(`/api/v1/consultations/${consultId}/accept`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({});

    const completeRes = await request(app)
      .post(`/api/v1/consultations/${consultId}/complete`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        outcomeType: 'PRESCRIPTION',
        assessment: 'Acute Viral Bronchitis with mild productive cough.',
        diagnosisLabel: 'Acute Bronchitis',
        medications: [
          {
            name: 'Paracetamol 500mg',
            dosage: '1 tab',
            frequency: 'TDS (Three times a day)',
            durationDays: 3,
            instructions: 'Take after meals if fever persists',
          },
          {
            name: 'Ambroxol Syrup',
            dosage: '10ml',
            frequency: 'BD (Twice a day)',
            durationDays: 5,
            instructions: 'Warm water gargles advised',
          },
        ],
        notes: 'Rest, hydrate, and return if breathing difficulty develops.',
      });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.consultation.status).toBe('COMPLETED');
    expect(completeRes.body.consultation.outcome.diagnosisLabel).toBe('Acute Bronchitis');
    expect(completeRes.body.consultation.outcome.medications.length).toBe(2);
  });
});
