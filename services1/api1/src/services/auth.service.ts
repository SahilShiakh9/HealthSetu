import crypto from 'crypto';
import { Types } from 'mongoose';
import * as jose from 'jose';
import argon2 from 'argon2';
import { User, type IUser } from '../models/User.js';
import { Patient, type IPatient } from '../models/Patient.js';
import { Doctor, type IDoctor } from '../models/Doctor.js';
import { Facility } from '../models/Facility.js';
import { DoctorAffiliation } from '../models/DoctorAffiliation.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { OtpCode } from '../models/OtpCode.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { env } from '../config/env.js';
import { AppError } from '../middleware/errorHandler.js';
import { ConsoleOtpProvider } from '../providers/otp/ConsoleOtpProvider.js';
import type { OtpProvider } from '../providers/otp/OtpProvider.js';
import type {
  Role,
  Language,
  AgeBand,
  RegisterUserInput,
  PatientRegisterInput,
  DoctorRegisterInput,
  HospitalRegisterInput,
} from '@healthsetu/contracts';

export const computeAgeBand = (age?: number, dob?: Date): AgeBand | undefined => {
  let effectiveAge = age;
  if (effectiveAge === undefined && dob && !isNaN(dob.getTime())) {
    const diffMs = Date.now() - dob.getTime();
    effectiveAge = Math.floor(diffMs / (365.25 * 24 * 3600 * 1000));
  }
  if (effectiveAge === undefined || effectiveAge < 0) return undefined;
  if (effectiveAge <= 10) return '0-10';
  if (effectiveAge <= 20) return '11-20';
  if (effectiveAge <= 30) return '21-30';
  if (effectiveAge <= 40) return '31-40';
  if (effectiveAge <= 50) return '41-50';
  if (effectiveAge <= 60) return '51-60';
  return '61+';
};

const otpProvider: OtpProvider = new ConsoleOtpProvider();

import { Session } from '../models/Session.js';

interface CachedSession {
  isValid: boolean;
  expiresAt: number;
}
const sessionCache = new Map<string, CachedSession>();

export const invalidateSessionCache = (sid?: string): void => {
  if (sid) sessionCache.delete(sid);
};

export const checkSessionValid = async (sid: string): Promise<boolean> => {
  const now = Date.now();
  const cached = sessionCache.get(sid);
  if (cached && cached.expiresAt > now) {
    return cached.isValid;
  }

  const session = await Session.findOne({ sid });
  if (!session || session.revokedAt) {
    sessionCache.set(sid, { isValid: false, expiresAt: now + 10000 });
    return false;
  }

  // Update last seen asynchronously
  Session.updateOne({ sid }, { $set: { lastSeenAt: new Date() } }).catch(() => {});

  sessionCache.set(sid, { isValid: true, expiresAt: now + 10000 });
  return true;
};

export const hashSecret = (secret: string): string => {
  return crypto
    .createHash('sha256')
    .update(secret + env.REFRESH_TOKEN_PEPPER)
    .digest('hex');
};

export const createAccessToken = async (user: IUser, sid?: string): Promise<string> => {
  const activeSid = sid || crypto.randomUUID();
  const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

  // If a synthetic or standalone sid is passed and doesn't exist in sessions yet, register it
  if (!sid) {
    await Session.create({
      userId: user._id,
      sid: activeSid,
      refreshFamilyId: crypto.randomUUID(),
      lastSeenAt: new Date(),
    }).catch(() => {});
  }

  return new jose.SignJWT({
    role: user.role,
    name: user.name,
    language: user.language,
    sid: activeSid,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user._id.toString())
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret);
};

export const verifyAccessToken = async (
  token: string,
): Promise<{ sub: string; role: Role; name: string; language: Language; sid?: string }> => {
  try {
    const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
    const { payload } = await jose.jwtVerify(token, secret);
    return {
      sub: payload.sub as string,
      role: payload.role as Role,
      name: payload.name as string,
      language: payload.language as Language,
      sid: payload.sid as string | undefined,
    };
  } catch (err) {
    throw new AppError({
      code: 'UNAUTHORIZED',
      statusCode: 401,
      message: 'Invalid or expired access token',
      details: err instanceof Error ? err.message : undefined,
    });
  }
};

