import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Patient } from '../models/Patient.js';
import { Doctor } from '../models/Doctor.js';
import { AppError } from '../middleware/errorHandler.js';
import { PatientProfileUpdateSchema } from '@healthsetu/contracts';
import { computeAgeBand } from '../services/auth.service.js';

export const profileRouter = Router();

// GET /api/v1/me/profile - Current authenticated user profile
profileRouter.get('/me/profile', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user!.id);
    if (!user) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'User profile not found',
      });
    }

    const patient = await Patient.findOne({ userId: user._id });
    const doctor = await Doctor.findOne({ userId: user._id });

    res.status(200).json({
      profile: {
        id: user._id.toString(),
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        language: user.language,
        isActive: user.isActive,
        age: patient?.age,
        dateOfBirth: patient?.dateOfBirth ? patient.dateOfBirth.toISOString().split('T')[0] : undefined,
        ageBand: patient?.ageBand,
        gender: patient?.gender,
        villageCode: patient?.villageCode,
        districtCode: patient?.districtCode || doctor?.districtCode,
        verificationStatus: doctor?.verificationStatus,
        availability: doctor?.availability,
      },
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/me/profile - Update own profile (Strict IDOR prevention: self-only via req.user.id)
profileRouter.patch('/me/profile', requireAuth, async (req, res, next) => {
  try {
    const updates = PatientProfileUpdateSchema.parse(req.body);
    const user = await User.findById(req.user!.id);
    if (!user) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'User profile not found',
      });
    }

    if (updates.name) user.name = updates.name;
    if (updates.language) user.language = updates.language;
    await user.save();

    let updatedPatient = null;
    if (user.role === 'PATIENT' || user.role === 'ASHA') {
      const parsedDob = updates.dateOfBirth ? new Date(updates.dateOfBirth) : undefined;
      const computedAgeBand = computeAgeBand(updates.age, parsedDob) || updates.ageBand;

      updatedPatient = await Patient.findOneAndUpdate(
        { userId: user._id },
        {
          $set: {
            ...(updates.age !== undefined && { age: updates.age }),
            ...(parsedDob !== undefined && { dateOfBirth: parsedDob }),
            ...(computedAgeBand !== undefined && { ageBand: computedAgeBand }),
            ...(updates.gender && { gender: updates.gender }),
            ...(updates.villageCode && { villageCode: updates.villageCode }),
            ...(updates.districtCode && { districtCode: updates.districtCode }),
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
    }

    res.status(200).json({
      message: 'Profile updated successfully',
      profile: {
        id: user._id.toString(),
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        language: user.language,
        age: updatedPatient?.age,
        dateOfBirth: updatedPatient?.dateOfBirth ? updatedPatient.dateOfBirth.toISOString().split('T')[0] : undefined,
        ageBand: updatedPatient?.ageBand,
        gender: updatedPatient?.gender,
        villageCode: updatedPatient?.villageCode,
        districtCode: updatedPatient?.districtCode,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/patients/:id - Protected IDOR prevention endpoint
profileRouter.get('/patients/:id', requireAuth, async (req, res, next) => {
  try {
    const targetUserId = req.params.id;
    // If the authenticated user is a patient, they can strictly ONLY access their own profile!
    if (req.user!.role === 'PATIENT' && req.user!.id !== targetUserId) {
      throw new AppError({
        code: 'FORBIDDEN',
        statusCode: 403,
        message: 'Access denied: You are not authorized to view another patient profile',
      });
    }

    const patient = await Patient.findOne({
      $or: [
        { userId: targetUserId },
        ...(targetUserId.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: targetUserId }] : []),
      ],
    });

    if (!patient) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Patient not found',
      });
    }

    // Double check ownership for patient role
    if (req.user!.role === 'PATIENT' && patient.userId.toString() !== req.user!.id) {
      throw new AppError({
        code: 'FORBIDDEN',
        statusCode: 403,
        message: 'Access denied: IDOR violation prevented',
      });
    }

    const user = await User.findById(patient.userId);

    res.status(200).json({
      patient: {
        id: patient._id.toString(),
        userId: patient.userId.toString(),
        name: user?.name,
        phone: user?.phone,
        language: user?.language,
        age: patient.age,
        dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.toISOString().split('T')[0] : undefined,
        ageBand: patient.ageBand,
        gender: patient.gender,
      },
    });
  } catch (err) {
    next(err);
  }
});

