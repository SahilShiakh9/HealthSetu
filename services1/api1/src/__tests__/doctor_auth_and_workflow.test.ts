import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { Doctor } from '../models/Doctor.js';
import { Facility } from '../models/Facility.js';
import { DoctorAffiliation } from '../models/DoctorAffiliation.js';
import { User } from '../models/User.js';

describe('Doctor Professional Onboarding, Affiliation & Discovery Suite', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  let testFacilityId = '';
  let doctorToken = '';
  let doctorUserId = '';
  let hospitalAdminToken = '';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDb(mongoServer.getUri());

    // Create a seed facility for affiliation tests
    const fac = await Facility.create({
      facilityId: 'fac-pabal-01',
      name: 'Primary Health Centre Pabal',
      type: 'PHC',
      address: 'Pabal, Shirur',
      districtCode: 'PUNE',
      phone: '9822001122',
      location: { type: 'Point', coordinates: [74.0512, 18.8291] },
      services: ['OPD', 'TELEMEDICINE'],
      servicesMask: 1,
      open24x7: true,
      openHours: '24/7',
      emergencyCapable: false,
      dataSource: 'MANUAL_VERIFIED',
      isMock: false,
      organizationStatus: 'APPROVED',
      adminUserIds: [],
      updatedAtTimestamp: Date.now(),
    });
    testFacilityId = fac._id.toString();
  }, 60000);

  afterAll(async () => {
    await disconnectDb();
    if (mongoServer) {
      await mongoServer.stop();
    }
  }, 30000);

  describe('1. Doctor Registration Validation & Safety', () => {
    it('rejects registration when medical registration number or council is missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/doctor/register')
        .send({
          name: 'Dr. Suresh Patil',
          email: 'suresh@healthsetu.org',
          phone: '9876543210',
          password: 'Password123!',
          confirmPassword: 'Password123!',
          qualification: 'MBBS',
          // missing registrationNumber and medicalCouncil
          registrationYear: 2018,
          experienceYears: 6,
          specialties: ['General Physician'],
          languages: ['en', 'hi'],
          agreedToTerms: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects registration when passwords do not match', async () => {
      const res = await request(app)
        .post('/api/v1/auth/doctor/register')
        .send({
          name: 'Dr. Suresh Patil',
          email: 'suresh@healthsetu.org',
          phone: '9876543210',
          password: 'Password123!',
          confirmPassword: 'DifferentPassword!',
          qualification: 'MBBS',
          registrationNumber: 'MMC/2018/12345',
          medicalCouncil: 'Maharashtra Medical Council',
          registrationYear: 2018,
          experienceYears: 6,
          specialties: ['General Physician'],
          languages: ['en', 'hi'],
          agreedToTerms: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/Passwords do not match/i);
    });

    it('submits valid doctor registration in PENDING verification status', async () => {
      const res = await request(app)
        .post('/api/v1/auth/doctor/register')
        .send({
          name: 'Dr. Suresh Patil',
          email: 'suresh@healthsetu.org',
          phone: '9876543210',
          password: 'Password123!',
          confirmPassword: 'Password123!',
          qualification: 'MBBS',
          additionalQualification: 'MD Medicine',
          registrationNumber: 'MMC/2018/12345',
          medicalCouncil: 'Maharashtra Medical Council',
          registrationYear: 2018,
          experienceYears: 6,
          specialties: ['General Physician', 'Cardiology'],
          languages: ['en', 'hi', 'mr'],
          facilityId: testFacilityId,
          roleInFacility: 'CONSULTANT',
          affiliationNotes: 'Requesting telemedicine panel empanelment',
          bio: 'General Physician with 6 years experience in rural primary care.',
          agreedToTerms: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.role).toBe('DOCTOR');
      expect(res.body.doctor.verificationStatus).toBe('PENDING');

      doctorToken = res.body.accessToken;
      doctorUserId = res.body.user.id;

      // Verify Doctor record in MongoDB
      const docRecord = await Doctor.findOne({ userId: doctorUserId });
      expect(docRecord).toBeDefined();
      expect(docRecord?.verificationStatus).toBe('PENDING');
      expect(docRecord?.registrationNumber).toBe('MMC/2018/12345');
      expect(docRecord?.specialties).toContain('General Physician');

      // Verify DoctorAffiliation pending request created
      const affRecord = await DoctorAffiliation.findOne({ doctorUserId });
      expect(affRecord).toBeDefined();
      expect(affRecord?.status).toBe('PENDING');
      expect(affRecord?.roleInFacility).toBe('CONSULTANT');
    });

    it('prevents duplicate doctor registration with identical email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/doctor/register')
        .send({
          name: 'Dr. Suresh Patil Duplicate',
          email: 'suresh@healthsetu.org',
          phone: '9876543211',
          password: 'Password123!',
          confirmPassword: 'Password123!',
          qualification: 'MBBS',
          registrationNumber: 'MMC/2018/99999',
          medicalCouncil: 'Maharashtra Medical Council',
          registrationYear: 2019,
          experienceYears: 4,
          specialties: ['General Physician'],
          languages: ['en'],
          agreedToTerms: true,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('USER_ALREADY_EXISTS');
    });
  });

  describe('2. Hospital Organization Registration', () => {
    it('registers a new hospital organization with hospital administrator credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/hospital/register')
        .send({
          facilityName: 'Shirur Sub-District Hospital',
          facilityType: 'SDH',
          address: 'Station Road, Shirur',
          district: 'Pune',
          state: 'Maharashtra',
          pincode: '412210',
          phone: '9823456789',
          adminName: 'Dr. Ashok Varma, MS',
          adminEmail: 'admin.shirur@healthsetu.org',
          adminPassword: 'HospitalPassword123!',
          confirmPassword: 'HospitalPassword123!',
        });

      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.role).toBe('HOSPITAL_ADMIN');
      expect(res.body.facility.name).toBe('Shirur Sub-District Hospital');

      hospitalAdminToken = res.body.accessToken;

      // Verify facility and user linked
      const createdFac = await Facility.findById(res.body.facility.id);
      expect(createdFac).toBeDefined();
      expect(createdFac?.adminUserIds.map((id) => id.toString())).toContain(res.body.user.id);
    });
  });

  describe('3. Doctor Status & Verification Review Flow', () => {
    it('allows registered doctor to check their verification and affiliation status', async () => {
      const res = await request(app)
        .get('/api/v1/doctor/status')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.verificationStatus).toBe('PENDING');
      expect(res.body.doctor.name).toBe('Dr. Suresh Patil');
      expect(res.body.affiliations).toHaveLength(1);
      expect(res.body.affiliations[0].status).toBe('PENDING');
    });

    it('unverified doctor does not appear in public patient search', async () => {
      const res = await request(app)
        .get('/api/v1/doctors?specialty=General Physician');

      expect(res.status).toBe(200);
      const sPatil = res.body.doctors.find((d: any) => d.name === 'Dr. Suresh Patil');
      expect(sPatil).toBeUndefined(); // Only APPROVED doctors are returned publicly
    });

    it('hospital administrator approves doctor verification and affiliation', async () => {
      const patchRes = await request(app)
        .patch(`/api/v1/doctors/${doctorUserId}/verification`)
        .set('Authorization', `Bearer ${hospitalAdminToken}`)
        .send({
          status: 'APPROVED',
          reviewerNotes: 'Registration MMC/2018/12345 verified with Maharashtra Medical Council portal.',
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.doctor.verificationStatus).toBe('APPROVED');

      // Verify doctor record updated in database
      const doc = await Doctor.findOne({ userId: doctorUserId });
      expect(doc?.verificationStatus).toBe('APPROVED');
      expect(doc?.availability).toBe('AVAILABLE');
    });

    it('verified doctor now appears in public patient specialty search with sanitized profile', async () => {
      const res = await request(app)
        .get('/api/v1/doctors?specialty=General Physician');

      expect(res.status).toBe(200);
      const sPatil = res.body.doctors.find((d: any) => d.name === 'Dr. Suresh Patil');
      expect(sPatil).toBeDefined();
      expect(sPatil.qualification).toBe('MBBS');
      expect(sPatil.specialties).toContain('General Physician');
      expect(sPatil.verificationStatus).toBe('APPROVED');
      expect(sPatil.availability).toBe('AVAILABLE');
      // Ensure private credentials are never exposed
      expect(sPatil.passwordHash).toBeUndefined();
    });

    it('returns single verified doctor profile at /api/v1/doctors/:id', async () => {
      const res = await request(app)
        .get(`/api/v1/doctors/${doctorUserId}`);

      expect(res.status).toBe(200);
      expect(res.body.doctor.name).toBe('Dr. Suresh Patil');
      expect(res.body.doctor.registrationNumber).toBe('MMC/2018/12345');
      expect(res.body.doctor.experienceYears).toBe(6);
      expect(res.body.doctor.bio).toContain('General Physician with 6 years experience');
    });
  });
});
