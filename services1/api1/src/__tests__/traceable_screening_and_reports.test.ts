import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Types } from 'mongoose';
import { createApp } from '../app.js';
import { User } from '../models/User.js';
import { Doctor } from '../models/Doctor.js';
import { Session } from '../models/Session.js';
import { Consultation } from '../models/Consultation.js';
import { Encounter } from '../models/Encounter.js';
import { Report } from '../models/Report.js';
import { Screening } from '../models/Screening.js';
import { createAccessToken } from '../services/auth.service.js';

describe('Phase 7: Traceable Screening & Immutable Clinical Reports', () => {
  let mongod: MongoMemoryServer;
  let app: any;

  let patient1: any;
  let patient2: any;
  let doctor1: any;
  let doctor2: any;

  let patient1Token: string;
  let patient2Token: string;
  let doctor1Token: string;
  let doctor2Token: string;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    app = createApp();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Doctor.deleteMany({});
    await Session.deleteMany({});
    await Consultation.deleteMany({});
    await Encounter.deleteMany({});
    await Report.deleteMany({});
    await Screening.deleteMany({});

    // Create users
    patient1 = await User.create({
      phone: '9100000001',
      role: 'PATIENT',
      name: 'Ramesh Patil',
      language: 'mr',
    });

    patient2 = await User.create({
      phone: '9100000002',
      role: 'PATIENT',
      name: 'Sunita Devi',
      language: 'hi',
    });

    doctor1 = await User.create({
      phone: '9200000001',
      role: 'DOCTOR',
      name: 'Dr. Anand Joshi',
      language: 'en',
    });
    await Doctor.create({
      userId: doctor1._id,
      specialties: ['GENERAL_MEDICINE'],
      languages: ['en', 'hi', 'mr'],
      availability: 'AVAILABLE',
      verificationStatus: 'APPROVED',
      registrationNumber: 'MMC/2026/88990',
    });

    doctor2 = await User.create({
      phone: '9200000002',
      role: 'DOCTOR',
      name: 'Dr. Priya Deshmukh',
      language: 'en',
    });
    await Doctor.create({
      userId: doctor2._id,
      specialties: ['GENERAL_MEDICINE'],
      languages: ['en'],
      availability: 'AVAILABLE',
      verificationStatus: 'APPROVED',
      registrationNumber: 'MMC/2026/11223',
    });

    // Create active sessions & tokens
    const sidP1 = crypto.randomUUID();
    await Session.create({ userId: patient1._id, sid: sidP1, refreshFamilyId: crypto.randomUUID(), createdAt: new Date(), lastSeenAt: new Date() });
    patient1Token = await createAccessToken(patient1, sidP1);

    const sidP2 = crypto.randomUUID();
    await Session.create({ userId: patient2._id, sid: sidP2, refreshFamilyId: crypto.randomUUID(), createdAt: new Date(), lastSeenAt: new Date() });
    patient2Token = await createAccessToken(patient2, sidP2);

    const sidD1 = crypto.randomUUID();
    await Session.create({ userId: doctor1._id, sid: sidD1, refreshFamilyId: crypto.randomUUID(), createdAt: new Date(), lastSeenAt: new Date() });
    doctor1Token = await createAccessToken(doctor1, sidD1);

    const sidD2 = crypto.randomUUID();
    await Session.create({ userId: doctor2._id, sid: sidD2, refreshFamilyId: crypto.randomUUID(), createdAt: new Date(), lastSeenAt: new Date() });
    doctor2Token = await createAccessToken(doctor2, sidD2);
  });

  describe('Screening Provenance & Engine Tracking', () => {
    it('stores explicit engine provenance metadata on screening creation', async () => {
      const clientId = crypto.randomUUID();
      const res = await request(app)
        .post('/api/v1/screenings')
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({
          clientId,
          language: 'mr',
          symptoms: ['fever', 'cough'],
          riskTier: 'LOW',
          engine: {
            type: 'naive-bayes',
            version: '1.0.0',
            source: 'on-device-laplace-naive-bayes',
          },
          clientCreatedAt: Date.now(),
        });

      expect(res.status).toBe(201);
      const stored = await Screening.findOne({ clientId });
      expect(stored).not.toBeNull();
      expect(stored!.engine).toBeDefined();
      expect(stored!.engine!.type).toBe('naive-bayes');
      expect(stored!.engine!.version).toBe('1.0.0');
      expect(stored!.engine!.source).toBe('on-device-laplace-naive-bayes');
    });

    it('emergency screenings automatically record rules engine provenance', async () => {
      const clientId = crypto.randomUUID();
      const res = await request(app)
        .post('/api/v1/screenings')
        .set('Authorization', `Bearer ${patient1Token}`)
        .send({
          clientId,
          language: 'hi',
          symptoms: ['chest_pain', 'shortness_of_breath'],
          emergencyFlags: ['EMERG_CHEST_PAIN'],
          riskTier: 'HIGH',
          isEmergency: true,
          clientCreatedAt: Date.now(),
        });

      expect(res.status).toBe(201);
      const stored = await Screening.findOne({ clientId });
      expect(stored!.isEmergency).toBe(true);
      expect(stored!.engine!.type).toBe('rules');
      expect(stored!.engine!.source).toBe('emergency-red-flags');
    });
  });

  describe('Consultation Termination vs Diagnosis Separation', () => {
    it('ending a call transitions to DOCUMENTATION_PENDING and creates NO diagnosis or report', async () => {
      const consultation = await Consultation.create({
        patientId: patient1._id,
        doctorId: doctor1._id,
        status: 'IN_PROGRESS',
        callMode: 'VIDEO',
        priorityRank: 2,
        effectivePriority: 2,
        sequence: 1,
        zegoRoomId: `room_${crypto.randomUUID()}`,
        idempotencyKey: crypto.randomUUID(),
      });

      const res = await request(app)
        .post(`/api/v1/consultations/${consultation._id}/end`)
        .set('Authorization', `Bearer ${doctor1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.consultation.status).toBe('DOCUMENTATION_PENDING');

      // Verify ZERO encounters or reports exist
      const encounters = await Encounter.find({ consultationId: consultation._id });
      const reports = await Report.find({ consultationId: consultation._id });
      expect(encounters.length).toBe(0);
      expect(reports.length).toBe(0);
    });
  });

  describe('Encounter Finalization, Immutability & Amendments', () => {
    it('allows assigned doctor to save draft encounter before finalizing', async () => {
      const consultation = await Consultation.create({
        patientId: patient1._id,
        doctorId: doctor1._id,
        status: 'DOCUMENTATION_PENDING',
        callMode: 'VIDEO',
        priorityRank: 2,
        effectivePriority: 2,
        sequence: 1,
        zegoRoomId: `room_${crypto.randomUUID()}`,
        idempotencyKey: crypto.randomUUID(),
      });

      const draftRes = await request(app)
        .post(`/api/v1/consultations/${consultation._id}/encounter/draft`)
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({
          assessment: 'Draft: Throat congestion, lungs clear',
          diagnosisLabel: 'Pharyngitis (Suspected)',
          medications: [
            {
              name: 'Warm Saline Gargles',
              dosage: '3 times daily',
              frequency: 'TDS',
              durationDays: 3,
            },
          ],
        });

      expect(draftRes.status).toBe(200);
      expect(draftRes.body.encounter.status).toBe('DRAFT');
      expect(draftRes.body.encounter.version).toBe(1);

      // Finalize the consultation
      const finalizeRes = await request(app)
        .post(`/api/v1/consultations/${consultation._id}/complete`)
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({
          outcomeType: 'PRESCRIPTION',
          assessment: 'Final: Acute non-streptococcal pharyngitis',
          diagnosisLabel: 'Acute Pharyngitis',
          medications: [
            {
              name: 'Paracetamol 500mg',
              dosage: '1 tab SOS',
              frequency: 'When required',
              durationDays: 3,
            },
          ],
        });

      expect(finalizeRes.status).toBe(200);
      expect(finalizeRes.body.encounter.status).toBe('FINAL');
      expect(finalizeRes.body.report).toBeDefined();
      expect(finalizeRes.body.report.diagnosis).toBe('Acute Pharyngitis');
    });

    it('prevents editing a FINAL encounter in place (Encounter Immutability)', async () => {
      const consultation = await Consultation.create({
        patientId: patient1._id,
        doctorId: doctor1._id,
        status: 'DOCUMENTATION_PENDING',
        callMode: 'VIDEO',
        priorityRank: 2,
        effectivePriority: 2,
        sequence: 1,
        zegoRoomId: `room_${crypto.randomUUID()}`,
        idempotencyKey: crypto.randomUUID(),
      });

      // 1. Initial finalization
      await request(app)
        .post(`/api/v1/consultations/${consultation._id}/complete`)
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({
          outcomeType: 'PRESCRIPTION',
          assessment: 'Initial finalized assessment',
          diagnosisLabel: 'Viral Fever',
          medications: [],
        });

      // 2. Attempting to finalize again or edit in place returns 400
      const duplicateRes = await request(app)
        .post(`/api/v1/consultations/${consultation._id}/complete`)
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({
          outcomeType: 'PRESCRIPTION',
          assessment: 'Attempt to overwrite in place',
          diagnosisLabel: 'Overwritten Diagnosis',
          medications: [],
        });

      expect(duplicateRes.status).toBe(400);
      expect(duplicateRes.body.error.code).toBe('FINALIZED_ENCOUNTER_IMMUTABLE');
    });

    it('rejects attempts by non-assigned doctor to finalize or amend', async () => {
      const consultation = await Consultation.create({
        patientId: patient1._id,
        doctorId: doctor1._id, // Assigned to Doctor 1
        status: 'DOCUMENTATION_PENDING',
        callMode: 'VIDEO',
        priorityRank: 2,
        effectivePriority: 2,
        sequence: 1,
        zegoRoomId: `room_${crypto.randomUUID()}`,
        idempotencyKey: crypto.randomUUID(),
      });

      // Doctor 2 attempts to finalize Doctor 1's consultation
      const res = await request(app)
        .post(`/api/v1/consultations/${consultation._id}/complete`)
        .set('Authorization', `Bearer ${doctor2Token}`)
        .send({
          outcomeType: 'PRESCRIPTION',
          assessment: 'Unauthorized doctor writing diagnosis',
          diagnosisLabel: 'Fraudulent Diagnosis',
          medications: [],
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('creates versioned amendment (v2 supersedes v1) while keeping v1 immutable', async () => {
      const consultation = await Consultation.create({
        patientId: patient1._id,
        doctorId: doctor1._id,
        status: 'DOCUMENTATION_PENDING',
        callMode: 'VIDEO',
        priorityRank: 2,
        effectivePriority: 2,
        sequence: 1,
        zegoRoomId: `room_${crypto.randomUUID()}`,
        idempotencyKey: crypto.randomUUID(),
      });

      // Version 1
      const v1Res = await request(app)
        .post(`/api/v1/consultations/${consultation._id}/complete`)
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({
          outcomeType: 'PRESCRIPTION',
          assessment: 'Initial Assessment v1',
          diagnosisLabel: 'Acute Bronchitis',
          medications: [{ name: 'Cough Syrup', dosage: '10ml', frequency: 'BD', durationDays: 5 }],
        });
      expect(v1Res.status).toBe(200);
      const v1Id = v1Res.body.encounter._id;

      // Amend to Version 2
      const amendRes = await request(app)
        .post(`/api/v1/consultations/${consultation._id}/encounter/amend`)
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({
          outcomeType: 'PRESCRIPTION',
          assessment: 'Amended Assessment v2: Added chest x-ray review',
          diagnosisLabel: 'Bacterial Bronchitis',
          medications: [
            { name: 'Cough Syrup', dosage: '10ml', frequency: 'BD', durationDays: 5 },
            { name: 'Amoxicillin 500mg', dosage: '1 tab', frequency: 'TDS', durationDays: 5 },
          ],
          tests: ['Follow-up Chest X-ray in 7 days'],
        });

      expect(amendRes.status).toBe(200);
      expect(amendRes.body.encounter.version).toBe(2);
      expect(amendRes.body.encounter.supersedes).toBe(v1Id);
      expect(amendRes.body.report.diagnosis).toBe('Bacterial Bronchitis');

      // Verify Version 1 is still in DB, completely unchanged
      const v1Retained = await Encounter.findById(v1Id);
      expect(v1Retained).not.toBeNull();
      expect(v1Retained!.version).toBe(1);
      expect(v1Retained!.diagnosisLabel).toBe('Acute Bronchitis');
    });
  });

  describe('Medical Report Authorization & Privacy Leak Prevention', () => {
    it('patient owner and authoring doctor can read; other patients and doctors get 404', async () => {
      const consultation = await Consultation.create({
        patientId: patient1._id,
        doctorId: doctor1._id,
        status: 'DOCUMENTATION_PENDING',
        callMode: 'VIDEO',
        priorityRank: 2,
        effectivePriority: 2,
        sequence: 1,
        zegoRoomId: `room_${crypto.randomUUID()}`,
        idempotencyKey: crypto.randomUUID(),
      });

      const compRes = await request(app)
        .post(`/api/v1/consultations/${consultation._id}/complete`)
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({
          outcomeType: 'PRESCRIPTION',
          assessment: 'Clinical checkup',
          diagnosisLabel: 'Gastritis',
          medications: [],
        });
      const reportId = compRes.body.report._id;

      // 1. Patient 1 (owner) can read
      const p1Read = await request(app)
        .get(`/api/v1/reports/${reportId}`)
        .set('Authorization', `Bearer ${patient1Token}`);
      expect(p1Read.status).toBe(200);
      expect(p1Read.body.report.diagnosis).toBe('Gastritis');

      // 2. Doctor 1 (author) can read
      const d1Read = await request(app)
        .get(`/api/v1/reports/${reportId}`)
        .set('Authorization', `Bearer ${doctor1Token}`);
      expect(d1Read.status).toBe(200);

      // 3. Patient 2 (stranger) receives 404 (does NOT reveal existence)
      const p2Read = await request(app)
        .get(`/api/v1/reports/${reportId}`)
        .set('Authorization', `Bearer ${patient2Token}`);
      expect(p2Read.status).toBe(404);
      expect(p2Read.body.error.code).toBe('NOT_FOUND');

      // 4. Doctor 2 (unassigned doctor) receives 404
      const d2Read = await request(app)
        .get(`/api/v1/reports/${reportId}`)
        .set('Authorization', `Bearer ${doctor2Token}`);
      expect(d2Read.status).toBe(404);
      expect(d2Read.body.error.code).toBe('NOT_FOUND');
    });

    it('reopening a report after simulated refresh / re-login returns identical persisted values', async () => {
      const consultation = await Consultation.create({
        patientId: patient1._id,
        doctorId: doctor1._id,
        status: 'DOCUMENTATION_PENDING',
        callMode: 'VIDEO',
        priorityRank: 2,
        effectivePriority: 2,
        sequence: 1,
        zegoRoomId: `room_${crypto.randomUUID()}`,
        idempotencyKey: crypto.randomUUID(),
      });

      const compRes = await request(app)
        .post(`/api/v1/consultations/${consultation._id}/complete`)
        .set('Authorization', `Bearer ${doctor1Token}`)
        .send({
          outcomeType: 'PRESCRIPTION',
          assessment: 'Upper respiratory congestion',
          diagnosisLabel: 'Viral Rhinitis',
          medications: [
            { name: 'Cetirizine 10mg', dosage: '1 tab', frequency: 'Night', durationDays: 5, instructions: 'Before sleep' },
          ],
          tests: ['Nasal swab if no relief in 5 days'],
          notes: 'Steam inhalation twice daily',
          followUpDate: 'In 5 days if required',
        });
      const reportId = compRes.body.report._id;

      // Simulate re-login: New session and new token for Patient 1
      const newSid = crypto.randomUUID();
      await Session.create({ userId: patient1._id, sid: newSid, refreshFamilyId: crypto.randomUUID(), createdAt: new Date(), lastSeenAt: new Date() });
      const refreshedToken = await createAccessToken(patient1, newSid);

      const reopened = await request(app)
        .get(`/api/v1/reports/${reportId}`)
        .set('Authorization', `Bearer ${refreshedToken}`);

      expect(reopened.status).toBe(200);
      const rep = reopened.body.report;
      expect(rep.patientName).toBe('Ramesh Patil');
      expect(rep.doctorName).toBe('Dr. Anand Joshi');
      expect(rep.doctorRegistration).toBe('MMC/2026/88990');
      expect(rep.diagnosis).toBe('Viral Rhinitis');
      expect(rep.medications[0].name).toBe('Cetirizine 10mg');
      expect(rep.medications[0].durationDays).toBe(5);
      expect(rep.tests[0]).toBe('Nasal swab if no relief in 5 days');
      expect(rep.notes).toBe('Steam inhalation twice daily');
      expect(rep.followUpDate).toBe('In 5 days if required');
    });
  });
});
