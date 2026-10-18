import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { createApp } from '../app.js';
import { User } from '../models/User.js';
import { Doctor } from '../models/Doctor.js';
import { Consultation } from '../models/Consultation.js';
import { QueueEntry } from '../models/QueueEntry.js';
import { Encounter } from '../models/Encounter.js';
import { Report } from '../models/Report.js';
import { createAccessToken } from '../services/auth.service.js';
import { queueService } from '../services/queue.service.js';

let mongoServer: MongoMemoryServer;
let app: any;
let patientUser: any;
let patientToken: string;
let doctorUser: any;
let doctorToken: string;
let doctor2User: any;
let doctor2Token: string;

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
  await QueueEntry.deleteMany({});
  await Doctor.deleteMany({});
  await User.deleteMany({});
  await Encounter.deleteMany({});
  await Report.deleteMany({});

  patientUser = await User.create({
    phone: '+919876543210',
    role: 'PATIENT',
    name: 'Ramesh Patil',
    language: 'hi',
  });
  patientToken = await createAccessToken(patientUser);

  doctorUser = await User.create({
    phone: '+919876543211',
    role: 'DOCTOR',
    name: 'Dr. Niranjan Shinde',
    language: 'hi',
  });
  doctorToken = await createAccessToken(doctorUser);

  await Doctor.create({
    userId: doctorUser._id,
    specialties: ['General Physician', 'Dermatology'],
    languages: ['en', 'hi', 'mr'],
    registrationNumber: 'MCI-464651',
    qualification: 'MBBS, MD',
    experienceYears: 10,
    verificationStatus: 'APPROVED',
    availability: 'AVAILABLE',
    rollingAvgConsultMinutes: 8,
    isMock: false,
  });

  doctor2User = await User.create({
    phone: '+919876543212',
    role: 'DOCTOR',
    name: 'Dr. Anjali Deshmukh',
    language: 'hi',
  });
  doctor2Token = await createAccessToken(doctor2User);

  await Doctor.create({
    userId: doctor2User._id,
    specialties: ['Pediatrics', 'General Physician'],
    languages: ['en', 'hi'],
    registrationNumber: 'MCI-789012',
    qualification: 'MBBS, DNB',
    experienceYears: 6,
    verificationStatus: 'APPROVED',
    availability: 'AVAILABLE',
    rollingAvgConsultMinutes: 10,
    isMock: false,
  });
});

