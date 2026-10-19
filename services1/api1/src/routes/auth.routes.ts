import { Router, type Response } from 'express';
import {
  RequestOtpSchema,
  VerifyOtpSchema,
  RegisterUserSchema,
  LoginUserSchema,
  PatientRegisterSchema,
  PatientLoginSchema,
  DoctorRegisterSchema,
  HospitalRegisterSchema,
} from '@healthsetu/contracts';
import { AuthService, verifyAccessToken } from '../services/auth.service.js';
import { requireAuth } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Patient } from '../models/Patient.js';
import { AppError } from '../middleware/errorHandler.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';

export const authRouter = Router();

// Rate limiter for patient registration & login endpoints (prevents brute-force)
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many authentication attempts. Please try again after 15 minutes.',
});

// Strict no-store for all authentication and session endpoints
authRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
});

const setRefreshCookie = (res: Response, rawRefreshToken: string) => {
  res.cookie('refreshToken', rawRefreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    // Vercel and Render are different sites, so the refresh cookie must be
    // sent on cross-origin fetch requests from the deployed frontend.
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/api/v1/auth',
    maxAge: 7 * 24 * 3600 * 1000, // 7 days
  });
};

const clearRefreshCookie = (res: Response) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/api/v1/auth',
    maxAge: 0,
  });
};

