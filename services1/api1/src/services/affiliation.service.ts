import { Types } from 'mongoose';
import { DoctorAffiliation, type IDoctorAffiliation } from '../models/DoctorAffiliation.js';
import { Facility } from '../models/Facility.js';
import { User } from '../models/User.js';
import { Doctor } from '../models/Doctor.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { AppError } from '../middleware/errorHandler.js';
import type { AffiliationRole, AffiliationStatus } from '@healthsetu/contracts';
import { logger } from '../utils/logger.js';

export class AffiliationService {
  /**
   * Helper to resolve facility by either MongoDB _id or string facilityId
   */
  static async resolveFacility(facilityIdentifier: string) {
    const isObjectId = Types.ObjectId.isValid(facilityIdentifier);
    const facility = await Facility.findOne({
      $or: [
        ...(isObjectId ? [{ _id: new Types.ObjectId(facilityIdentifier) }] : []),
        { facilityId: facilityIdentifier },
      ],
    });

    if (!facility) {
      throw new AppError({
        statusCode: 404,
        code: 'FACILITY_NOT_FOUND',
        message: `Healthcare facility ${facilityIdentifier} not found`,
      });
    }

    return facility;
  }

  /**
   * Doctor requests affiliation with a healthcare organization
   */
  static async requestAffiliation(
    doctorUserId: string,
    facilityIdentifier: string,
    roleInFacility: AffiliationRole = 'CONSULTANT',
    notes?: string,
  ): Promise<IDoctorAffiliation> {
    const facility = await this.resolveFacility(facilityIdentifier);
    const doctorUser = await User.findById(doctorUserId);

    if (!doctorUser || doctorUser.role !== 'DOCTOR') {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Only registered medical doctors can request facility affiliations',
      });
    }

    // Check if affiliation already exists
    const existing = await DoctorAffiliation.findOne({
      doctorUserId: doctorUser._id,
      facilityId: facility._id,
    });

    if (existing) {
      if (existing.status === 'ACTIVE') {
        throw new AppError({
          statusCode: 409,
          code: 'AFFILIATION_EXISTS',
          message: 'You already have an active affiliation with this facility',
        });
      }
      if (existing.status === 'PENDING') {
        throw new AppError({
          statusCode: 409,
          code: 'AFFILIATION_PENDING',
          message: 'An affiliation request for this facility is already pending approval',
        });
      }
      // Re-apply if previously rejected or revoked
      existing.status = 'PENDING';
      existing.roleInFacility = roleInFacility;
      existing.requestedBy = doctorUser._id;
      existing.notes = notes || 'Re-applied for affiliation';
      await existing.save();
      return existing;
    }

    const affiliation = await DoctorAffiliation.create({
      doctorUserId: doctorUser._id,
      facilityId: facility._id,
      status: 'PENDING',
      roleInFacility,
      requestedBy: doctorUser._id,
      notes: notes || '',
    });

    await AuditEvent.create({
      actorId: doctorUser._id,
      actorRole: doctorUser.role,
      action: 'DOCTOR_AFFILIATION_REQUESTED',
      resourceType: 'DoctorAffiliation',
      resourceId: affiliation._id.toString(),
      metadata: { facilityId: facility.facilityId, roleInFacility },
      at: new Date(),
    });

    logger.info(
      { doctorId: doctorUserId, facilityId: facility.facilityId },
      'Doctor affiliation requested',
    );

    return affiliation;
  }

  /**
   * Hospital Admin invites a doctor to affiliate with their facility
   */
  static async inviteDoctor(
    adminUserId: string,
    facilityIdentifier: string,
    doctorIdentifier: { email?: string; phone?: string; doctorUserId?: string },
    roleInFacility: AffiliationRole = 'CONSULTANT',
    notes?: string,
  ): Promise<IDoctorAffiliation> {
    const facility = await this.resolveFacility(facilityIdentifier);
    await this.assertAdminForFacility(adminUserId, facility._id.toString());

    // Find the doctor user
    let doctorUser = null;
    if (doctorIdentifier.doctorUserId && Types.ObjectId.isValid(doctorIdentifier.doctorUserId)) {
      doctorUser = await User.findById(doctorIdentifier.doctorUserId);
    } else if (doctorIdentifier.email) {
      doctorUser = await User.findOne({ email: doctorIdentifier.email.trim().toLowerCase() });
    } else if (doctorIdentifier.phone) {
      doctorUser = await User.findOne({ phone: doctorIdentifier.phone.trim() });
    }

    if (!doctorUser || doctorUser.role !== 'DOCTOR') {
      throw new AppError({
        statusCode: 404,
        code: 'DOCTOR_NOT_FOUND',
        message: 'No registered doctor found with the provided credentials',
      });
    }

    let affiliation = await DoctorAffiliation.findOne({
      doctorUserId: doctorUser._id,
      facilityId: facility._id,
    });

    if (existingAffiliationIsActive(affiliation)) {
      throw new AppError({
        statusCode: 409,
        code: 'ALREADY_AFFILIATED',
        message: 'Doctor is already actively affiliated with this facility',
      });
    }

    if (affiliation) {
      affiliation.status = 'ACTIVE';
      affiliation.roleInFacility = roleInFacility;
      affiliation.approvedBy = new Types.ObjectId(adminUserId);
      affiliation.approvedAt = new Date();
      affiliation.notes = notes || 'Invited and approved by facility administration';
      await affiliation.save();
    } else {
      affiliation = await DoctorAffiliation.create({
        doctorUserId: doctorUser._id,
        facilityId: facility._id,
        status: 'ACTIVE',
        roleInFacility,
        requestedBy: new Types.ObjectId(adminUserId),
        approvedBy: new Types.ObjectId(adminUserId),
        approvedAt: new Date(),
        notes: notes || 'Direct invitation by hospital administration',
      });
    }

    // Ensure facilityId is included in user's facilityIds
    await User.findByIdAndUpdate(doctorUser._id, {
      $addToSet: { facilityIds: facility.facilityId },
    });

    await AuditEvent.create({
      actorId: new Types.ObjectId(adminUserId),
      actorRole: 'HOSPITAL_ADMIN',
      action: 'DOCTOR_AFFILIATION_INVITED',
      resourceType: 'DoctorAffiliation',
      resourceId: affiliation._id.toString(),
      metadata: { doctorId: doctorUser._id.toString(), facilityId: facility.facilityId },
      at: new Date(),
    });

    return affiliation;
  }

  /**
   * Hospital Admin approves, rejects, or revokes a doctor's affiliation
   */
  static async updateAffiliationStatus(
    adminUserId: string,
    affiliationId: string,
    status: AffiliationStatus,
    notes?: string,
  ): Promise<IDoctorAffiliation> {
    if (!Types.ObjectId.isValid(affiliationId)) {
      throw new AppError({ statusCode: 400, code: 'INVALID_ID', message: 'Invalid affiliation ID' });
    }

    const affiliation = await DoctorAffiliation.findById(affiliationId);
    if (!affiliation) {
      throw new AppError({ statusCode: 404, code: 'NOT_FOUND', message: 'Affiliation record not found' });
    }

    await this.assertAdminForFacility(adminUserId, affiliation.facilityId.toString());

    affiliation.status = status;
    affiliation.approvedBy = new Types.ObjectId(adminUserId);
    affiliation.approvedAt = new Date();
    if (notes) affiliation.notes = notes;
    await affiliation.save();

    const facility = await Facility.findById(affiliation.facilityId);
    if (facility) {
      if (status === 'ACTIVE') {
        await User.findByIdAndUpdate(affiliation.doctorUserId, {
          $addToSet: { facilityIds: facility.facilityId },
        });
      } else {
        await User.findByIdAndUpdate(affiliation.doctorUserId, {
          $pull: { facilityIds: facility.facilityId },
        });
      }
    }

    await AuditEvent.create({
      actorId: new Types.ObjectId(adminUserId),
      actorRole: 'HOSPITAL_ADMIN',
      action: `DOCTOR_AFFILIATION_${status}`,
      resourceType: 'DoctorAffiliation',
      resourceId: affiliation._id.toString(),
      metadata: { newStatus: status, notes },
      at: new Date(),
    });

    return affiliation;
  }

  /**
   * List all affiliations for a specific doctor
   */
  static async getDoctorAffiliations(doctorUserId: string) {
    const affiliations = await DoctorAffiliation.find({
      doctorUserId: new Types.ObjectId(doctorUserId),
    })
      .populate('facilityId', 'facilityId name type location districtCode organizationStatus open24x7 phone')
      .lean();

    const doctorProfile = await Doctor.findOne({
      userId: new Types.ObjectId(doctorUserId),
    }).lean();

    return {
      affiliations,
      doctorProfile: doctorProfile
        ? {
            specialties: doctorProfile.specialties,
            languages: doctorProfile.languages,
            registrationNumber: doctorProfile.registrationNumber,
            qualification: doctorProfile.qualification,
            experienceYears: doctorProfile.experienceYears,
            verificationStatus: doctorProfile.verificationStatus,
            availability: doctorProfile.availability,
          }
        : null,
    };
  }

  /**
   * List all affiliations and roster for a hospital facility
   */
  static async getFacilityAffiliations(facilityIdentifier: string, adminUserId?: string) {
    const facility = await this.resolveFacility(facilityIdentifier);

    if (adminUserId) {
      await this.assertAdminForFacility(adminUserId, facility._id.toString());
    }

    const affiliations = await DoctorAffiliation.find({ facilityId: facility._id })
      .populate('doctorUserId', 'name email phone language lastLoginAt isActive')
      .lean();

    // Attach doctor professional profile if exists
    const doctorUserIds = affiliations.map((a) => a.doctorUserId?._id || a.doctorUserId);
    const doctorProfiles = await Doctor.find({ userId: { $in: doctorUserIds } }).lean();
    const profileMap = new Map(doctorProfiles.map((p) => [p.userId.toString(), p]));

    return affiliations.map((aff) => {
      const docUser = aff.doctorUserId as any;
      const profile = docUser ? profileMap.get(docUser._id?.toString()) : null;
      return {
        ...aff,
        doctorProfile: profile
          ? {
              specialties: profile.specialties,
              registrationNumber: profile.registrationNumber,
              qualification: profile.qualification,
              experienceYears: profile.experienceYears,
              availability: profile.availability,
              verificationStatus: profile.verificationStatus,
            }
          : null,
      };
    });
  }

  /**
   * Check if a doctor has an active affiliation with a given facility
   */
  static async isDoctorActivelyAffiliated(doctorUserId: string, facilityIdentifier: string): Promise<boolean> {
    try {
      const facility = await this.resolveFacility(facilityIdentifier);
      const affiliation = await DoctorAffiliation.findOne({
        doctorUserId: new Types.ObjectId(doctorUserId),
        facilityId: facility._id,
        status: 'ACTIVE',
      });
      return !!affiliation;
    } catch {
      return false;
    }
  }

  /**
   * Returns list of all active facility IDs for a doctor
   */
  static async getActiveFacilityIdsForDoctor(doctorUserId: string): Promise<string[]> {
    const affiliations = await DoctorAffiliation.find({
      doctorUserId: new Types.ObjectId(doctorUserId),
      status: 'ACTIVE',
    }).populate('facilityId', 'facilityId');

    return affiliations
      .map((a) => (a.facilityId as any)?.facilityId)
      .filter((id): id is string => typeof id === 'string');
  }

  /**
   * Assert user is an authorized admin for the facility (or super ADMIN)
   */
  private static async assertAdminForFacility(adminUserId: string, facilityMongoId: string) {
    const user = await User.findById(adminUserId);
    if (!user) {
      throw new AppError({ statusCode: 401, code: 'UNAUTHORIZED', message: 'User not found' });
    }

    if (user.role === 'ADMIN') {
      return; // Platform admin has universal access
    }

    if (user.role !== 'HOSPITAL_ADMIN') {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Only Hospital Administrators can manage facility affiliations',
      });
    }

    const facility = await Facility.findById(facilityMongoId);
    if (!facility) {
      throw new AppError({ statusCode: 404, code: 'FACILITY_NOT_FOUND', message: 'Facility not found' });
    }

    const isExplicitAdmin = facility.adminUserIds.some((id: any) => id.toString() === adminUserId);
    const hasMatchingFacilityId = user.facilityId === facility.facilityId || user.facilityIds?.includes(facility.facilityId);

    if (!isExplicitAdmin && !hasMatchingFacilityId) {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'You are not authorized to administer this healthcare facility',
      });
    }
  }
}

function existingAffiliationIsActive(affiliation: IDoctorAffiliation | null): boolean {
  return affiliation?.status === 'ACTIVE';
}
