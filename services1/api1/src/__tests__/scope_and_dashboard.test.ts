import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import crypto from 'crypto';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { FacilityModel } from '../models/Facility.js';
import { HealthSignalEvent } from '../models/HealthSignalEvent.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { StaffAssignment } from '../models/StaffAssignment.js';
import { createAccessToken } from '../services/auth.service.js';
import { facilityService } from '../services/facility.service.js';

describe('Phase 3 Role-Scoped Dashboards and Facility Authorization Suite', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let patientToken: string;
  let doctorToken: string;
  let phcStaffAToken: string;
  let phcStaffBToken: string;
  let emptyPhcStaffToken: string;
  let adminToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDb(mongoServer.getUri());

    // Seed default facilities
    await facilityService.seedDefaultFacilities();

    // 1. Patient user
    const patientUser = await User.create({
      role: 'PATIENT',
      name: 'Ramesh Patil',
      phone: '9800000001',
      language: 'mr',
    });
    const patientSid = crypto.randomUUID();
    await Session.create({
      userId: patientUser._id,
      sid: patientSid,
      refreshFamilyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    patientToken = await createAccessToken(patientUser, patientSid);

    // 2. Doctor user
    const doctorUser = await User.create({
      role: 'DOCTOR',
      name: 'Dr. Anita Joshi',
      phone: '9800000002',
      language: 'en',
    });
    const doctorSid = crypto.randomUUID();
    await Session.create({
      userId: doctorUser._id,
      sid: doctorSid,
      refreshFamilyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    doctorToken = await createAccessToken(doctorUser, doctorSid);

    // 3. PHC Staff A assigned to fac-phc-001 (Pabal PHC)
    const staffAUser = await User.create({
      role: 'PHC_OFFICER',
      name: 'Dr. Suresh Pawar (Pabal MO)',
      phone: '9800000003',
      language: 'en',
      facilityId: 'fac-phc-001',
      facilityIds: ['fac-phc-001'],
      districtCode: 'PUNE',
    });
    const staffASid = crypto.randomUUID();
    await Session.create({
      userId: staffAUser._id,
      sid: staffASid,
      refreshFamilyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    phcStaffAToken = await createAccessToken(staffAUser, staffASid);

    // 4. PHC Staff B assigned to fac-phc-002 (Shikrapur 24x7 PHC)
    const staffBUser = await User.create({
      role: 'PHC_OFFICER',
      name: 'Dr. Meena Deshmukh (Shikrapur MO)',
      phone: '9800000004',
      language: 'en',
      facilityId: 'fac-phc-002',
      facilityIds: ['fac-phc-002'],
      districtCode: 'PUNE',
    });
    const staffBSid = crypto.randomUUID();
    await Session.create({
      userId: staffBUser._id,
      sid: staffBSid,
      refreshFamilyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    phcStaffBToken = await createAccessToken(staffBUser, staffBSid);

    // 5. Staff with zero recorded events assigned to fac-sc-001 (Kendur SC) via StaffAssignment
    const emptyStaffUser = await User.create({
      role: 'PHC_OFFICER',
      name: 'Sunita Shinde (Kendur)',
      phone: '9800000005',
      language: 'mr',
    });
    await StaffAssignment.create({
      userId: emptyStaffUser._id,
      role: 'PHC_OFFICER',
      facilityIds: ['fac-sc-001'],
      districtCode: 'PUNE',
      active: true,
    });
    const emptyStaffSid = crypto.randomUUID();
    await Session.create({
      userId: emptyStaffUser._id,
      sid: emptyStaffSid,
      refreshFamilyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    emptyPhcStaffToken = await createAccessToken(emptyStaffUser, emptyStaffSid);

    // 6. District Admin
    const adminUser = await User.create({
      role: 'ADMIN',
      name: 'District Health Officer',
      phone: '9800000006',
      language: 'en',
      districtCode: 'PUNE',
    });
    const adminSid = crypto.randomUUID();
    await Session.create({
      userId: adminUser._id,
      sid: adminSid,
      refreshFamilyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    adminToken = await createAccessToken(adminUser, adminSid);

    // Seed 5 real health signals for fac-phc-001 (Pabal)
    const today = new Date().toISOString().split('T')[0];
    await HealthSignalEvent.insertMany([
      {
        phcId: 'fac-phc-001',
        areaCode: 'VIL-412403',
        districtCode: 'PUNE',
        day: today,
        syndrome: 'febrile_illness',
        riskTier: 'HIGH',
        ageBand: '21-30',
        gender: 'M',
      },
      {
        phcId: 'fac-phc-001',
        areaCode: 'VIL-412403',
        districtCode: 'PUNE',
        day: today,
        syndrome: 'febrile_illness',
        riskTier: 'HIGH',
        ageBand: '31-40',
        gender: 'F',
      },
      {
        phcId: 'fac-phc-001',
        areaCode: 'VIL-412403',
        districtCode: 'PUNE',
        day: today,
        syndrome: 'febrile_illness',
        riskTier: 'MEDIUM',
        ageBand: '11-20',
        gender: 'F',
      },
      {
        phcId: 'fac-phc-001',
        areaCode: 'VIL-412403',
        districtCode: 'PUNE',
        day: today,
        syndrome: 'respiratory',
        riskTier: 'LOW',
        ageBand: '51-60',
        gender: 'M',
      },
      {
        phcId: 'fac-phc-001',
        areaCode: 'VIL-412403',
        districtCode: 'PUNE',
        day: today,
        syndrome: 'respiratory',
        riskTier: 'LOW',
        ageBand: '0-10',
        gender: 'M',
      },
    ]);
  }, 60000);

  afterAll(async () => {
    await disconnectDb();
    if (mongoServer) {
      await mongoServer.stop();
    }
  }, 30000);

  describe('1. Public Directory Security (No Operational Fields Leaked)', () => {
    it('GET /api/v1/facilities/nearby excludes capacityPerDay and currentLoad', async () => {
      const res = await request(app)
        .get('/api/v1/facilities/nearby')
        .query({ lat: 18.8286, lng: 74.0531 });

      expect(res.status).toBe(200);
      expect(res.body.facilities.length).toBeGreaterThan(0);

      for (const item of res.body.facilities) {
        expect(item.facility).toBeDefined();
        // Public directory fields must exist
        expect(item.facility.name).toBeDefined();
        expect(item.facility.type).toBeDefined();
        expect(item.facility.location).toBeDefined();
        expect(item.facility.phone).toBeDefined();
        expect(item.facility.dataSource).toBeDefined();

        // Operational/staff fields must NOT be exposed
        expect(item.facility.capacityPerDay).toBeUndefined();
        expect(item.facility.currentLoad).toBeUndefined();
      }
    });

    it('GET /api/v1/facilities/:id excludes operational fields from public view', async () => {
      const res = await request(app).get('/api/v1/facilities/fac-phc-001');

      expect(res.status).toBe(200);
      expect(res.body.facility.id).toBe('fac-phc-001');
      expect(res.body.facility.name).toContain('Pabal');
      expect(res.body.facility.dataSource).toBeDefined();

      // Operational fields must not leak
      expect(res.body.facility.capacityPerDay).toBeUndefined();
      expect(res.body.facility.currentLoad).toBeUndefined();
    });
  });

  describe('2. Role Access Gates to PHC Administration', () => {
    it('refuses PATIENT calling /api/v1/phc/summary with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/phc/summary')
        .set('Authorization', `Bearer ${patientToken}`);

      expect(res.status).toBe(403);
    });

    it('refuses DOCTOR calling /api/v1/phc/summary with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/phc/summary')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(403);
    });

    it('allows authorized PHC_OFFICER calling /api/v1/phc/summary with 200 OK', async () => {
      const res = await request(app)
        .get('/api/v1/phc/summary')
        .set('Authorization', `Bearer ${phcStaffAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.summary.facilityId).toBe('fac-phc-001');
    });
  });

  describe('3. Scope Isolation: Facility A User Cannot Access Facility B', () => {
    it('Staff A accessing Facility B by resource-by-id returns 404 (does not reveal existence)', async () => {
      const res = await request(app)
        .get('/api/v1/phc/facility/fac-phc-002')
        .set('Authorization', `Bearer ${phcStaffAToken}`);

      // Must be 404 to avoid leaking existence of Facility B
      expect(res.status).toBe(404);
      expect(res.body.error.message).toContain('not found');
    });

    it('Staff A accessing Facility B via query filter parameter returns 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/phc/summary')
        .query({ facilityId: 'fac-phc-002' })
        .set('Authorization', `Bearer ${phcStaffAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Unauthorized facility access');
    });

    it('Staff B can access their own Facility B operational data', async () => {
      const res = await request(app)
        .get('/api/v1/phc/facility/fac-phc-002')
        .set('Authorization', `Bearer ${phcStaffBToken}`);

      expect(res.status).toBe(200);
      expect(res.body.facility.facilityId).toBe('fac-phc-002');
      // Staff view includes operational capacity
      expect(res.body.facility.capacityPerDay).toBeDefined();
    });
  });

  describe('4. Honest Dashboard Aggregation (No Fabricated Counts)', () => {
    it('returns exact count of stored signals for Facility A (not hard-coded 48)', async () => {
      const res = await request(app)
        .get('/api/v1/phc/summary')
        .set('Authorization', `Bearer ${phcStaffAToken}`);

      expect(res.status).toBe(200);
      const summary = res.body.summary;

      // Exactly the 5 seeded signals
      expect(summary.totalScreenings).toBe(5);
      expect(summary.highRiskCases).toBe(2);
      expect(summary.feverCases).toBe(3);
      expect(summary.respiratoryCases).toBe(2);
      expect(summary.isEmpty).toBe(false);
      expect(summary.isDemoData).toBe(true); // Default mock facility
    });

    it('returns explicit empty state (isEmpty: true, count: 0) when facility has no signals', async () => {
      const res = await request(app)
        .get('/api/v1/phc/summary')
        .set('Authorization', `Bearer ${emptyPhcStaffToken}`);

      expect(res.status).toBe(200);
      const summary = res.body.summary;

      expect(summary.totalScreenings).toBe(0);
      expect(summary.highRiskCases).toBe(0);
      expect(summary.feverCases).toBe(0);
      expect(summary.respiratoryCases).toBe(0);
      expect(summary.isEmpty).toBe(true);
    });
  });

  describe('5. Small-Group Privacy Suppression in District Aggregates', () => {
    it('suppresses counts below 3 as "<3" in district summary', async () => {
      const res = await request(app)
        .get('/api/v1/district/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const summary = res.body.summary;
      expect(summary.districtCode).toBe('PUNE');
      // High risk count in PUNE is 2 (< 3), so it must be suppressed to '<3'
      expect(summary.highRiskCases).toBe('<3');
    });

    it('suppresses counts below 3 in district syndromic aggregates', async () => {
      const res = await request(app)
        .get('/api/v1/district/aggregates')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.aggregates.length).toBeGreaterThan(0);

      // Verify any cell with count < 3 is represented as literal '<3'
      for (const agg of res.body.aggregates) {
        if (typeof agg.count === 'string') {
          expect(agg.count).toBe('<3');
        } else {
          expect(agg.count).toBeGreaterThanOrEqual(3);
        }
      }
    });
  });

  describe('6. Staff Cross-Record Audit Logging', () => {
    it('creates an AuditEvent document when staff accesses cross-record dashboard', async () => {
      const countBefore = await AuditEvent.countDocuments({ action: 'PHC_SUMMARY_READ' });

      const res = await request(app)
        .get('/api/v1/phc/summary')
        .set('Authorization', `Bearer ${phcStaffAToken}`);

      expect(res.status).toBe(200);

      const countAfter = await AuditEvent.countDocuments({ action: 'PHC_SUMMARY_READ' });
      expect(countAfter).toBe(countBefore + 1);

      const latestAudit = await AuditEvent.findOne({ action: 'PHC_SUMMARY_READ' }).sort({ createdAt: -1 });
      expect(latestAudit).toBeDefined();
      expect(latestAudit?.actorRole).toBe('PHC_OFFICER');
      expect(latestAudit?.resourceType).toBe('Facility');
    });
  });
});