// POST /api/v1/auth/otp/request
authRouter.post('/auth/otp/request', async (req, res, next) => {
  try {
    const input = RequestOtpSchema.parse(req.body);
    const code = await AuthService.requestOtp(input.identifier, input.purpose, req.ip);
    res.status(200).json({
      message: 'OTP sent successfully',
      identifier: input.identifier,
      ...(env.NODE_ENV !== 'production' ? { devCode: code } : {}),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/otp/verify
authRouter.post('/auth/otp/verify', async (req, res, next) => {
  try {
    const input = VerifyOtpSchema.parse(req.body);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const { accessToken, rawRefreshToken, user, isNewUser } = await AuthService.verifyOtp(
      input.identifier,
      input.code,
      input.role,
      input.name,
      input.language,
      userAgent,
      req.ip,
    );

    setRefreshCookie(res, rawRefreshToken);

    res.status(200).json({
      accessToken,
      isNewUser,
      user: {
        id: user._id.toString(),
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        language: user.language,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/patient/register (Dedicated Patient Registration)
authRouter.post('/auth/patient/register', authRateLimiter, async (req, res, next) => {
  try {
    const input = PatientRegisterSchema.parse(req.body);
    const { user, patient } = await AuthService.registerPatient({
      ...input,
      ip: req.ip,
    });

    const userAgent = req.headers['user-agent'] || 'Unknown';
    const { accessToken, rawRefreshToken } = await AuthService.loginPatientWithPhone(
      input.phone,
      input.password,
      userAgent,
      req.ip,
    );

    setRefreshCookie(res, rawRefreshToken);

    res.status(201).json({
      accessToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        language: user.language,
        age: patient?.age,
        dateOfBirth: patient?.dateOfBirth ? patient.dateOfBirth.toISOString().split('T')[0] : undefined,
        ageBand: patient?.ageBand,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/patient/login (Dedicated Patient Login with Phone + Password)
authRouter.post('/auth/patient/login', authRateLimiter, async (req, res, next) => {
  try {
    const input = PatientLoginSchema.parse(req.body);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const { accessToken, rawRefreshToken, user, patient } = await AuthService.loginPatientWithPhone(
      input.phone,
      input.password,
      userAgent,
      req.ip,
    );

    setRefreshCookie(res, rawRefreshToken);

    res.status(200).json({
      accessToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        language: user.language,
        age: patient?.age,
        dateOfBirth: patient?.dateOfBirth ? patient.dateOfBirth.toISOString().split('T')[0] : undefined,
        ageBand: patient?.ageBand,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/register (Doctors, PHC officers, Admins with email + password)
authRouter.post('/auth/register', async (req, res, next) => {
  try {
    const input = RegisterUserSchema.parse(req.body);
    const user = await AuthService.registerPasswordUser({
      ...input,
      ip: req.ip,
    });

    const userAgent = req.headers['user-agent'] || 'Unknown';
    const { accessToken, rawRefreshToken } = await AuthService.loginWithPassword(
      input.email,
      input.password,
      userAgent,
      req.ip,
    );

    setRefreshCookie(res, rawRefreshToken);

    res.status(201).json({
      accessToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        language: user.language,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/doctor/register (Comprehensive Professional Doctor Registration)
authRouter.post('/auth/doctor/register', authRateLimiter, async (req, res, next) => {
  try {
    const input = DoctorRegisterSchema.parse(req.body);
    const { user, doctor } = await AuthService.registerDoctor({
      ...input,
      ip: req.ip,
    });

    const userAgent = req.headers['user-agent'] || 'Unknown';
    const { accessToken, rawRefreshToken } = await AuthService.loginWithPassword(
      input.email,
      input.password,
      userAgent,
      req.ip,
    );

    setRefreshCookie(res, rawRefreshToken);

    res.status(201).json({
      accessToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        language: user.language,
        isActive: user.isActive,
      },
      doctor: {
        id: doctor._id.toString(),
        qualification: doctor.qualification,
        registrationNumber: doctor.registrationNumber,
        specialties: doctor.specialties,
        verificationStatus: doctor.verificationStatus,
        availability: doctor.availability,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/hospital/register (Healthcare Facility / Hospital Onboarding)
authRouter.post('/auth/hospital/register', authRateLimiter, async (req, res, next) => {
  try {
    const input = HospitalRegisterSchema.parse(req.body);
    const { user, facility } = await AuthService.registerHospital({
      ...input,
      ip: req.ip,
    });

    const userAgent = req.headers['user-agent'] || 'Unknown';
    const { accessToken, rawRefreshToken } = await AuthService.loginWithPassword(
      input.adminEmail,
      input.adminPassword,
      userAgent,
      req.ip,
    );

    setRefreshCookie(res, rawRefreshToken);

    res.status(201).json({
      accessToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        language: user.language,
        facilityId: facility._id.toString(),
        isActive: user.isActive,
      },
      facility: {
        id: facility._id.toString(),
        name: facility.name,
        type: facility.type,
        district: facility.district,
        state: facility.state,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/login (Email + Password)
authRouter.post('/auth/login', async (req, res, next) => {
  try {
    const input = LoginUserSchema.parse(req.body);
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const { accessToken, rawRefreshToken, user } = await AuthService.loginWithPassword(
      input.email,
      input.password,
      userAgent,
      req.ip,
    );

    setRefreshCookie(res, rawRefreshToken);

    res.status(200).json({
      accessToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        language: user.language,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/refresh (Rotate refresh token)
authRouter.post('/auth/refresh', async (req, res, next) => {
  try {
    const rawToken = req.cookies?.refreshToken;
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const { accessToken, rawRefreshToken } = await AuthService.rotateRefreshToken(
      rawToken,
      userAgent,
      req.ip,
    );

    setRefreshCookie(res, rawRefreshToken);

    res.status(200).json({ accessToken });
  } catch (err) {
    clearRefreshCookie(res);
    next(err);
  }
});

// POST /api/v1/auth/logout (Idempotent session & refresh family revocation)
authRouter.post('/auth/logout', async (req, res) => {
  try {
    const rawToken = req.cookies?.refreshToken;
    let sid: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const payload = await verifyAccessToken(token);
        sid = payload.sid;
      } catch {
        // Best effort decoding for logout
      }
    }

    await AuthService.logout(rawToken, sid);
    clearRefreshCookie(res);

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.status(204).end();
  } catch {
    clearRefreshCookie(res);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.status(204).end();
  }
});

// GET /api/v1/auth/me
authRouter.get('/auth/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user!.id);
    if (!user) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'User not found',
      });
    }

    let patientData: { age?: number; dateOfBirth?: string; ageBand?: string } = {};
    if (user.role === 'PATIENT' || user.role === 'ASHA') {
      const patient = await Patient.findOne({ userId: user._id });
      if (patient) {
        patientData = {
          age: patient.age,
          dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.toISOString().split('T')[0] : undefined,
          ageBand: patient.ageBand,
        };
      }
    }

    res.status(200).json({
      user: {
        id: user._id.toString(),
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        language: user.language,
        isActive: user.isActive,
        ...patientData,
      },
    });
  } catch (err) {
    next(err);
  }
});
