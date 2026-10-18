import { Router } from 'express';
import { Types } from 'mongoose';
import { Doctor } from '../models/Doctor.js';
import { User } from '../models/User.js';
import { Facility } from '../models/Facility.js';
import { DoctorAffiliation } from '../models/DoctorAffiliation.js';
import { QueueEntry } from '../models/QueueEntry.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { DoctorVerificationUpdateSchema } from '@healthsetu/contracts';

export const doctorRouter = Router();

/**
 * GET /api/v1/doctors
 * Public patient-facing discovery of verified doctors filtered by specialty.
 */
doctorRouter.get('/doctors', async (req, res, next) => {
  try {
    const { specialty, search } = req.query;

    const filter: Record<string, any> = {
      verificationStatus: 'APPROVED',
    };

    if (specialty && typeof specialty === 'string' && specialty !== 'All') {
      filter.specialties = specialty;
    }

    const doctors = await Doctor.find(filter)
      .populate('userId', 'name email phone language')
      .populate('facilityId', 'name type district');

    const results = [];

    for (const doc of doctors) {
      const user = doc.userId as any;
      if (!user) continue;

      if (search && typeof search === 'string') {
        const query = search.toLowerCase();
        const matchesName = user.name?.toLowerCase().includes(query);
        const matchesSpecialty = doc.specialties?.some((s: string) => s.toLowerCase().includes(query));
        if (!matchesName && !matchesSpecialty) continue;
      }

      const activeQueueCount = await QueueEntry.countDocuments({
        doctorId: user._id,
        status: { $in: ['WAITING', 'CALLED', 'IN_PROGRESS'] },
      });

      const facility = doc.facilityId as any;

      results.push({
        id: user._id.toString(),
        name: user.name || 'Medical Officer',
        qualification: doc.qualification || 'MBBS',
        additionalQualification: doc.additionalQualification || undefined,
        registrationNumber: doc.registrationNumber || 'NMC-VERIFIED',
        medicalCouncil: doc.medicalCouncil || undefined,
        registrationYear: doc.registrationYear || undefined,
        specialties: doc.specialties || ['General Physician'],
        languages: doc.languages || ['en', 'hi'],
        experienceYears: doc.experienceYears || 1,
        verificationStatus: doc.verificationStatus,
        availability: doc.availability,
        consultationModes: doc.consultationModes || ['VIDEO', 'AUDIO'],
        facilityId: facility?._id?.toString(),
        facilityName: facility?.name,
        facilityType: facility?.type,
        districtCode: doc.districtCode,
        bio: doc.bio || undefined,
        queueLength: activeQueueCount,
        estimatedWaitMinutes: Math.max(1, activeQueueCount * (doc.rollingAvgConsultMinutes || 10)),
      });
    }

    res.status(200).json({
      doctors: results,
      total: results.length,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/doctors/registry/all
 * Administrative & statutory registry of doctors for verification by Hospital Admin, IDSP Govt Officer, or System Admin.
 */
doctorRouter.get(
  '/doctors/registry/all',
  requireAuth,
  requireRole('ADMIN', 'HOSPITAL_ADMIN', 'GOVT_OFFICER', 'PHC_OFFICER'),
  async (req, res, next) => {
    try {
      const { status } = req.query;
      const filter: Record<string, any> = {};
      if (status && typeof status === 'string' && status !== 'ALL') {
        filter.verificationStatus = status;
      }

      const doctors = await Doctor.find(filter)
        .populate('userId', 'name email phone language createdAt lastLoginAt')
        .populate('facilityId', 'name type districtCode facilityId')
        .sort({ createdAt: -1 });

      const doctorUserIds = doctors.map((d) => (d.userId as any)?._id || d.userId).filter(Boolean);
      const affiliations = await DoctorAffiliation.find({ doctorUserId: { $in: doctorUserIds } })
        .populate('facilityId', 'name type districtCode facilityId')
        .lean();

      const affMap = new Map<string, any[]>();
      for (const a of affiliations) {
        const uId = a.doctorUserId?.toString();
        if (!uId) continue;
        if (!affMap.has(uId)) affMap.set(uId, []);
        const fac = a.facilityId as any;
        affMap.get(uId)!.push({
          id: a._id.toString(),
          facilityId: fac?._id?.toString() || fac?.facilityId,
          facilityName: fac?.name || 'Healthcare Facility',
          facilityType: fac?.type,
          status: a.status,
          roleInFacility: a.roleInFacility,
        });
      }

      const results = doctors.map((doc) => {
        const user = doc.userId as any;
        const uId = user?._id?.toString() || doc.userId?.toString();
        const fac = doc.facilityId as any;
        return {
          id: doc._id.toString(),
          userId: uId,
          name: user?.name || 'Doctor',
          email: user?.email || '',
          phone: user?.phone || '',
          qualification: doc.qualification || 'MBBS',
          additionalQualification: doc.additionalQualification || undefined,
          registrationNumber: doc.registrationNumber,
          medicalCouncil: doc.medicalCouncil || 'State Medical Council',
          registrationYear: doc.registrationYear,
          experienceYears: doc.experienceYears || 0,
          specialties: doc.specialties || ['General Physician'],
          verificationStatus: doc.verificationStatus,
          reviewerNotes: doc.reviewerNotes || '',
          availability: doc.availability,
          facilityId: fac?._id?.toString(),
          facilityName: fac?.name,
          affiliations: affMap.get(uId) || [],
          createdAt: (doc as any).createdAt || new Date(),
        };
      });

      res.status(200).json({
        status: 'success',
        total: results.length,
        doctors: results,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/doctors/:id
 * Public view of a single doctor's professional profile.
 */
doctorRouter.get('/doctors/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      throw new AppError({
        code: 'INVALID_ID',
        statusCode: 400,
        message: 'Invalid doctor ID format',
      });
    }

    const doc = await Doctor.findOne({
      $or: [{ userId: new Types.ObjectId(id) }, { _id: new Types.ObjectId(id) }],
    })
      .populate('userId', 'name email phone language')
      .populate('facilityId', 'name type district');

    if (!doc) {
      throw new AppError({
        code: 'DOCTOR_NOT_FOUND',
        statusCode: 404,
        message: 'Doctor profile not found',
      });
    }

    const user = doc.userId as any;
    const facility = doc.facilityId as any;

    const activeQueueCount = await QueueEntry.countDocuments({
      doctorId: user?._id || doc.userId,
      status: { $in: ['WAITING', 'CALLED', 'IN_PROGRESS'] },
    });

    res.status(200).json({
      doctor: {
        id: user?._id?.toString() || doc.userId.toString(),
        name: user?.name || 'Medical Officer',
        qualification: doc.qualification,
        additionalQualification: doc.additionalQualification || undefined,
        registrationNumber: doc.registrationNumber,
        medicalCouncil: doc.medicalCouncil || undefined,
        registrationYear: doc.registrationYear || undefined,
        specialties: doc.specialties,
        languages: doc.languages,
        experienceYears: doc.experienceYears,
        verificationStatus: doc.verificationStatus,
        availability: doc.availability,
        consultationModes: doc.consultationModes || ['VIDEO', 'AUDIO'],
        facilityId: facility?._id?.toString(),
        facilityName: facility?.name,
        facilityType: facility?.type,
        districtCode: doc.districtCode,
        bio: doc.bio || undefined,
        queueLength: activeQueueCount,
        estimatedWaitMinutes: Math.max(1, activeQueueCount * (doc.rollingAvgConsultMinutes || 10)),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/doctor/status
 * Doctor checks their own registration, verification, and hospital affiliation statuses.
 */
doctorRouter.get('/doctor/status', requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const userId = req.user!.id;

    const doc = await Doctor.findOne({ userId: new Types.ObjectId(userId) })
      .populate('userId', 'name email phone language')
      .populate('facilityId', 'name type district address');

    if (!doc) {
      throw new AppError({
        code: 'DOCTOR_PROFILE_NOT_FOUND',
        statusCode: 404,
        message: 'Doctor profile not found for authenticated user',
      });
    }

    const affiliations = await DoctorAffiliation.find({
      doctorUserId: new Types.ObjectId(userId),
    })
      .populate('facilityId', 'name type district address phone')
      .sort({ createdAt: -1 });

    const docUser = doc.userId as any;

    res.status(200).json({
      status: 'success',
      verificationStatus: doc.verificationStatus,
      reviewerNotes: doc.reviewerNotes,
      doctor: {
        id: doc._id.toString(),
        name: docUser?.name || req.user!.name,
        email: docUser?.email,
        phone: docUser?.phone,
        qualification: doc.qualification,
        additionalQualification: doc.additionalQualification,
        registrationNumber: doc.registrationNumber,
        medicalCouncil: doc.medicalCouncil,
        registrationYear: doc.registrationYear,
        specialties: doc.specialties,
        experienceYears: doc.experienceYears,
        availability: doc.availability,
        facility: doc.facilityId,
        bio: doc.bio,
      },
      affiliations: affiliations.map((a) => ({
        id: a._id.toString(),
        facility: a.facilityId,
        status: a.status,
        roleInFacility: a.roleInFacility,
        notes: a.notes,
        createdAt: a.createdAt,
        approvedAt: a.approvedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/doctors/:id/verification
 * Hospital Administrator or System Admin verifies/approves a doctor.
 */
doctorRouter.patch(
  '/doctors/:id/verification',
  requireAuth,
  requireRole('ADMIN', 'HOSPITAL_ADMIN', 'GOVT_OFFICER', 'PHC_OFFICER'),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const input = DoctorVerificationUpdateSchema.parse(req.body);

      const filter = Types.ObjectId.isValid(id)
        ? { $or: [{ userId: new Types.ObjectId(id) }, { _id: new Types.ObjectId(id) }] }
        : { registrationNumber: id };

      const doc = await Doctor.findOne(filter);
      if (!doc) {
        throw new AppError({
          code: 'DOCTOR_NOT_FOUND',
          statusCode: 404,
          message: 'Doctor profile not found',
        });
      }

      doc.verificationStatus = input.status;
      if (input.reviewerNotes !== undefined) {
        doc.reviewerNotes = input.reviewerNotes;
      }
      if (input.status === 'APPROVED' && doc.availability === 'OFFLINE') {
        doc.availability = 'AVAILABLE';
      }
      await doc.save();

      await AuditEvent.create({
        actorId: new Types.ObjectId(req.user!.id),
        actorRole: req.user!.role,
        action: `DOCTOR_VERIFICATION_${input.status}`,
        resourceType: 'Doctor',
        resourceId: doc._id.toString(),
        ip: req.ip,
        at: new Date(),
      });

      res.status(200).json({
        message: `Doctor verification status successfully updated to ${input.status}`,
        doctor: {
          id: doc._id.toString(),
          userId: doc.userId.toString(),
          verificationStatus: doc.verificationStatus,
          reviewerNotes: doc.reviewerNotes,
          availability: doc.availability,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);
