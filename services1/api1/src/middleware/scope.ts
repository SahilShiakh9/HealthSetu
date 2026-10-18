import type { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { User } from '../models/User.js';
import { StaffAssignment } from '../models/StaffAssignment.js';
import { Facility } from '../models/Facility.js';
import { DoctorAffiliation } from '../models/DoctorAffiliation.js';
import { AppError } from './errorHandler.js';
import type { Role } from '@healthsetu/contracts';

export interface UserScope {
  role: Role;
  facilityIds: string[];
  districtCode?: string;
}

declare global {
  namespace Express {
    interface Request {
      scope?: UserScope;
    }
  }
}

/**
 * Derives user's authorized facility IDs and district from the database.
 * Never trusts client-supplied facility IDs.
 */
export const resolveScope = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError({
        statusCode: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication required to resolve scope',
      });
    }

    let facilityIds: string[] = [];
    let districtCode: string | undefined = undefined;

    // 1. Check StaffAssignment collection first
    const userIdObj = Types.ObjectId.isValid(req.user.id) ? new Types.ObjectId(req.user.id) : null;
    if (userIdObj) {
      const assignment = await StaffAssignment.findOne({ userId: userIdObj, active: true }).lean();
      if (assignment) {
        if (Array.isArray(assignment.facilityIds) && assignment.facilityIds.length > 0) {
          facilityIds = [...assignment.facilityIds];
        }
        if (assignment.districtCode) {
          districtCode = assignment.districtCode;
        }
      }
    }

    // 2. Fall back to user model fields if not set in StaffAssignment
    if (facilityIds.length === 0 || !districtCode) {
      const user = await User.findById(req.user.id).lean();
      if (user) {
        if (facilityIds.length === 0) {
          if (Array.isArray(user.facilityIds) && user.facilityIds.length > 0) {
            facilityIds = [...user.facilityIds];
          } else if (user.facilityId) {
            facilityIds = [user.facilityId];
          }
        }
        if (!districtCode && user.districtCode) {
          districtCode = user.districtCode;
        }
      }
    }

    // 3. Multi-org affiliation resolution
    if (userIdObj) {
      if (req.user.role === 'DOCTOR') {
        const activeAffiliations = await DoctorAffiliation.find({
          doctorUserId: userIdObj,
          status: 'ACTIVE',
        })
          .populate('facilityId', 'facilityId')
          .lean();

        for (const aff of activeAffiliations) {
          const facCode = (aff.facilityId as any)?.facilityId;
          if (facCode && !facilityIds.includes(facCode)) {
            facilityIds.push(facCode);
          }
        }
      } else if (req.user.role === 'HOSPITAL_ADMIN') {
        const administeredFacilities = await Facility.find({ adminUserIds: userIdObj }).lean();
        for (const fac of administeredFacilities) {
          if (fac.facilityId && !facilityIds.includes(fac.facilityId)) {
            facilityIds.push(fac.facilityId);
          }
        }
      }
    }

    // 4. Admin scope
    if (req.user.role === 'ADMIN') {
      if (facilityIds.length === 0) {
        facilityIds = ['*'];
      }
      if (!districtCode) {
        districtCode = '*';
      }
    }

    req.scope = {
      role: req.user.role,
      facilityIds,
      districtCode,
    };

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Validates that a requested facility ID is within req.scope.facilityIds.
 * Returns 404 for resource lookups (not revealing existence) and 403 for unauthorized facility filters.
 */
export const assertFacilityInScope = (
  req: Request,
  facilityId: string,
  isResourceIdLookup = false,
): void => {
  if (!req.scope) {
    throw new AppError({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Scope has not been resolved',
    });
  }

  // Admin wildcard has access to all facilities
  if (req.scope.facilityIds.includes('*')) {
    return;
  }

  if (!req.scope.facilityIds.includes(facilityId)) {
    if (isResourceIdLookup) {
      throw new AppError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Healthcare facility not found',
      });
    } else {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Unauthorized facility access: facility not in assigned scope',
      });
    }
  }
};

/**
 * Validates that a requested district code is within req.scope.districtCode.
 */
export const assertDistrictInScope = (req: Request, districtCode: string): void => {
  if (!req.scope) {
    throw new AppError({
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Scope has not been resolved',
    });
  }

  // Admin wildcard has access to all districts
  if (req.scope.districtCode === '*' || req.scope.role === 'ADMIN') {
    return;
  }

  if (req.scope.districtCode !== districtCode) {
    throw new AppError({
      statusCode: 403,
      code: 'FORBIDDEN',
      message: `Unauthorized district access: ${districtCode} is outside user assigned jurisdiction`,
    });
  }
};
