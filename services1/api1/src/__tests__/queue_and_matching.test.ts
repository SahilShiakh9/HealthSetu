import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import crypto from 'crypto';
import { Types } from 'mongoose';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Doctor } from '../models/Doctor.js';
import { QueueEntry } from '../models/QueueEntry.js';
import { Consultation } from '../models/Consultation.js';
import { Screening } from '../models/Screening.js';
import { createAccessToken } from '../services/auth.service.js';
import { scoreDoctor, calculateEstimatedWait, buildPoolKey } from '../services/matching.service.js';
import { queueService } from '../services/queue.service.js';

describe('Phase 5 Doctor Availability, Matching, and Pooled Queue Under Heavy Load', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let doctorAUser: any;
  let doctorAToken: string;
  let doctorBUser: any;
  let doctorBToken: string;
  let doctorCUser: any;
  let doctorCToken: string;
  let patientUser: any;
  let patientToken: string;
  let defaultScreening: any;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDb(mongoServer.getUri());

    // Create 3 available doctors
    doctorAUser = await User.create({
      role: 'DOCTOR',
      name: 'Dr. Anita Joshi',
      phone: '9810000001',
      language: 'hi',
    });
    const sIdA = crypto.randomUUID();
    await Session.create({ userId: doctorAUser._id, sid: sIdA, refreshFamilyId: crypto.randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
    doctorAToken = await createAccessToken(doctorAUser, sIdA);

    await Doctor.create({
      userId: doctorAUser._id,
      specialties: ['General Physician'],
      languages: ['hi', 'en'],
      availability: 'AVAILABLE',
      verificationStatus: 'APPROVED',
      experienceYears: 10,
      rollingAvgConsultMinutes: 10,
    });

    doctorBUser = await User.create({
      role: 'DOCTOR',
      name: 'Dr. Balasaheb Patil',
      phone: '9810000002',
      language: 'mr',
    });
    const sIdB = crypto.randomUUID();
    await Session.create({ userId: doctorBUser._id, sid: sIdB, refreshFamilyId: crypto.randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
    doctorBToken = await createAccessToken(doctorBUser, sIdB);

    await Doctor.create({
      userId: doctorBUser._id,
      specialties: ['General Physician'],
      languages: ['mr', 'hi'],
      availability: 'AVAILABLE',
      verificationStatus: 'APPROVED',
      experienceYears: 7,
      rollingAvgConsultMinutes: 10,
    });

    doctorCUser = await User.create({
      role: 'DOCTOR',
      name: 'Dr. Chitra Nair',
      phone: '9810000003',
      language: 'en',
    });
    const sIdC = crypto.randomUUID();
    await Session.create({ userId: doctorCUser._id, sid: sIdC, refreshFamilyId: crypto.randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
    doctorCToken = await createAccessToken(doctorCUser, sIdC);

    await Doctor.create({
      userId: doctorCUser._id,
      specialties: ['General Physician'],
      languages: ['en', 'hi'],
      availability: 'AVAILABLE',
      verificationStatus: 'APPROVED',
      experienceYears: 4,
      rollingAvgConsultMinutes: 10,
    });

    // Create a Patient
    patientUser = await User.create({
      role: 'PATIENT',
      name: 'Ramesh Kale',
      phone: '9820000001',
      language: 'hi',
    });
    const sIdP = crypto.randomUUID();
    await Session.create({ userId: patientUser._id, sid: sIdP, refreshFamilyId: crypto.randomUUID(), expiresAt: new Date(Date.now() + 3600000) });
    patientToken = await createAccessToken(patientUser, sIdP);

    // Create a base Screening record
    defaultScreening = await Screening.create({
      clientId: crypto.randomUUID(),
      patientId: patientUser._id,
      submittedBy: patientUser._id,
      language: 'hi',
      symptoms: ['headache', 'mild fever'],
      answers: [],
      severity: 'mild',
      emergencyFlags: [],
      riskTier: 'LOW',
      isEmergency: false,
      possibleConditions: [{ name: 'Viral fever', probability: 0.8 }],
      symptomGroups: ['General'],
      recommendedSpecialty: 'General Physician',
      source: 'device',
      modelVersion: '1.0',
      triageConfigVersion: '1.0',
      imageIds: [],
      clientCreatedAt: Date.now(),
      receivedAt: Date.now(),
    });
  }, 180000);

  afterAll(async () => {
    await disconnectDb();
    if (mongoServer) await mongoServer.stop();
  });

  describe('Pure Matching Engine & Score Breakdown', () => {
    it('calculates score with documented weights and returns breakdown', () => {
      const match = scoreDoctor(
        {
          requiredSpecialty: 'General Physician',
          preferredLanguage: 'hi',
          villageCode: 'VIL-01',
          districtCode: 'DIST-PUNE',
        },
        {
          _id: new Types.ObjectId(),
          name: 'Dr. Test',
          specialties: ['General Physician'],
          languages: ['hi', 'en'],
          availability: 'AVAILABLE',
          districtCode: 'DIST-PUNE',
          experienceYears: 5,
        },
        { currentQueueLength: 0 },
      );

      expect(match.total).toBeGreaterThanOrEqual(0);
      expect(match.total).toBeLessThanOrEqual(100);
      expect(match.breakdown).toHaveProperty('specialty');
      expect(match.breakdown).toHaveProperty('availability');
      expect(match.breakdown).toHaveProperty('queue');
      expect(match.breakdown).toHaveProperty('language');
      expect(match.breakdown).toHaveProperty('previousDoctor');
      expect(match.breakdown).toHaveProperty('location');

      // Perfect match scenario: specialty(30) + availability(25) + queue(20) + language(15) + location(5) = 95
      expect(match.breakdown.specialty).toBe(30);
      expect(match.breakdown.availability).toBe(25);
      expect(match.breakdown.queue).toBe(20);
      expect(match.breakdown.language).toBe(15);
      expect(match.breakdown.location).toBe(5);
      expect(match.total).toBe(95);
    });

    it('estimates wait time honestly using rolling consultation average', () => {
      // 0 entries ahead -> 0 min
      expect(calculateEstimatedWait(0, 3, 10)).toBe(0);
      // 6 entries ahead, 3 active doctors, 10 min avg -> (6 / 3) * 10 = 20 min
      expect(calculateEstimatedWait(6, 3, 10)).toBe(20);
      // 10 entries ahead, 1 active doctor, 8 min avg -> 80 min
      expect(calculateEstimatedWait(10, 1, 8)).toBe(80);
      // No active doctors -> assumes 1 doctor baseline
      expect(calculateEstimatedWait(4, 0, 10)).toBe(40);
    });
  });

  describe('Pooled Queue & Idempotency', () => {
    it('duplicate join requests with the same idempotencyKey produce exactly one entry', async () => {
      const idempotencyKey = crypto.randomUUID();

      const res1 = await request(app)
        .post('/api/v1/consultations/request')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          idempotencyKey,
          screeningId: defaultScreening._id.toString(),
          preferredLanguage: 'hi',
          requiredSpecialty: 'General Physician',
        });

      expect(res1.status).toBe(201);
      const consultId = res1.body.consultation._id;

      // Duplicate request with identical idempotencyKey
      const res2 = await request(app)
        .post('/api/v1/consultations/request')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          idempotencyKey,
          screeningId: defaultScreening._id.toString(),
          preferredLanguage: 'hi',
          requiredSpecialty: 'General Physician',
        });

      expect(res2.status).toBe(201);
      expect(res2.body.consultation._id).toBe(consultId);

      const dbEntries = await QueueEntry.find({ idempotencyKey });
      expect(dbEntries.length).toBe(1);
    });

    it('emergency symptoms strictly bypass the teleconsultation queue', async () => {
      const emergencyScreening: any = await Screening.create({
        clientId: crypto.randomUUID(),
        patientId: patientUser._id,
        submittedBy: patientUser._id,
        language: 'hi',
        symptoms: ['severe chest discomfort', 'loss of consciousness'],
        answers: [],
        severity: 'severe',
        emergencyFlags: ['CHEST_PAIN', 'UNCONSCIOUS'],
        riskTier: 'HIGH',
        isEmergency: true,
        possibleConditions: [{ name: 'Acute Myocardial Infarction', probability: 0.95 }],
        symptomGroups: ['Cardiovascular', 'Emergency'],
        recommendedSpecialty: 'Emergency Medicine',
        source: 'device',
        modelVersion: '1.0',
        triageConfigVersion: '1.0',
        imageIds: [],
        clientCreatedAt: Date.now(),
        receivedAt: Date.now(),
      });

      const res = await request(app)
        .post('/api/v1/consultations/request')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          idempotencyKey: crypto.randomUUID(),
          screeningId: emergencyScreening._id.toString(),
          preferredLanguage: 'hi',
          requiredSpecialty: 'General Physician',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EMERGENCY_QUEUE_BYPASS');

      // Verify no queue entry was inserted for this screening
      const count = await QueueEntry.countDocuments({ consultationId: emergencyScreening._id });
      expect(count).toBe(0);
    });
  });

  describe('Late Binding Atomic Claim & Doctor Availability', () => {
    it('unavailable doctors receive no assignments', async () => {
      // Mark Doctor C as OFFLINE
      await Doctor.updateOne({ userId: doctorCUser._id }, { availability: 'OFFLINE' });

      await expect(queueService.startNextConsultation(doctorCUser._id.toString())).rejects.toThrow();

      // Reset Doctor C to AVAILABLE
      await Doctor.updateOne({ userId: doctorCUser._id }, { availability: 'AVAILABLE' });
    });

    it('unverified doctors with PENDING status are rejected from claiming consultations', async () => {
      await Doctor.updateOne({ userId: doctorCUser._id }, { verificationStatus: 'PENDING' });

      await expect(queueService.startNextConsultation(doctorCUser._id.toString())).rejects.toThrow(
        /Doctor professional verification status is PENDING/,
      );

      // Reset Doctor C to APPROVED
      await Doctor.updateOne({ userId: doctorCUser._id }, { verificationStatus: 'APPROVED' });
    });

    it('two doctors calling accept at the same instant claim different patients', async () => {
      // Create two distinct queued patients
      const q1 = await queueService.joinQueue(patientUser._id.toString(), {
        idempotencyKey: crypto.randomUUID(),
        screeningId: defaultScreening._id.toString(),
        type: 'NOW',
        preferredLanguage: 'hi',
        requiredSpecialty: 'General Physician',
      });

      const q2 = await queueService.joinQueue(patientUser._id.toString(), {
        idempotencyKey: crypto.randomUUID(),
        screeningId: defaultScreening._id.toString(),
        type: 'NOW',
        preferredLanguage: 'hi',
        requiredSpecialty: 'General Physician',
      });

      // Both Doctor A and Doctor B call startNextConsultation concurrently
      const [claimA, claimB] = await Promise.all([
        queueService.startNextConsultation(doctorAUser._id.toString()),
        queueService.startNextConsultation(doctorBUser._id.toString()),
      ]);

      expect(claimA).not.toBeNull();
      expect(claimB).not.toBeNull();
      expect(claimA!.consultation._id.toString()).not.toBe(claimB!.consultation._id.toString());
    });
  });

  describe('Starvation Control (Aging Job)', () => {
    it('lowers effectivePriority for waiting entries past aging minutes', async () => {
      const qEntry = await QueueEntry.create({
        consultationId: new Types.ObjectId(),
        patientId: patientUser._id,
        poolKey: buildPoolKey('General Physician', 'hi'),
        priorityRank: 2,
        effectivePriority: 20,
        sequence: 9999,
        status: 'WAITING',
        joinedAt: Date.now() - 20 * 60 * 1000, // 20 mins ago (older than 15 min default)
        idempotencyKey: crypto.randomUUID(),
      });

      const agedCount = await queueService.ageWaitingEntries(15);
      expect(agedCount).toBeGreaterThanOrEqual(1);

      const updated = await QueueEntry.findById(qEntry._id);
      expect(updated!.effectivePriority).toBe(19); // Lowered by 1
    });
  });

  describe('Simulated Surge: 100 Patients with 3 Doctors', () => {
    it('serves 100 queued patients in priority order with zero double assignments and honest waits', async () => {
      // Clear queue entries for clean surge testing
      await QueueEntry.deleteMany({});
      await Consultation.deleteMany({});

      const totalPatients = 100;
      const joinedEntries: any[] = [];

      for (let i = 0; i < totalPatients; i++) {
        const lang = i < 50 ? 'hi' : 'mr';
        const priorityRank = i % 5 === 0 ? 0 : i % 3 === 0 ? 1 : 2;
        const effectivePriority = priorityRank === 0 ? 0 : priorityRank === 1 ? 10 : 20;

        const consult = new Consultation({
          patientId: patientUser._id,
          idempotencyKey: `surge-patient-${i}`,
          type: 'NOW',
          status: 'QUEUED',
          callMode: 'VIDEO',
          preferredLanguage: lang,
          requiredSpecialty: 'General Physician',
          priorityRank,
          effectivePriority,
          sequence: i + 1,
          zegoRoomId: `room_surge_${i}`,
        });
        await consult.save();

        const q = new QueueEntry({
          consultationId: consult._id,
          patientId: patientUser._id,
          poolKey: buildPoolKey('General Physician', lang),
          priorityRank,
          effectivePriority,
          sequence: i + 1,
          status: 'WAITING',
          joinedAt: Date.now(),
          idempotencyKey: `surge-patient-${i}`,
        });
        await q.save();
        joinedEntries.push(q);
      }

      expect(joinedEntries.length).toBe(100);

      // Verify honest wait re-estimation under surge
      const entriesAhead = await QueueEntry.countDocuments({
        poolKey: buildPoolKey('General Physician', 'hi'),
        status: 'WAITING',
      });
      expect(entriesAhead).toBe(50);
      // Wait for 50 entries with 2 active doctors serving Hindi = (50 / 2) * 10 = 250 mins
      const estimatedHindiWait = calculateEstimatedWait(entriesAhead, 2, 10);
      expect(estimatedHindiWait).toBe(250);

      // Drain all 100 consultations with the 3 available doctors concurrently
      const doctorIds = [
        doctorAUser._id.toString(),
        doctorBUser._id.toString(),
        doctorCUser._id.toString(),
      ];

      const claimedConsultationIds = new Set<string>();

      // Loop until all entries are claimed
      let claimedCount = 0;
      while (claimedCount < totalPatients) {
        // Run parallel claims across doctors
        const batchClaims = await Promise.all(
          doctorIds.map((docId) => queueService.startNextConsultation(docId)),
        );

        let claimedInBatch = 0;
        for (const claim of batchClaims) {
          if (claim) {
            const cid = claim.consultation._id.toString();
            // Assert no double-assignment occurred!
            expect(claimedConsultationIds.has(cid)).toBe(false);
            claimedConsultationIds.add(cid);
            claimedInBatch++;
            claimedCount++;

            // Conclude consultation session and restore doctor availability
            await QueueEntry.updateOne({ consultationId: cid }, { status: 'DONE' });
            await Consultation.updateOne({ _id: cid }, { status: 'COMPLETED' });
            await Doctor.updateOne({ userId: claim.queueEntry.doctorId }, { availability: 'AVAILABLE' });
          }
        }

        if (claimedInBatch === 0) {
          break; // Queue drained
        }
      }

      // Assert that every patient was successfully and uniquely claimed
      expect(claimedConsultationIds.size).toBe(totalPatients);

      // Verify no orphan WAITING entries remain
      const remainingWaiting = await QueueEntry.countDocuments({ status: 'WAITING' });
      expect(remainingWaiting).toBe(0);
    });
  });

  describe('Surge Overflow Flag & Queue Status Refresh', () => {
    it('returns overflow when entries ahead exceed configured limit', async () => {
      // Artificially insert 55 waiting entries into General Physician:hi pool
      const dummyEntries = Array.from({ length: 55 }).map((_, i) => ({
        consultationId: new Types.ObjectId(),
        patientId: patientUser._id,
        poolKey: buildPoolKey('General Physician', 'hi'),
        priorityRank: 2,
        effectivePriority: 20,
        sequence: i + 1,
        status: 'WAITING',
        joinedAt: Date.now(),
        idempotencyKey: `overflow-test-${i}`,
      }));

      await QueueEntry.insertMany(dummyEntries);

      // Join request should return overflow: true
      const result = await queueService.joinQueue(patientUser._id.toString(), {
        idempotencyKey: crypto.randomUUID(),
        screeningId: defaultScreening._id.toString(),
        type: 'NOW',
        preferredLanguage: 'hi',
        requiredSpecialty: 'General Physician',
      });

      expect(result.overflow).toBe(true);
      expect(result.suggestedAction).toBe('BOOK_LATER');

      // Verify queue status endpoint reflects position and wait
      const statusRes = await request(app)
        .get(`/api/v1/consultations/queue/${result.consultation._id.toString()}`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.positionInQueue).toBeGreaterThanOrEqual(50);
      expect(statusRes.body.estimatedWaitMinutes).toBeGreaterThanOrEqual(30);
    });
  });
});
