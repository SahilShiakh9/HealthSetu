import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import crypto from 'crypto';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Doctor } from '../models/Doctor.js';
import { QueueEntry } from '../models/QueueEntry.js';
import { Consultation } from '../models/Consultation.js';
import { Encounter } from '../models/Encounter.js';
import { Report } from '../models/Report.js';
import { createAccessToken } from '../services/auth.service.js';

describe('Phase 6 Teleconsultation Join, End & Real RTC Workflow', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let doctorUser: any;
  let doctorToken: string;
  let patientUser: any;
  let patientToken: string;
  let strangerUser: any;
  let strangerToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDb(mongoServer.getUri());

    // 1. Doctor
    doctorUser = await User.create({
      role: 'DOCTOR',
      name: 'Dr. Vivek Deshmukh',
      phone: '9820111111',
      language: 'mr',
    });
    const docSid = crypto.randomUUID();
    await Session.create({
      userId: doctorUser._id,
      sid: docSid,
      refreshFamilyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    doctorToken = await createAccessToken(doctorUser, docSid);

    await Doctor.create({
      userId: doctorUser._id,
      specialties: ['General Physician'],
      languages: ['mr', 'en'],
      availability: 'AVAILABLE',
      experienceYears: 6,
    });

    // 2. Patient
    patientUser = await User.create({
      role: 'PATIENT',
      name: 'Pooja Shinde',
      phone: '9820222222',
      language: 'mr',
    });
    const patSid = crypto.randomUUID();
    await Session.create({
      userId: patientUser._id,
      sid: patSid,
      refreshFamilyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    patientToken = await createAccessToken(patientUser, patSid);

    // 3. Stranger (Unrelated Patient)
    strangerUser = await User.create({
      role: 'PATIENT',
      name: 'Anand Verma',
      phone: '9820333333',
      language: 'hi',
    });
    const strSid = crypto.randomUUID();
    await Session.create({
      userId: strangerUser._id,
      sid: strSid,
      refreshFamilyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    strangerToken = await createAccessToken(strangerUser, strSid);
  }, 180000);

  afterAll(async () => {
    await disconnectDb();
    if (mongoServer) await mongoServer.stop();
  });

  describe('POST /api/v1/consultations/:id/join', () => {
    it('authorizes patient and doctor of this consultation to join and issues short-lived token', async () => {
      const consult = await Consultation.create({
        patientId: patientUser._id,
        doctorId: doctorUser._id,
        idempotencyKey: crypto.randomUUID(),
        status: 'QUEUED',
        callMode: 'VIDEO',
        preferredLanguage: 'mr',
        requiredSpecialty: 'General Physician',
        priorityRank: 1,
        effectivePriority: 10,
        sequence: 1,
        positionInQueue: 1,
        estimatedWaitMinutes: 5,
        zegoRoomId: 'room_rtc_test_01',
      });

      // Patient joins
      const patJoinRes = await request(app)
        .post(`/api/v1/consultations/${consult._id}/join`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(patJoinRes.status).toBe(200);
      expect(patJoinRes.body.status).toBe('success');
      expect(patJoinRes.body.zego.token).toBeDefined();
      expect(patJoinRes.body.zego.appId).toBeDefined();
      expect(patJoinRes.body.zego.roomId).toBe('room_rtc_test_01');
      // Patient opens pre-call room while queued: status remains QUEUED (not falsely marked admitted)
      expect(patJoinRes.body.consultation.status).toBe('QUEUED');

      // Doctor joins and admits consultation to IN_PROGRESS
      const docJoinRes = await request(app)
        .post(`/api/v1/consultations/${consult._id}/join`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(docJoinRes.status).toBe(200);
      expect(docJoinRes.body.zego.token).toBeDefined();
      expect(docJoinRes.body.zego.roomId).toBe('room_rtc_test_01');
      expect(docJoinRes.body.consultation.status).toBe('IN_PROGRESS');
    });

    it('denies unrelated user with 404 (does not leak consultation existence)', async () => {
      const consult = await Consultation.create({
        patientId: patientUser._id,
        doctorId: doctorUser._id,
        idempotencyKey: crypto.randomUUID(),
        status: 'IN_PROGRESS',
        callMode: 'VIDEO',
        preferredLanguage: 'mr',
        requiredSpecialty: 'General Physician',
        priorityRank: 1,
        effectivePriority: 10,
        sequence: 2,
        positionInQueue: 1,
        estimatedWaitMinutes: 5,
        zegoRoomId: 'room_rtc_test_02',
      });

      const res = await request(app)
        .post(`/api/v1/consultations/${consult._id}/join`)
        .set('Authorization', `Bearer ${strangerToken}`);

      expect(res.status).toBe(404);
    });

    it('rejects joining when consultation is completed or cancelled', async () => {
      const completedConsult = await Consultation.create({
        patientId: patientUser._id,
        doctorId: doctorUser._id,
        idempotencyKey: crypto.randomUUID(),
        status: 'COMPLETED',
        callMode: 'VIDEO',
        preferredLanguage: 'mr',
        requiredSpecialty: 'General Physician',
        priorityRank: 1,
        effectivePriority: 10,
        sequence: 3,
        positionInQueue: 1,
        estimatedWaitMinutes: 0,
        zegoRoomId: 'room_rtc_test_03',
      });

      const res = await request(app)
        .post(`/api/v1/consultations/${completedConsult._id}/join`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CONSULTATION_INACTIVE');
    });
  });

  describe('POST /api/v1/consultations/:id/end', () => {
    it('sets consultation to DOCUMENTATION_PENDING without auto-finalizing encounter or report', async () => {
      const consult = await Consultation.create({
        patientId: patientUser._id,
        doctorId: doctorUser._id,
        idempotencyKey: crypto.randomUUID(),
        status: 'IN_PROGRESS',
        callMode: 'VIDEO',
        preferredLanguage: 'mr',
        requiredSpecialty: 'General Physician',
        priorityRank: 1,
        effectivePriority: 10,
        sequence: 4,
        positionInQueue: 1,
        estimatedWaitMinutes: 0,
        zegoRoomId: 'room_rtc_test_04',
      });

      // Insert active QueueEntry
      await QueueEntry.create({
        consultationId: consult._id,
        patientId: patientUser._id,
        poolKey: 'general_physician:mr',
        priorityRank: 1,
        effectivePriority: 10,
        sequence: 4,
        status: 'CALLED',
        joinedAt: Date.now(),
        idempotencyKey: crypto.randomUUID(),
      });

      // Mark doctor BUSY
      await Doctor.updateOne({ userId: doctorUser._id }, { availability: 'BUSY' });

      // Doctor ends call
      const endRes = await request(app)
        .post(`/api/v1/consultations/${consult._id}/end`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(endRes.status).toBe(200);
      expect(endRes.body.consultationStatus).toBe('DOCUMENTATION_PENDING');

      // Verify database state: status is DOCUMENTATION_PENDING
      const updatedConsult = await Consultation.findById(consult._id);
      expect(updatedConsult!.status).toBe('DOCUMENTATION_PENDING');
      expect(updatedConsult!.endedAt).toBeDefined();

      // Zero Encounters and Reports were created (anti-hallucination / S6 fix)
      const encounterCount = await Encounter.countDocuments({ consultationId: consult._id });
      expect(encounterCount).toBe(0);
      const reportCount = await Report.countDocuments({ consultationId: consult._id });
      expect(reportCount).toBe(0);

      // Verify doctor availability is restored to AVAILABLE
      const updatedDoc = await Doctor.findOne({ userId: doctorUser._id });
      expect(updatedDoc!.availability).toBe('AVAILABLE');

      // Verify QueueEntry was marked DONE
      const qEntry = await QueueEntry.findOne({ consultationId: consult._id });
      expect(qEntry!.status).toBe('DONE');
    });
  });
});