export const issueRefreshToken = async (
  userId: string,
  familyId?: string,
  userAgent?: string,
): Promise<{ rawToken: string; expiresAt: Date; familyId: string }> => {
  const rawToken = `${crypto.randomUUID()}.${crypto.randomBytes(32).toString('hex')}`;
  const tokenHash = hashSecret(rawToken);
  const activeFamilyId = familyId || crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7 days

  await RefreshToken.create({
    userId,
    tokenHash,
    familyId: activeFamilyId,
    expiresAt,
    userAgent: userAgent || 'Unknown',
  });

  return { rawToken, expiresAt, familyId: activeFamilyId };
};

export class AuthService {
  static async requestOtp(identifier: string, purpose: string = 'LOGIN', ip?: string): Promise<string> {
    const cleanId = identifier.trim().toLowerCase();

    // Rate-limit check: max 5 active OTP requests in 10 minutes
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const count = await OtpCode.countDocuments({
      identifier: cleanId,
      createdAt: { $gte: tenMinAgo },
    });

    if (count >= 5) {
      throw new AppError({
        code: 'RATE_LIMIT_EXCEEDED',
        statusCode: 429,
        message: 'Too many OTP requests. Please wait a few minutes.',
      });
    }

    // Generate 6 digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = hashSecret(code);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await OtpCode.create({
      identifier: cleanId,
      codeHash,
      purpose,
      expiresAt,
      attempts: 0,
    });

    await otpProvider.sendOtp(cleanId, code, purpose);

    await AuditEvent.create({
      action: 'OTP_REQUESTED',
      resourceType: 'OTP',
      resourceId: cleanId,
      ip,
      at: new Date(),
    });

    return code;
  }

  static async verifyOtp(
    identifier: string,
    code: string,
    roleOverride?: Role,
    nameOverride?: string,
    languageOverride?: Language,
    userAgent?: string,
    ip?: string,
  ): Promise<{ accessToken: string; rawRefreshToken: string; user: IUser; isNewUser: boolean }> {
    const cleanId = identifier.trim().toLowerCase();

    const otpDoc = await OtpCode.findOne({
      identifier: cleanId,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!otpDoc) {
      throw new AppError({
        code: 'INVALID_OTP',
        statusCode: 400,
        message: 'Invalid or expired OTP code',
      });
    }

    if (otpDoc.attempts >= 5) {
      await OtpCode.deleteOne({ _id: otpDoc._id });
      throw new AppError({
        code: 'OTP_MAX_ATTEMPTS',
        statusCode: 400,
        message: 'Max OTP attempts exceeded. Please request a new code.',
      });
    }

    const inputHash = hashSecret(code);
    if (inputHash !== otpDoc.codeHash) {
      otpDoc.attempts += 1;
      await otpDoc.save();
      throw new AppError({
        code: 'INVALID_OTP',
        statusCode: 400,
        message: 'Incorrect verification code',
      });
    }

    // Burn OTP
    await OtpCode.deleteOne({ _id: otpDoc._id });

    // Find or create user
    const isEmail = cleanId.includes('@');
    const query = isEmail ? { email: cleanId } : { phone: cleanId };

    let user = await User.findOne(query);
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      const initialRole: Role = roleOverride || (isEmail ? 'DOCTOR' : 'PATIENT');
      const initialName = nameOverride || (isEmail ? cleanId.split('@')[0] : `User ${cleanId.slice(-4)}`);

      user = await User.create({
        ...(isEmail ? { email: cleanId } : { phone: cleanId }),
        name: initialName,
        role: initialRole,
        language: languageOverride || 'hi',
        isActive: true,
        lastLoginAt: new Date(),
      });

      if (initialRole === 'PATIENT' || initialRole === 'ASHA') {
        await Patient.create({
          userId: user._id,
          consentRefs: [],
        });
      } else if (initialRole === 'DOCTOR') {
        await Doctor.create({
          userId: user._id,
          verificationStatus: 'PENDING',
          availability: 'OFFLINE',
          specialties: ['General Physician'],
          languages: ['en', 'hi'],
          experienceYears: 1,
        });
      }
    } else {
      user.lastLoginAt = new Date();
      if (languageOverride) user.language = languageOverride;
      await user.save();
    }

    const sid = crypto.randomUUID();
    const { rawToken, familyId } = await issueRefreshToken(user._id.toString(), undefined, userAgent);
    await Session.create({
      userId: user._id,
      sid,
      refreshFamilyId: familyId,
      userAgent: userAgent || 'Unknown',
      lastSeenAt: new Date(),
    });
    const accessToken = await createAccessToken(user, sid);

    await AuditEvent.create({
      actorId: user._id,
      actorRole: user.role,
      action: isNewUser ? 'USER_REGISTERED_OTP' : 'USER_LOGIN_OTP',
      resourceType: 'User',
      resourceId: user._id.toString(),
      ip,
      at: new Date(),
    });

    return { accessToken, rawRefreshToken: rawToken, user, isNewUser };
  }

  static async registerPasswordUser(data: RegisterUserInput & { ip?: string }): Promise<IUser> {
    const cleanEmail = data.email.trim().toLowerCase();

    const existing = await User.findOne({ email: cleanEmail });
    if (existing) {
      throw new AppError({
        code: 'USER_ALREADY_EXISTS',
        statusCode: 409,
        message: 'A user with this email already exists',
      });
    }

    const passwordHash = await argon2.hash(data.password);

    const user = await User.create({
      email: cleanEmail,
      phone: data.phone,
      name: data.name,
      role: data.role,
      language: data.language || 'en',
      facilityId: data.facilityId,
      facilityIds: data.facilityId ? [data.facilityId] : [],
      districtCode: data.districtCode,
      passwordHash,
      isActive: true,
    });

    if (data.role === 'DOCTOR') {
      await Doctor.create({
        userId: user._id,
        specialties: data.specialties || ['General Physician'],
        registrationNumber: data.registrationNumber || 'PENDING',
        qualification: data.qualification || 'MBBS',
        experienceYears: data.experienceYears || 1,
        districtCode: data.districtCode,
        verificationStatus: 'PENDING',
        availability: 'OFFLINE',
      });

      if (data.facilityId) {
        const fac = await Facility.findOne({
          $or: [
            ...(Types.ObjectId.isValid(data.facilityId) ? [{ _id: new Types.ObjectId(data.facilityId) }] : []),
            { facilityId: data.facilityId },
          ],
        });
        if (fac) {
          await DoctorAffiliation.create({
            doctorUserId: user._id,
            facilityId: fac._id,
            status: 'PENDING',
            roleInFacility: 'CONSULTANT',
            requestedBy: user._id,
            notes: 'Requested during doctor registration',
          });
        }
      }
    } else if (data.role === 'HOSPITAL_ADMIN' && data.facilityId) {
      await Facility.findOneAndUpdate(
        {
          $or: [
            ...(Types.ObjectId.isValid(data.facilityId) ? [{ _id: new Types.ObjectId(data.facilityId) }] : []),
            { facilityId: data.facilityId },
          ],
        },
        {
          $addToSet: { adminUserIds: user._id },
        },
      );
    }

    await AuditEvent.create({
      actorId: user._id,
      actorRole: user.role,
      action: 'USER_REGISTERED_PASSWORD',
      resourceType: 'User',
      resourceId: user._id.toString(),
      ip: data.ip,
      at: new Date(),
    });

    return user;
  }

  static async registerDoctor(data: DoctorRegisterInput & { ip?: string }): Promise<{ user: IUser; doctor: IDoctor }> {
    const cleanEmail = data.email.trim().toLowerCase();

    const existingEmail = await User.findOne({ email: cleanEmail });
    if (existingEmail) {
      throw new AppError({
        code: 'USER_ALREADY_EXISTS',
        statusCode: 409,
        message: 'A user with this email address already exists',
      });
    }

    const cleanPhone = data.phone.trim();
    const existingPhone = await User.findOne({ phone: cleanPhone });
    if (existingPhone) {
      throw new AppError({
        code: 'PHONE_ALREADY_REGISTERED',
        statusCode: 409,
        message: 'A user with this mobile number already exists',
      });
    }

    const passwordHash = await argon2.hash(data.password);

    let facilityObjId: Types.ObjectId | undefined;
    if (data.facilityId) {
      if (Types.ObjectId.isValid(data.facilityId)) {
        facilityObjId = new Types.ObjectId(data.facilityId);
      } else {
        const fac = await Facility.findOne({ facilityId: data.facilityId });
        if (fac) {
          facilityObjId = fac._id as Types.ObjectId;
        }
      }
    }

    const user = await User.create({
      email: cleanEmail,
      phone: cleanPhone,
      name: data.name.trim(),
      role: 'DOCTOR',
      language: (data.languages && (data.languages[0] as Language)) || 'en',
      facilityId: facilityObjId ? facilityObjId.toString() : undefined,
      facilityIds: facilityObjId ? [facilityObjId.toString()] : [],
      passwordHash,
      isActive: true,
    });

    const doctor = await Doctor.create({
      userId: (user as any)._id,
      qualification: data.qualification.trim(),
      additionalQualification: data.additionalQualification?.trim() || '',
      registrationNumber: data.registrationNumber.trim(),
      medicalCouncil: data.medicalCouncil.trim(),
      registrationYear: data.registrationYear,
      experienceYears: data.experienceYears,
      languages: data.languages,
      specialties: data.specialties,
      consultationModes: data.consultationModes || ['VIDEO', 'AUDIO'],
      facilityId: facilityObjId,
      bio: data.bio?.trim() || '',
      verificationStatus: 'PENDING',
      availability: 'AVAILABLE',
    });

    if (facilityObjId) {
      await DoctorAffiliation.create({
        doctorUserId: (user as any)._id,
        facilityId: facilityObjId,
        status: 'PENDING',
        roleInFacility: data.roleInFacility || 'CONSULTANT',
        requestedBy: (user as any)._id,
        notes: data.affiliationNotes || 'Requested during professional registration',
      });
    }

    await AuditEvent.create({
      actorId: (user as any)._id,
      actorRole: 'DOCTOR',
      action: 'DOCTOR_REGISTERED',
      resourceType: 'Doctor',
      resourceId: (doctor as any)._id.toString(),
      ip: data.ip,
      at: new Date(),
    });

    return { user, doctor };
  }

  static async registerHospital(data: HospitalRegisterInput & { ip?: string }): Promise<{ user: IUser; facility: any }> {
    const cleanEmail = data.adminEmail.trim().toLowerCase();

    const existingEmail = await User.findOne({ email: cleanEmail });
    if (existingEmail) {
      throw new AppError({
        code: 'USER_ALREADY_EXISTS',
        statusCode: 409,
        message: 'A user with this administrator email address already exists',
      });
    }

    const facilityIdCode = `fac-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const facility = await Facility.create({
      facilityId: facilityIdCode,
      name: data.facilityName.trim(),
      type: data.facilityType,
      address: data.address.trim(),
      districtCode: data.district.trim(),
      phone: data.phone.trim(),
      location: {
        type: 'Point',
        coordinates: [data.lng || 78.4867, data.lat || 17.3850],
      },
      services: ['OPD', 'EMERGENCY', 'TELEMEDICINE'],
      servicesMask: 1,
      open24x7: true,
      openHours: '24/7',
      emergencyCapable: true,
      dataSource: 'MANUAL_VERIFIED',
      isMock: false,
      organizationStatus: 'APPROVED',
      adminUserIds: [],
      updatedAtTimestamp: Date.now(),
    });

    const passwordHash = await argon2.hash(data.adminPassword);

    const user = await User.create({
      email: cleanEmail,
      phone: data.phone.trim(),
      name: data.adminName.trim(),
      role: 'HOSPITAL_ADMIN',
      language: 'en',
      facilityId: (facility as any)._id,
      facilityIds: [(facility as any)._id.toString()],
      districtCode: data.district.trim(),
      passwordHash,
      isActive: true,
    });

    await Facility.findByIdAndUpdate((facility as any)._id, {
      $addToSet: { adminUserIds: (user as any)._id },
    });

    await AuditEvent.create({
      actorId: (user as any)._id,
      actorRole: 'HOSPITAL_ADMIN',
      action: 'HOSPITAL_REGISTERED',
      resourceType: 'Facility',
      resourceId: (facility as any)._id.toString(),
      ip: data.ip,
      at: new Date(),
    });

    return { user, facility };
  }

  static async loginWithPassword(
    email: string,
    password: string,
    userAgent?: string,
    ip?: string,
  ): Promise<{ accessToken: string; rawRefreshToken: string; user: IUser }> {
    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    if (!user || !user.passwordHash) {
      throw new AppError({
        code: 'INVALID_CREDENTIALS',
        statusCode: 401,
        message: 'Invalid email or password',
      });
    }

    const isValid = await argon2.verify(user.passwordHash, password);
    if (!isValid) {
      throw new AppError({
        code: 'INVALID_CREDENTIALS',
        statusCode: 401,
        message: 'Invalid email or password',
      });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const sid = crypto.randomUUID();
    const { rawToken, familyId } = await issueRefreshToken(user._id.toString(), undefined, userAgent);
    await Session.create({
      userId: user._id,
      sid,
      refreshFamilyId: familyId,
      userAgent: userAgent || 'Unknown',
      lastSeenAt: new Date(),
    });
    const accessToken = await createAccessToken(user, sid);

    await AuditEvent.create({
      actorId: user._id,
      actorRole: user.role,
      action: 'USER_LOGIN_PASSWORD',
      resourceType: 'User',
      resourceId: user._id.toString(),
      ip,
      at: new Date(),
    });

    return { accessToken, rawRefreshToken: rawToken, user };
  }

  static async registerPatient(
    data: PatientRegisterInput & { ip?: string },
  ): Promise<{ user: IUser; patient: IPatient }> {
    const cleanPhone = data.phone.trim();

    const existing = await User.findOne({ phone: cleanPhone });
    if (existing) {
      throw new AppError({
        code: 'USER_ALREADY_EXISTS',
        statusCode: 409,
        message: 'A user with this mobile number already exists',
      });
    }

    const passwordHash = await argon2.hash(data.password);

    // CRITICAL: Public patient registration strictly assigns PATIENT role
    const user = await User.create({
      phone: cleanPhone,
      name: data.name.trim(),
      role: 'PATIENT',
      language: data.language || 'en',
      passwordHash,
      isActive: true,
    });

    const parsedDob = data.dateOfBirth ? new Date(data.dateOfBirth) : undefined;
    const computedAgeBand = computeAgeBand(data.age, parsedDob);

    const patient = await Patient.create({
      userId: user._id,
      age: data.age,
      dateOfBirth: parsedDob,
      ageBand: computedAgeBand,
      consentRefs: [],
    });

    await AuditEvent.create({
      actorId: user._id,
      actorRole: 'PATIENT',
      action: 'PATIENT_REGISTERED_PASSWORD',
      resourceType: 'User',
      resourceId: user._id.toString(),
      ip: data.ip,
      at: new Date(),
    });

    return { user, patient };
  }

  static async loginPatientWithPhone(
    phone: string,
    password: string,
    userAgent?: string,
    ip?: string,
  ): Promise<{ accessToken: string; rawRefreshToken: string; user: IUser; patient?: IPatient }> {
    const cleanPhone = phone.trim();
    const user = await User.findOne({ phone: cleanPhone });

    // Generic error message to prevent account enumeration
    if (!user || !user.passwordHash || user.role !== 'PATIENT') {
      throw new AppError({
        code: 'INVALID_CREDENTIALS',
        statusCode: 401,
        message: 'Invalid mobile number or password',
      });
    }

    const isValid = await argon2.verify(user.passwordHash, password);
    if (!isValid) {
      throw new AppError({
        code: 'INVALID_CREDENTIALS',
        statusCode: 401,
        message: 'Invalid mobile number or password',
      });
    }

    if (!user.isActive) {
      throw new AppError({
        code: 'USER_INACTIVE',
        statusCode: 403,
        message: 'Account is deactivated',
      });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const sid = crypto.randomUUID();
    const { rawToken, familyId } = await issueRefreshToken(user._id.toString(), undefined, userAgent);
    await Session.create({
      userId: user._id,
      sid,
      refreshFamilyId: familyId,
      userAgent: userAgent || 'Unknown',
      lastSeenAt: new Date(),
    });
    const accessToken = await createAccessToken(user, sid);

    const patient = await Patient.findOne({ userId: user._id });

    await AuditEvent.create({
      actorId: user._id,
      actorRole: user.role,
      action: 'PATIENT_LOGIN_PASSWORD',
      resourceType: 'User',
      resourceId: user._id.toString(),
      ip,
      at: new Date(),
    });

    return { accessToken, rawRefreshToken: rawToken, user, patient: patient || undefined };
  }

  static async rotateRefreshToken(
    rawToken: string,
    userAgent?: string,
    ip?: string,
  ): Promise<{ accessToken: string; rawRefreshToken: string }> {
    if (!rawToken) {
      throw new AppError({
        code: 'NO_REFRESH_TOKEN',
        statusCode: 401,
        message: 'No refresh token provided in cookie',
      });
    }

    const tokenHash = hashSecret(rawToken);
    const existingToken = await RefreshToken.findOne({ tokenHash });

    if (!existingToken) {
      throw new AppError({
        code: 'INVALID_REFRESH_TOKEN',
        statusCode: 401,
        message: 'Refresh token not recognized',
      });
    }

    // Reuse detection: If token was already revoked, revoke the ENTIRE family AND all sessions!
    if (existingToken.revokedAt) {
      await RefreshToken.updateMany(
        { familyId: existingToken.familyId },
        { $set: { revokedAt: new Date() } },
      );

      const compromisedSessions = await Session.find({ refreshFamilyId: existingToken.familyId });
      for (const s of compromisedSessions) {
        invalidateSessionCache(s.sid);
      }
      await Session.updateMany(
        { refreshFamilyId: existingToken.familyId },
        { $set: { revokedAt: new Date() } },
      );

      await AuditEvent.create({
        actorId: existingToken.userId,
        action: 'TOKEN_REUSE_DETECTED',
        resourceType: 'RefreshTokenFamily',
        resourceId: existingToken.familyId,
        ip,
        at: new Date(),
      });

      throw new AppError({
        code: 'TOKEN_REUSE_DETECTED',
        statusCode: 401,
        message: 'Compromised token reuse detected. All sessions in this family have been terminated.',
      });
    }

    if (existingToken.expiresAt.getTime() < Date.now()) {
      throw new AppError({
        code: 'EXPIRED_REFRESH_TOKEN',
        statusCode: 401,
        message: 'Refresh token expired. Please login again.',
      });
    }

    // Revoke current token
    existingToken.revokedAt = new Date();
    await existingToken.save();

    const user = await User.findById(existingToken.userId);
    if (!user || !user.isActive) {
      throw new AppError({
        code: 'USER_INACTIVE',
        statusCode: 401,
        message: 'User account is inactive or deleted',
      });
    }

    // Issue new token in same family with tracked session
    const sid = crypto.randomUUID();
    await Session.create({
      userId: user._id,
      sid,
      refreshFamilyId: existingToken.familyId,
      userAgent: userAgent || 'Unknown',
      lastSeenAt: new Date(),
    });
    const accessToken = await createAccessToken(user, sid);
    const { rawToken: newRawToken } = await issueRefreshToken(
      user._id.toString(),
      existingToken.familyId,
      userAgent,
    );

    return { accessToken, rawRefreshToken: newRawToken };
  }

  static async logout(rawToken?: string, sid?: string): Promise<void> {
    if (sid) {
      await Session.updateOne({ sid }, { $set: { revokedAt: new Date() } });
      invalidateSessionCache(sid);
    }
    if (rawToken) {
      const tokenHash = hashSecret(rawToken);
      const tokenDoc = await RefreshToken.findOne({ tokenHash });
      if (tokenDoc) {
        // Revoke the entire family and all sessions on explicit logout
        await RefreshToken.updateMany(
          { familyId: tokenDoc.familyId },
          { $set: { revokedAt: new Date() } },
        );
        const sessions = await Session.find({ refreshFamilyId: tokenDoc.familyId });
        for (const s of sessions) {
          invalidateSessionCache(s.sid);
        }
        await Session.updateMany(
          { refreshFamilyId: tokenDoc.familyId },
          { $set: { revokedAt: new Date() } },
        );
      }
    }
  }
}
