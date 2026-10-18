import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { OtpCode } from '../models/OtpCode.js';
import { hashSecret } from '../services/auth.service.js';

describe('Phase 1 Auth, RBAC, Consent & Token Rotation Suite', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDb(mongoServer.getUri());
  }, 60000);

  afterAll(async () => {
    await disconnectDb();
    if (mongoServer) {
      await mongoServer.stop();
    }
  }, 30000);

  describe('1. OTP Authentication Lifecycle', () => {
    const testPhone = '9876543210';
    let patientAccessToken = '';
    let initialRefreshTokenCookie = '';

    it('requests OTP successfully and stores hashed code', async () => {
      const res = await request(app)
        .post('/api/v1/auth/otp/request')
        .send({ identifier: testPhone, purpose: 'LOGIN' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('OTP sent successfully');

      // Verify OTP code exists in database
      const otpRecord = await OtpCode.findOne({ identifier: testPhone });
      expect(otpRecord).toBeDefined();
      expect(otpRecord?.attempts).toBe(0);
    });

    it('rejects incorrect OTP code with 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ identifier: testPhone, code: '000000' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_OTP');
    });

    it('verifies correct OTP code, returns access token, and sets httpOnly refresh cookie', async () => {
      // Find the code from database to simulate user entering it
      // Let's create a known code
      const code = '123456';
      await OtpCode.create({
        identifier: testPhone,
        codeHash: hashSecret(code),
        purpose: 'LOGIN',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      const res = await request(app).post('/api/v1/auth/otp/verify').send({
        identifier: testPhone,
        code,
        name: 'Ramesh Patil',
        language: 'mr',
      });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.phone).toBe(testPhone);
      expect(res.body.user.role).toBe('PATIENT');
      expect(res.body.user.language).toBe('mr');

      patientAccessToken = res.body.accessToken;

      // Check cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const refreshCookie = (cookies as unknown as string[]).find((c) => c.startsWith('refreshToken='));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
      initialRefreshTokenCookie = refreshCookie!.split(';')[0];
    });

    it('retrieves current authenticated profile via GET /api/v1/auth/me', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${patientAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Ramesh Patil');
      expect(res.body.user.phone).toBe(testPhone);
    });

    it('updates patient profile via PATCH /api/v1/me/profile', async () => {
      const res = await request(app)
        .patch('/api/v1/me/profile')
        .set('Authorization', `Bearer ${patientAccessToken}`)
        .send({
          ageBand: '41-50',
          gender: 'M',
          villageCode: 'VIL_001',
        });

      expect(res.status).toBe(200);

      // Verify profile fetch
      const profileRes = await request(app)
        .get('/api/v1/me/profile')
        .set('Authorization', `Bearer ${patientAccessToken}`);

      expect(profileRes.status).toBe(200);
      expect(profileRes.body.profile.ageBand).toBe('41-50');
      expect(profileRes.body.profile.villageCode).toBe('VIL_001');
    });

    it('rotates refresh token and detects reuse attempt', async () => {
      // 1. Rotate token using valid cookie
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', initialRefreshTokenCookie);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.accessToken).toBeDefined();

      const newCookies = refreshRes.headers['set-cookie'];
      expect(newCookies).toBeDefined();
      const newRefreshCookie = (newCookies as unknown as string[]).find((c) => c.startsWith('refreshToken='));
      expect(newRefreshCookie).toBeDefined();
      const rotatedCookie = newRefreshCookie!.split(';')[0];
      expect(rotatedCookie).not.toBe(initialRefreshTokenCookie);

      // 2. Reuse attack: Replaying the old (now revoked) refresh token must fail with TOKEN_REUSE_DETECTED
      const reuseRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', initialRefreshTokenCookie);

      expect(reuseRes.status).toBe(401);
      expect(reuseRes.body.error.code).toBe('TOKEN_REUSE_DETECTED');

      // 3. Family revocation: Since reuse was detected, even the rotated cookie should now be invalid!
      const familyCheckRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', rotatedCookie);

      expect(familyCheckRes.status).toBe(401);
      expect(familyCheckRes.body.error.code).toBe('TOKEN_REUSE_DETECTED');
    });
  });

  describe('2. Doctor Password Registration, Login & Role Guards', () => {
    let doctorAccessToken = '';
    let patientAccessToken = '';

    beforeAll(async () => {
      // Create a patient token for role comparison
      const code = '654321';
      const phone = '9999999999';
      await OtpCode.create({
        identifier: phone,
        codeHash: hashSecret(code),
        purpose: 'LOGIN',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      const pRes = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ identifier: phone, code, role: 'PATIENT' });
      patientAccessToken = pRes.body.accessToken;
    });

    it('registers a doctor with email and argon2 password hash', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'dr.deshmukh@healthsetu.org',
        password: 'SecureDoctorPass123!',
        name: 'Dr. Anand Deshmukh',
        role: 'DOCTOR',
        specialties: ['Cardiology', 'General Physician'],
        registrationNumber: 'MCI-2024-8891',
        qualification: 'MBBS, MD',
        experienceYears: 8,
      });

      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.role).toBe('DOCTOR');
      expect(res.body.user.email).toBe('dr.deshmukh@healthsetu.org');
    });

    it('logs in doctor with correct credentials', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'dr.deshmukh@healthsetu.org',
        password: 'SecureDoctorPass123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      doctorAccessToken = res.body.accessToken;
    });

    it('rejects login with wrong password', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        email: 'dr.deshmukh@healthsetu.org',
        password: 'WrongPassword!',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('enforces RBAC on protected test routes', async () => {
      // 1. Unauthenticated -> 401
      const noAuthRes = await request(app).get('/api/v1/test/doctor-only');
      expect(noAuthRes.status).toBe(401);

      // 2. Patient accessing doctor route -> 403 Forbidden
      const patientOnDoctorRes = await request(app)
        .get('/api/v1/test/doctor-only')
        .set('Authorization', `Bearer ${patientAccessToken}`);
      expect(patientOnDoctorRes.status).toBe(403);
      expect(patientOnDoctorRes.body.error.code).toBe('FORBIDDEN');

      // 3. Doctor accessing doctor route -> 200 Allowed
      const doctorOnDoctorRes = await request(app)
        .get('/api/v1/test/doctor-only')
        .set('Authorization', `Bearer ${doctorAccessToken}`);
      expect(doctorOnDoctorRes.status).toBe(200);
      expect(doctorOnDoctorRes.body.allowed).toBe(true);

      // 4. Doctor accessing patient route -> 403 Forbidden
      const doctorOnPatientRes = await request(app)
        .get('/api/v1/test/patient-only')
        .set('Authorization', `Bearer ${doctorAccessToken}`);
      expect(doctorOnPatientRes.status).toBe(403);
    });
  });

  describe('3. Consent Gating and Revocation Lifecycle', () => {
    let userToken = '';
    let consentId = '';

    beforeAll(async () => {
      const code = '112233';
      const phone = '9123456780';
      await OtpCode.create({
        identifier: phone,
        codeHash: hashSecret(code),
        purpose: 'LOGIN',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ identifier: phone, code });
      userToken = res.body.accessToken;
    });

    it('records consent for SCREENING_STORAGE', async () => {
      const res = await request(app)
        .post('/api/v1/consents')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          purpose: 'SCREENING_STORAGE',
          granted: true,
          policyVersion: '1.0.0',
          language: 'hi',
        });

      expect(res.status).toBe(201);
      expect(res.body.consent.purpose).toBe('SCREENING_STORAGE');
      expect(res.body.consent.granted).toBe(true);
      consentId = res.body.consent.id;
    });

    it('lists user consents', async () => {
      const res = await request(app)
        .get('/api/v1/consents/me')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.consents.length).toBeGreaterThan(0);
      expect(res.body.consents[0].id).toBe(consentId);
    });

    it('revokes consent and sets revokedAt timestamp', async () => {
      const res = await request(app)
        .post(`/api/v1/consents/${consentId}/revoke`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.granted).toBe(false);
      expect(res.body.revokedAt).toBeDefined();
    });
  });

  describe('4. Session Lifecycle, Logout Idempotency & Revocation', () => {
    let testToken = '';
    let testCookie = '';

    beforeAll(async () => {
      const code = '123123';
      const phone = '8888888888';
      await OtpCode.create({
        identifier: phone,
        codeHash: hashSecret(code),
        purpose: 'LOGIN',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ identifier: phone, code });

      testToken = res.body.accessToken;
      const cookies = res.headers['set-cookie'];
      testCookie = (cookies as unknown as string[]).find((c) => c.startsWith('refreshToken='))!.split(';')[0];
    });

    it('sets Cache-Control: no-store and Pragma: no-cache on authenticated endpoints', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toContain('no-store');
      expect(res.headers['pragma']).toBe('no-cache');
    });

    it('POST /api/v1/auth/logout is idempotent and returns 204 even without cookie', async () => {
      const res = await request(app).post('/api/v1/auth/logout');
      expect(res.status).toBe(204);
      expect(res.headers['cache-control']).toContain('no-store');
    });

    it('revokes session on logout and rejects subsequent access token requests', async () => {
      // 1. Logout with token and cookie
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${testToken}`)
        .set('Cookie', testCookie);

      expect(logoutRes.status).toBe(204);

      // 2. Access token must now be rejected
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${testToken}`);

      expect(meRes.status).toBe(401);
      expect(meRes.body.error.message).toContain('revoked');

      // 3. Refresh token must also be rejected
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', testCookie);

      expect(refreshRes.status).toBe(401);
    });
  });

  describe('6. Production Patient Authentication, Profile Onboarding & Authorization Suite', () => {
    const patientPhone = '9123456789';
    const patientPassword = 'Patient@Password123';
    let patientAccessToken = '';
    let patientUserId = '';

    it('registers a patient with phone, password, age, and language; strictly enforces PATIENT role', async () => {
      const res = await request(app)
        .post('/api/v1/auth/patient/register')
        .send({
          name: 'Sunita Sharma',
          phone: patientPhone,
          age: 34,
          language: 'mr',
          password: patientPassword,
          confirmPassword: patientPassword,
          role: 'ADMIN', // Attacker attempt to escalate privilege
        });

      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.name).toBe('Sunita Sharma');
      expect(res.body.user.phone).toBe(patientPhone);
      expect(res.body.user.role).toBe('PATIENT'); // Must strictly remain PATIENT
      expect(res.body.user.language).toBe('mr');
      expect(res.body.user.age).toBe(34);
      expect(res.body.user.ageBand).toBe('31-40');

      patientAccessToken = res.body.accessToken;
      patientUserId = res.body.user.id;

      // Verify refresh cookie is set
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const refreshCookie = (cookies as unknown as string[]).find((c) => c.startsWith('refreshToken='));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
    });

    it('rejects duplicate patient phone registration with 409', async () => {
      const res = await request(app)
        .post('/api/v1/auth/patient/register')
        .send({
          name: 'Sunita Sharma Duplicate',
          phone: patientPhone,
          age: 34,
          language: 'en',
          password: patientPassword,
          confirmPassword: patientPassword,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('USER_ALREADY_EXISTS');
    });

    it('rejects registration with password confirmation mismatch', async () => {
      const res = await request(app)
        .post('/api/v1/auth/patient/register')
        .send({
          name: 'Anil Kumar',
          phone: '9234567890',
          age: 28,
          language: 'hi',
          password: 'Password123',
          confirmPassword: 'DifferentPassword123',
        });

      expect(res.status).toBe(400);
    });

    it('rejects registration without age or dateOfBirth', async () => {
      const res = await request(app)
        .post('/api/v1/auth/patient/register')
        .send({
          name: 'Anil Kumar',
          phone: '9234567890',
          language: 'hi',
          password: 'Password123',
          confirmPassword: 'Password123',
        });

      expect(res.status).toBe(400);
    });

    it('logs in patient with valid phone and password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/patient/login')
        .send({
          phone: patientPhone,
          password: patientPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.phone).toBe(patientPhone);
      expect(res.body.user.role).toBe('PATIENT');
      expect(res.body.user.age).toBe(34);
    });

    it('returns generic error on invalid password to prevent account enumeration', async () => {
      const res = await request(app)
        .post('/api/v1/auth/patient/login')
        .send({
          phone: patientPhone,
          password: 'WrongPassword123',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid mobile number or password');
    });

    it('returns identical generic error for non-existent mobile number', async () => {
      const res = await request(app)
        .post('/api/v1/auth/patient/login')
        .send({
          phone: '9999999999',
          password: 'AnyPassword123',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid mobile number or password');
    });

    it('allows authenticated patient to retrieve enriched profile via GET /api/v1/auth/me', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${patientAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Sunita Sharma');
      expect(res.body.user.age).toBe(34);
      expect(res.body.user.ageBand).toBe('31-40');
      expect(res.body.user.role).toBe('PATIENT');
    });

    it('updates patient profile and recalculates ageBand via PATCH /api/v1/me/profile', async () => {
      const res = await request(app)
        .patch('/api/v1/me/profile')
        .set('Authorization', `Bearer ${patientAccessToken}`)
        .send({
          name: 'Sunita R. Sharma',
          age: 45,
          language: 'hi',
          villageCode: 'PABAL-01',
        });

      expect(res.status).toBe(200);
      expect(res.body.profile.name).toBe('Sunita R. Sharma');
      expect(res.body.profile.age).toBe(45);
      expect(res.body.profile.ageBand).toBe('41-50');
      expect(res.body.profile.language).toBe('hi');
      expect(res.body.profile.villageCode).toBe('PABAL-01');
    });

    it('prevents IDOR: patient cannot access another patient profile by ID', async () => {
      // Register a second patient
      const res2 = await request(app)
        .post('/api/v1/auth/patient/register')
        .send({
          name: 'Vijay Deshmukh',
          phone: '9888777666',
          age: 52,
          language: 'mr',
          password: 'Vijay@Password123',
          confirmPassword: 'Vijay@Password123',
        });
      expect(res2.status).toBe(201);
      const otherPatientUserId = res2.body.user.id;

      // Patient 1 attempts to access Patient 2's profile
      const idorRes = await request(app)
        .get(`/api/v1/patients/${otherPatientUserId}`)
        .set('Authorization', `Bearer ${patientAccessToken}`);

      expect(idorRes.status).toBe(403);
      expect(idorRes.body.error.code).toBe('FORBIDDEN');
    });

    it('allows patient to access their own profile via GET /api/v1/patients/:id', async () => {
      const ownRes = await request(app)
        .get(`/api/v1/patients/${patientUserId}`)
        .set('Authorization', `Bearer ${patientAccessToken}`);

      expect(ownRes.status).toBe(200);
      expect(ownRes.body.patient.userId).toBe(patientUserId);
    });

    it('blocks patient from accessing doctor-only routes', async () => {
      const res = await request(app)
        .get('/api/v1/test/doctor-only')
        .set('Authorization', `Bearer ${patientAccessToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});