describe('E2E Real-Time Consultation & Queue Lifecycle Regression Suite', () => {
  it('Scenario 1 & 2: Patient joins selected doctor queue, sees honest position, and pre-call screen does not falsely admit them', async () => {
    // 1. Patient requests consultation with preferred doctor
    const reqRes = await request(app)
      .post('/api/v1/consultations/request')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        idempotencyKey: crypto.randomUUID(),
        screeningId: '000000000000000000000001',
        type: 'NOW',
        requiredSpecialty: 'General Physician',
        preferredLanguage: 'hi',
        doctorId: doctorUser._id.toString(),
      });

    expect(reqRes.status).toBe(201);
    expect(reqRes.body.consultation.status).toBe('QUEUED');
    const consultId = reqRes.body.consultation._id;

    // Check queue position: direct doctor queue position is #1
    const queueRes = await request(app)
      .get(`/api/v1/consultations/queue/${consultId}`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(queueRes.status).toBe(200);
    expect(queueRes.body.positionInQueue).toBe(1);
    expect(queueRes.body.status).toBe('WAITING');

    // 2. Patient opens pre-call waiting room via /join: receives credentials but status remains QUEUED
    const patJoinRes = await request(app)
      .post(`/api/v1/consultations/${consultId}/join`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(patJoinRes.status).toBe(200);
    expect(patJoinRes.body.zego.token).toBeDefined();
    expect(patJoinRes.body.consultation.status).toBe('QUEUED'); // Must not be falsely marked admitted!

    const consultAfterPatJoin = await Consultation.findById(consultId);
    expect(consultAfterPatJoin?.status).toBe('QUEUED');
  });

  it('Scenario 3 & 4: Selected doctor admits patient, atomic assignment occurs, and both share authoritative IN_PROGRESS state', async () => {
    // Patient enqueues
    const reqRes = await request(app)
      .post('/api/v1/consultations/request')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        idempotencyKey: crypto.randomUUID(),
        screeningId: '000000000000000000000001',
        type: 'NOW',
        requiredSpecialty: 'General Physician',
        preferredLanguage: 'hi',
        doctorId: doctorUser._id.toString(),
      });

    const consultId = reqRes.body.consultation._id;

    // Doctor accepts patient
    const acceptRes = await request(app)
      .post(`/api/v1/consultations/${consultId}/accept`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.consultation.status).toBe('IN_PROGRESS');
    expect(acceptRes.body.consultation.doctorId).toBe(doctorUser._id.toString());

    // Patient checks status after refresh/reconnect: sees authoritative IN_PROGRESS
    const consultRefresh = await request(app)
      .get(`/api/v1/consultations/${consultId}`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(consultRefresh.status).toBe(200);
    expect(consultRefresh.body.consultation.status).toBe('IN_PROGRESS');
    expect(consultRefresh.body.zego.token).toBeDefined();
    expect(consultRefresh.body.zego.roomId).toBe(acceptRes.body.consultation.zegoRoomId);
  });

  it('Scenario 5: Bidirectional text messaging between doctor and patient is persisted and synchronized', async () => {
    // Setup admitted consultation
    const reqRes = await request(app)
      .post('/api/v1/consultations/request')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        idempotencyKey: crypto.randomUUID(),
        screeningId: '000000000000000000000001',
        type: 'NOW',
        requiredSpecialty: 'General Physician',
        doctorId: doctorUser._id.toString(),
      });

    const consultId = reqRes.body.consultation._id;
    await request(app)
      .post(`/api/v1/consultations/${consultId}/accept`)
      .set('Authorization', `Bearer ${doctorToken}`);

    // Doctor sends message "Namaste, can you hear me?"
    const docMsgRes = await request(app)
      .post(`/api/v1/consultations/${consultId}/messages`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        clientId: crypto.randomUUID(),
        body: 'Namaste, can you hear me?',
        kind: 'TEXT',
      });

    expect(docMsgRes.status).toBe(201);
    expect(docMsgRes.body.message.body).toBe('Namaste, can you hear me?');
    expect(docMsgRes.body.message.senderRole).toBe('DOCTOR');

    // Patient sends reply "Yes doctor, loud and clear"
    const patMsgRes = await request(app)
      .post(`/api/v1/consultations/${consultId}/messages`)
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        clientId: crypto.randomUUID(),
        body: 'Yes doctor, loud and clear',
        kind: 'TEXT',
      });

    expect(patMsgRes.status).toBe(201);
    expect(patMsgRes.body.message.body).toBe('Yes doctor, loud and clear');
    expect(patMsgRes.body.message.senderRole).toBe('PATIENT');

    // Verify conversation history is persisted in MongoDB and loaded on reconnect
    const consultRecord = await request(app)
      .get(`/api/v1/consultations/${consultId}`)
      .set('Authorization', `Bearer ${patientToken}`);

    expect(consultRecord.body.consultation.messages).toHaveLength(2);
    expect(consultRecord.body.consultation.messages[0].body).toBe('Namaste, can you hear me?');
    expect(consultRecord.body.consultation.messages[1].body).toBe('Yes doctor, loud and clear');
  });

  it('Scenario 7 & 8: Synchronized call termination vs clinical report completion', async () => {
    // Setup active call
    const reqRes = await request(app)
      .post('/api/v1/consultations/request')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        idempotencyKey: crypto.randomUUID(),
        screeningId: '000000000000000000000001',
        type: 'NOW',
        requiredSpecialty: 'General Physician',
        doctorId: doctorUser._id.toString(),
      });

    const consultId = reqRes.body.consultation._id;
    await request(app)
      .post(`/api/v1/consultations/${consultId}/accept`)
      .set('Authorization', `Bearer ${doctorToken}`);

    // 1. Doctor ends call -> DOCUMENTATION_PENDING (media stops, clinical documentation open)
    const endRes = await request(app)
      .post(`/api/v1/consultations/${consultId}/end`)
      .set('Authorization', `Bearer ${doctorToken}`);

    expect(endRes.status).toBe(200);
    expect(endRes.body.consultationStatus).toBe('DOCUMENTATION_PENDING');

    // Patient checks consultation: status is DOCUMENTATION_PENDING
    const patCheckRes = await request(app)
      .get(`/api/v1/consultations/${consultId}`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(patCheckRes.body.consultation.status).toBe('DOCUMENTATION_PENDING');

    // 2. Doctor finalizes clinical documentation and issues prescription
    const completeRes = await request(app)
      .post(`/api/v1/consultations/${consultId}/complete`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        outcomeType: 'PRESCRIPTION',
        diagnosisLabel: 'Acute Upper Respiratory Tract Infection',
        assessment: 'Viral rhinosinusitis with mild throat congestion. Vitals stable.',
        medications: [
          {
            name: 'Paracetamol',
            dosage: '500mg',
            frequency: 'TDS (three times a day)',
            durationDays: 3,
            instructions: 'Post meals with warm water',
          },
        ],
        tests: ['CBC if fever persists beyond 72h'],
        notes: 'Advised warm water saline gargles and rest.',
      });

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.consultation.status).toBe('COMPLETED');
    expect(completeRes.body.report.reportNumber).toMatch(/^REP-/);
    expect(completeRes.body.report.diagnosis).toBe('Acute Upper Respiratory Tract Infection');

    // Patient refreshes and recovers finalized report
    const finalizedConsult = await request(app)
      .get(`/api/v1/consultations/${consultId}`)
      .set('Authorization', `Bearer ${patientToken}`);
    expect(finalizedConsult.body.consultation.status).toBe('COMPLETED');
    expect(finalizedConsult.body.consultation.outcome.diagnosisLabel).toBe('Acute Upper Respiratory Tract Infection');
  });

  it('Scenario 9: Doctor decline restores patient request to WAITING in queue without duplicate requests', async () => {
    // Patient enqueues
    const reqRes = await request(app)
      .post('/api/v1/consultations/request')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        idempotencyKey: crypto.randomUUID(),
        screeningId: '000000000000000000000001',
        type: 'NOW',
        requiredSpecialty: 'General Physician',
        doctorId: doctorUser._id.toString(),
      });

    const consultId = reqRes.body.consultation._id;
    await request(app)
      .post(`/api/v1/consultations/${consultId}/accept`)
      .set('Authorization', `Bearer ${doctorToken}`);

    // Doctor declines / cancels offer
    await queueService.declineConsultation(doctorUser._id.toString(), consultId);

    // Consultation must be safely restored to QUEUED and queue entry back to WAITING
    const restored = await Consultation.findById(consultId);
    expect(restored?.status).toBe('QUEUED');

    const queueEntry = await QueueEntry.findOne({ consultationId: consultId });
    expect(queueEntry?.status).toBe('WAITING');

    // Total queue entries for this consultation must strictly be 1 (no duplicates)
    const count = await QueueEntry.countDocuments({ consultationId: consultId });
    expect(count).toBe(1);
  });
});
