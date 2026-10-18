import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import crypto from 'crypto';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Doctor } from '../models/Doctor.js';
import { Patient } from '../models/Patient.js';
import { Consultation } from '../models/Consultation.js';
import { Encounter } from '../models/Encounter.js';
import { Report } from '../models/Report.js';
import { createAccessToken } from '../services/auth.service.js';
import { runInTransaction } from '../utils/transaction.js';

describe('Phase 4 Data Relationships, ObjectId Validation, and Service Authorization Suite', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let patientAToken: string;
  let patientAUser: any;
  let patientBToken: string;
  let patientBUser: any;
  let doctorAToken: string;
  let doctorAUser: any;
  let doctorBToken: string;
  let doctorBUser: any;
  let adminToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDb(mongoServer.getUri());

    // 1. Patient A
    patientAUser = await User.create({
      role: 'PATIENT',
      name: 'Sunita Gaikwad',
      phone: '9811111111',
      language: 'mr',
    });
    const patientASid = crypto.randomUUID();
    await Session.create({
      userId: patientAUser._id,
      sid: patientASid,
      refreshFamilyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    patientAToken = await createAccessToken(patientAUser, patientASid);

    // 2. Patient B
    patientBUser = await User.create({
      role: 'PATIENT',
      name: 'Santosh Kadam',
      phone: '9822222222',
      language: 'hi',
    });
    const patientBSid = crypto.randomUUID();
    await Session.create({
      userId: patientBUser._id,
      sid: patientBSid,
      refreshFamilyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    patientBToken = await createAccessToken(patientBUser, patientBSid);

    // 3. Doctor A
    doctorAUser = await User.create({
      role: 'DOCTOR',
      name: 'Dr. Priya Deshmukh',
      phone: '9833333333',
      language: 'en',
    });
    await Doctor.create({
      userId: doctorAUser._id,
      specialties: ['General Physician'],
      registrationNumber: 'MMC/2021/89412',
      qualification: 'MBBS, MD',
      availability: 'AVAILABLE',
      verificationStatus: 'APPROVED',
      districtCode: 'PUNE',
    });
    const doctorASid = crypto.randomUUID();
    await Session.create({
      userId: doctorAUser._id,
      sid: doctorASid,
      refreshFamilyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    doctorAToken = await createAccessToken(doctorAUser, doctorASid);

    // 4. Doctor B
    doctorBUser = await User.create({
      role: 'DOCTOR',
      name: 'Dr. Vikram Rathi',
      phone: '9844444444',
      language: 'en',
    });
    await Doctor.create({
      userId: doctorBUser._id,
      specialties: ['Pediatrics'],
      registrationNumber: 'MMC/2019/33211',
      qualification: 'MBBS, DCH',
      availability: 'AVAILABLE',
      verificationStatus: 'APPROVED',
      districtCode: 'PUNE',
    });
    const doctorBSid = crypto.randomUUID();
    await Session.create({
      userId: doctorBUser._id,
      sid: doctorBSid,
      refreshFamilyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    doctorBToken = await createAccessToken(doctorBUser, doctorBSid);

    // 5. Admin
    const adminUser = await User.create({
      role: 'ADMIN',
      name: 'System Admin',
      phone: '9855555555',
      language: 'en',
    });
    const adminSid = crypto.randomUUID();
    await Session.create({
      userId: adminUser._id,
      sid: adminSid,
      refreshFamilyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    adminToken = await createAccessToken(adminUser, adminSid);
  }, 60000);

  afterAll(async () => {
    await disconnectDb();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  describe('1. ObjectId Validation across protected routes', () => {
    it('rejects malformed consultation ID with a clean 400', async () => {
      const res = await request(app)
        .get('/api/v1/consultations/not-a-valid-object-id')
        .set('Authorization', `Bearer ${patientAToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_OBJECT_ID');
    });

    it('rejects malformed screening ID with a clean 400', async () => {
      const res = await request(app)
        .get('/api/v1/screenings/malformed_screening_id')
        .set('Authorization', `Bearer ${patientAToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_OBJECT_ID');
    });

    it('rejects malformed consultation queue check with 400', async () => {
      const res = await request(app)
        .get('/api/v1/consultations/queue/123-bad-id')
        .set('Authorization', `Bearer ${patientAToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_OBJECT_ID');
    });

    it('rejects malformed consultation complete ID with 400', async () => {
      const res = await request(app)
        .post('/api/v1/consultations/invalid-id/complete')
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({
          outcomeType: 'PRESCRIPTION',
          assessment: 'Stable',
          diagnosisLabel: 'Healthy',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_OBJECT_ID');
    });
  });

  describe('2. Consultation Completion and Immutable Encounter/Report Creation', () => {
    let consultationId: string;
    let reportId: string;

    it('requests and accepts consultation for Patient A', async () => {
      const reqRes = await request(app)
        .post('/api/v1/consultations/request')
        .set('Authorization', `Bearer ${patientAToken}`)
        .send({
          idempotencyKey: crypto.randomUUID(),
          screeningId: '000000000000000000000001',
          requiredSpecialty: 'General Physician',
        });

      expect(reqRes.status).toBe(201);
      consultationId = reqRes.body.consultation._id;

      // Doctor A accepts consultation
      const acceptRes = await request(app)
        .post(`/api/v1/consultations/${consultationId}/accept`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({});

      expect(acceptRes.status).toBe(200);
    });

    it('completes consultation and generates persisted Encounter and Report referencing real patient and doctor', async () => {
      const completeRes = await request(app)
        .post(`/api/v1/consultations/${consultationId}/complete`)
        .set('Authorization', `Bearer ${doctorAToken}`)
        .send({
          outcomeType: 'PRESCRIPTION',
          assessment: 'Confirmed allergic rhinitis with mild pharyngitis.',
          diagnosisLabel: 'Allergic Rhinitis (J30.9)',
          medications: [
            {
              name: 'Levocetirizine 5mg',
              dosage: '1 tablet',
              frequency: 'Once daily at bedtime',
              durationDays: 5,
              instructions: 'Take after dinner',
            },
            {
              name: 'Saline Nasal Spray',
              dosage: '2 sprays per nostril',
              frequency: 'TDS (Three times daily)',
              durationDays: 7,
              instructions: 'Before meals',
            },
          ],
          tests: ['Absolute Eosinophil Count (AEC) if no improvement'],
          notes: 'Avoid dust exposure and cold drinks. Follow up if symptoms worsen.',
          followUpDate: '2026-10-20',
        });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.consultation.status).toBe('COMPLETED');
      expect(completeRes.body.encounter).toBeDefined();
      expect(completeRes.body.report).toBeDefined();

      const encounter = completeRes.body.encounter;
      const report = completeRes.body.report;

      expect(encounter.status).toBe('FINAL');
      expect(encounter.version).toBe(1);
      expect(encounter.diagnosisLabel).toBe('Allergic Rhinitis (J30.9)');
      expect(encounter.medications.length).toBe(2);

      // Report references real patient and real doctor
      expect(report.patientName).toBe('Sunita Gaikwad');
      expect(report.doctorName).toBe('Dr. Priya Deshmukh');
      expect(report.doctorRegistration).toBe('MMC/2021/89412');
      expect(report.diagnosis).toBe('Allergic Rhinitis (J30.9)');
      expect(report.medications.length).toBe(2);

      reportId = report._id;
    });

    it('persists Encounter and Report in the database matching the consultation', async () => {
      const persistedEncounter = await Encounter.findOne({ consultationId });
      expect(persistedEncounter).not.toBeNull();
      expect(persistedEncounter!.status).toBe('FINAL');
      expect(persistedEncounter!.patientId.toString()).toBe(patientAUser._id.toString());
      expect(persistedEncounter!.doctorId.toString()).toBe(doctorAUser._id.toString());

      const persistedReport = await Report.findOne({ consultationId });
      expect(persistedReport).not.toBeNull();
      expect(persistedReport!.reportNumber).toMatch(/^REP-\d{4}-[A-F0-9]{8}$/);
      expect(persistedReport!.patientName).toBe('Sunita Gaikwad');
    });

    describe('3. Service-Layer Authorization for Medical Reports', () => {
      it('allows Patient A (owner) to read their own report', async () => {
        const res = await request(app)
          .get(`/api/v1/reports/${reportId}`)
          .set('Authorization', `Bearer ${patientAToken}`);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('success');
        expect(res.body.report.patientName).toBe('Sunita Gaikwad');
        expect(res.body.report.diagnosis).toBe('Allergic Rhinitis (J30.9)');
      });

      it('allows Doctor A (authoring clinician) to read the report', async () => {
        const res = await request(app)
          .get(`/api/v1/reports/${reportId}`)
          .set('Authorization', `Bearer ${doctorAToken}`);

        expect(res.status).toBe(200);
        expect(res.body.report.doctorName).toBe('Dr. Priya Deshmukh');
      });

      it('prevents Patient B from reading Patient A report and returns 404', async () => {
        const res = await request(app)
          .get(`/api/v1/reports/${reportId}`)
          .set('Authorization', `Bearer ${patientBToken}`);

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
      });

      it('prevents Doctor B (unassigned doctor) from reading Patient A report and returns 404', async () => {
        const res = await request(app)
          .get(`/api/v1/reports/${reportId}`)
          .set('Authorization', `Bearer ${doctorBToken}`);

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
      });

      it('allows Admin to read report for audit compliance', async () => {
        const res = await request(app)
          .get(`/api/v1/reports/${reportId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.report.patientName).toBe('Sunita Gaikwad');
      });

      it('lists reports scoped to the authenticated user', async () => {
        const patientAList = await request(app)
          .get('/api/v1/reports')
          .set('Authorization', `Bearer ${patientAToken}`);

        expect(patientAList.status).toBe(200);
        expect(patientAList.body.total).toBe(1);

        const patientBList = await request(app)
          .get('/api/v1/reports')
          .set('Authorization', `Bearer ${patientBToken}`);

        expect(patientBList.status).toBe(200);
        expect(patientBList.body.total).toBe(0);
      });
    });

    describe('4. Service-Layer Authorization for Consultations', () => {
      it('allows Patient A to read their consultation record', async () => {
        const res = await request(app)
          .get(`/api/v1/consultations/${consultationId}`)
          .set('Authorization', `Bearer ${patientAToken}`);

        expect(res.status).toBe(200);
        expect(res.body.consultation._id).toBe(consultationId);
      });

      it('allows Doctor A to read the consultation session', async () => {
        const res = await request(app)
          .get(`/api/v1/consultations/${consultationId}`)
          .set('Authorization', `Bearer ${doctorAToken}`);

        expect(res.status).toBe(200);
        expect(res.body.consultation._id).toBe(consultationId);
      });

      it('prevents Patient B from accessing Patient A consultation with 404', async () => {
        const res = await request(app)
          .get(`/api/v1/consultations/${consultationId}`)
          .set('Authorization', `Bearer ${patientBToken}`);

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
      });

      it('prevents Doctor B from accessing completed consultation of Doctor A with 404', async () => {
        const res = await request(app)
          .get(`/api/v1/consultations/${consultationId}`)
          .set('Authorization', `Bearer ${doctorBToken}`);

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
      });
    });

    describe('5. Service-Layer Authorization for Screenings', () => {
      let screeningId: string;
      const screeningClientId = 'a0000000-0000-4000-8000-000000000099';

      it('creates screening for Patient A and stores it', async () => {
        const res = await request(app)
          .post('/api/v1/screenings')
          .set('Authorization', `Bearer ${patientAToken}`)
          .send({
            clientId: screeningClientId,
            language: 'mr',
            symptoms: ['Fever', 'Dry Cough'],
            riskTier: 'LOW',
            source: 'device',
            clientCreatedAt: Date.now(),
          });

        expect(res.status).toBe(201);
        screeningId = res.body.screening.id;
      });

      it('allows Patient A to read their screening', async () => {
        const res = await request(app)
          .get(`/api/v1/screenings/${screeningId}`)
          .set('Authorization', `Bearer ${patientAToken}`);

        expect(res.status).toBe(200);
        expect(res.body.screening.symptoms).toContain('Fever');
      });

      it('allows Patient A to read screening by UUID clientId', async () => {
        const res = await request(app)
          .get(`/api/v1/screenings/${screeningClientId}`)
          .set('Authorization', `Bearer ${patientAToken}`);

        expect(res.status).toBe(200);
        expect(res.body.screening.clientId).toBe(screeningClientId);
      });

      it('prevents Patient B from reading Patient A screening and returns 404', async () => {
        const res = await request(app)
          .get(`/api/v1/screenings/${screeningId}`)
          .set('Authorization', `Bearer ${patientBToken}`);

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('NOT_FOUND');
      });

      it('scopes GET /screenings so Patient B does not see Patient A records', async () => {
        const res = await request(app)
          .get('/api/v1/screenings')
          .set('Authorization', `Bearer ${patientBToken}`);

        expect(res.status).toBe(200);
        expect(res.body.total).toBe(0);
      });
    });

    describe('6. Transaction Fallback Resilience', () => {
      it('executes runInTransaction successfully in standalone or replica-set environment', async () => {
        let executionHappened = false;
        const result = await runInTransaction(async (_session) => {
          executionHappened = true;
          return { success: true };
        });

        expect(executionHappened).toBe(true);
        expect(result.success).toBe(true);
      });
    });
  });
});
