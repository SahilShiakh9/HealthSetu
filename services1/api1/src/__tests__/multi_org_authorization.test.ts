import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import crypto from 'crypto';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Doctor } from '../models/Doctor.js';
import { FacilityModel } from '../models/Facility.js';
import { DoctorAffiliation } from '../models/DoctorAffiliation.js';
import { QueueEntry } from '../models/QueueEntry.js';
import { Consultation } from '../models/Consultation.js';
import { Screening } from '../models/Screening.js';
import { createAccessToken } from '../services/auth.service.js';
import { queueService } from '../services/queue.service.js';
import { facilityService } from '../services/facility.service.js';
import { buildPoolKey } from '../services/matching.service.js';

describe('Multi-Organization Role Boundary & Affiliation Authorization Suite', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let patientUser: any;
  let patientToken: string;
  let doctorUser: any;
  let doctorToken: string;
  let hospAdminUserA: any;
  let hospAdminTokenA: string;
  let hospAdminTokenB: string;
  let govtOfficerToken: string;
  let ngoObserverToken: string;
  let facilityA: any;
  let facilityB: any;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDb(mongoServer.getUri());
    await facilityService.seedDefaultFacilities();

    facilityA = await FacilityModel.findOne({ facilityId: 'fac-phc-001' });
    facilityB = await FacilityModel.findOne({ facilityId: 'fac-chc-001' });

    // 1. Citizen / Patient
    patientUser = await User.create({
      role: 'PATIENT',
      name: 'Santosh Kumar',
      phone: '9811111111',
      language: 'hi',
    });
    const patientSid = crypto.randomUUID();
    await Session.create({
      userId: patientUser._id,
      sid: patientSid,
      refreshFamilyId: crypto.randomUUID(),
    });
    patientToken = await createAccessToken(patientUser, patientSid);

    // 2. Doctor (Initially unapproved / no active affiliation)
    doctorUser = await User.create({
      role: 'DOCTOR',
      name: 'Dr. Vivek Rane',
      email: 'dr.vivek@healthsetu.org',
      language: 'en',
    });
    await Doctor.create({
      userId: doctorUser._id,
      specialties: ['General Physician'],
      languages: ['en', 'hi'],
      registrationNumber: 'MMC-98765',
      qualification: 'MBBS',
      experienceYears: 4,
      verificationStatus: 'APPROVED',
      availability: 'AVAILABLE',
      weeklyAvailability: [],
      rollingAvgConsultMinutes: 10,
      isMock: false,
    });
    const doctorSid = crypto.randomUUID();
    await Session.create({
      userId: doctorUser._id,
      sid: doctorSid,
      refreshFamilyId: crypto.randomUUID(),
    });
    doctorToken = await createAccessToken(doctorUser, doctorSid);

    // 3. Hospital Admin for Facility A
    hospAdminUserA = await User.create({
      role: 'HOSPITAL_ADMIN',
      name: 'Admin Facility A',
      email: 'admin.a@healthsetu.org',
      facilityId: 'fac-phc-001',
      facilityIds: ['fac-phc-001'],
      language: 'en',
    });
    await FacilityModel.findByIdAndUpdate(facilityA._id, {
      $addToSet: { adminUserIds: hospAdminUserA._id },
    });
    const adminSidA = crypto.randomUUID();
    await Session.create({
      userId: hospAdminUserA._id,
      sid: adminSidA,
      refreshFamilyId: crypto.randomUUID(),
    });
    hospAdminTokenA = await createAccessToken(hospAdminUserA, adminSidA);

    // 4. Hospital Admin for Facility B
    const hospAdminUserB = await User.create({
      role: 'HOSPITAL_ADMIN',
      name: 'Admin Facility B',
      email: 'admin.b@healthsetu.org',
      facilityId: 'fac-chc-001',
      facilityIds: ['fac-chc-001'],
      language: 'en',
    });
    await FacilityModel.findByIdAndUpdate(facilityB._id, {
      $addToSet: { adminUserIds: hospAdminUserB._id },
    });
    const adminSidB = crypto.randomUUID();
    await Session.create({
      userId: hospAdminUserB._id,
      sid: adminSidB,
      refreshFamilyId: crypto.randomUUID(),
    });
    hospAdminTokenB = await createAccessToken(hospAdminUserB, adminSidB);

    // 5. Government IDSP Officer (Jurisdiction: DIST-PUNE-RURAL)
    const govtUser = await User.create({
      role: 'GOVT_OFFICER',
      name: 'IDSP Officer Pune',
      email: 'idsp.pune@healthsetu.org',
      districtCode: 'DIST-PUNE-RURAL',
      language: 'en',
    });
    const govtSid = crypto.randomUUID();
    await Session.create({
      userId: govtUser._id,
      sid: govtSid,
      refreshFamilyId: crypto.randomUUID(),
    });
    govtOfficerToken = await createAccessToken(govtUser, govtSid);

    // 6. NGO Public Health Observer
    const ngoUser = await User.create({
      role: 'NGO_OBSERVER',
      name: 'Aarogya Foundation Observer',
      email: 'ngo.observer@healthsetu.org',
      districtCode: 'DIST-PUNE-RURAL',
      language: 'en',
    });
    const ngoSid = crypto.randomUUID();
    await Session.create({
      userId: ngoUser._id,
      sid: ngoSid,
      refreshFamilyId: crypto.randomUUID(),
    });
    ngoObserverToken = await createAccessToken(ngoUser, ngoSid);
  });

  afterAll(async () => {
    await disconnectDb();
    if (mongoServer) await mongoServer.stop();
  });

  describe('1. Patient Workspace Boundary', () => {
    it('blocks patient from accessing PHC surveillance summary', async () => {
      const res = await request(app)
        .get('/api/v1/phc/summary')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('blocks patient from accessing intelligence surveillance summary', async () => {
      const res = await request(app)
        .get('/api/v1/intelligence/summary')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
    });

    it('blocks patient from accessing facility doctor roster', async () => {
      const res = await request(app)
        .get(`/api/v1/affiliations/facility/fac-phc-001`)
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('2. Hospital Administrator & Doctor Affiliation Lifecycle', () => {
    let affiliationId: string;

    it('allows doctor to request affiliation with Facility A', async () => {
      const res = await request(app)
        .post('/api/v1/affiliations/request')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          facilityId: 'fac-phc-001',
          roleInFacility: 'CONSULTANT',
          notes: 'Available for general telemedicine OPD',
        });

      expect(res.status).toBe(201);
      expect(res.body.affiliation).toBeDefined();
      expect(res.body.affiliation.status).toBe('PENDING');
      affiliationId = res.body.affiliation._id;
    });

    it('prevents unapproved doctor from claiming consultations before approval', async () => {
      // Doctor currently only has PENDING affiliation
      await expect(
        queueService.startNextConsultation(doctorUser._id.toString()),
      ).rejects.toThrow();
    });

    it('prevents Hospital Admin B from approving affiliation for Facility A', async () => {
      const res = await request(app)
        .patch(`/api/v1/affiliations/${affiliationId}/status`)
        .set('Authorization', `Bearer ${hospAdminTokenB}`)
        .send({ status: 'ACTIVE' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows Hospital Admin A to approve affiliation for Facility A', async () => {
      const res = await request(app)
        .patch(`/api/v1/affiliations/${affiliationId}/status`)
        .set('Authorization', `Bearer ${hospAdminTokenA}`)
        .send({ status: 'ACTIVE', notes: 'Approved by Medical Director' });

      expect(res.status).toBe(200);
      expect(res.body.affiliation.status).toBe('ACTIVE');

      // Verify affiliation is now ACTIVE in db
      const aff = await DoctorAffiliation.findById(affiliationId);
      expect(aff?.status).toBe('ACTIVE');
    });

    it('hospital admin can view doctor roster for their facility', async () => {
      const res = await request(app)
        .get('/api/v1/affiliations/facility/fac-phc-001')
        .set('Authorization', `Bearer ${hospAdminTokenA}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.affiliations)).toBe(true);
      const docEntry = res.body.affiliations.find(
        (a: any) => a.doctorUserId?._id === doctorUser._id.toString(),
      );
      expect(docEntry).toBeDefined();
      expect(docEntry.status).toBe('ACTIVE');
    });
  });

  describe('3. Doctor Consultation Claims with Active Affiliation', () => {
    let consultationA: any;
    let consultationB: any;

    beforeAll(async () => {
      const screening = await Screening.create({
        clientId: crypto.randomUUID(),
        clientCreatedAt: Date.now(),
        receivedAt: Date.now(),
        language: 'hi',
        submittedBy: patientUser._id,
        patientId: patientUser._id,
        symptoms: ['headache'],
        answers: [],
        severity: 'mild',
        emergencyFlags: [],
        riskTier: 'LOW',
        isEmergency: false,
        possibleConditions: [],
        symptomGroups: [],
        recommendedSpecialty: 'General Physician',
        source: 'device',
        modelVersion: '1.0',
        triageConfigVersion: '1.0',
        imageIds: [],
      });

      // Consultation assigned to Facility A (doctor is affiliated)
      consultationA = await Consultation.create({
        patientId: patientUser._id,
        screeningId: screening._id,
        facilityId: (facilityA as any)._id,
        idempotencyKey: crypto.randomUUID(),
        type: 'NOW',
        status: 'QUEUED',
        callMode: 'VIDEO',
        preferredLanguage: 'hi',
        requiredSpecialty: 'General Physician',
        zegoRoomId: 'room-test-a',
      });
      await QueueEntry.create({
        consultationId: consultationA._id,
        patientId: consultationA.patientId,
        facilityId: facilityA._id,
        poolKey: buildPoolKey('General Physician', 'hi'),
        priorityRank: 0,
        effectivePriority: 10,
        sequence: 1,
        status: 'WAITING',
        joinedAt: new Date(),
        idempotencyKey: crypto.randomUUID(),
      });

      // Consultation assigned to Facility B (doctor is NOT affiliated)
      consultationB = await Consultation.create({
        patientId: patientUser._id,
        screeningId: screening._id,
        facilityId: (facilityB as any)._id,
        idempotencyKey: crypto.randomUUID(),
        type: 'NOW',
        status: 'QUEUED',
        callMode: 'VIDEO',
        preferredLanguage: 'hi',
        requiredSpecialty: 'General Physician',
        zegoRoomId: 'room-test-b',
      });
      await QueueEntry.create({
        consultationId: consultationB._id,
        patientId: consultationB.patientId,
        facilityId: facilityB._id,
        poolKey: buildPoolKey('General Physician', 'hi'),
        priorityRank: 0,
        effectivePriority: 10,
        sequence: 2,
        status: 'WAITING',
        joinedAt: new Date(),
        idempotencyKey: crypto.randomUUID(),
      });
    });

    it('rejects claim if doctor tries to claim consultation for an unaffiliated facility', async () => {
      await expect(
        queueService.startNextConsultation(
          doctorUser._id.toString(),
          consultationB._id.toString(),
        ),
      ).rejects.toThrow();
    });

    it('successfully claims consultation for an affiliated facility', async () => {
      const claim = await queueService.startNextConsultation(
        doctorUser._id.toString(),
        consultationA._id.toString(),
      );

      expect(claim).not.toBeNull();
      expect(claim?.consultation._id.toString()).toBe(consultationA._id.toString());
      expect(claim?.queueEntry.status).toBe('CALLED');
    });
  });

  describe('4. Public Health Jurisdiction Scoping & Confidentiality', () => {
    it('allows Government Officer to access their assigned district summary', async () => {
      const res = await request(app)
        .get('/api/v1/district/summary?districtCode=DIST-PUNE-RURAL')
        .set('Authorization', `Bearer ${govtOfficerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.summary).toBeDefined();
    });

    it('blocks Government Officer from accessing unauthorized district outside jurisdiction', async () => {
      const res = await request(app)
        .get('/api/v1/district/summary?districtCode=DIST-NANDURBAR-TRIBAL')
        .set('Authorization', `Bearer ${govtOfficerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows NGO Observer to view district aggregates', async () => {
      const res = await request(app)
        .get('/api/v1/district/aggregates?districtCode=DIST-PUNE-RURAL')
        .set('Authorization', `Bearer ${ngoObserverToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.aggregates)).toBe(true);
    });

    it('blocks NGO Observer from viewing clinical consultation reports or private patient PII', async () => {
      const res = await request(app)
        .get('/api/v1/reports')
        .set('Authorization', `Bearer ${ngoObserverToken}`);

      // Reports list requires PATIENT or DOCTOR
      expect(res.status).toBe(403);
    });
  });
});
