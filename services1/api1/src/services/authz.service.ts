import { Types } from 'mongoose';
import { AppError } from '../middleware/errorHandler.js';
import type { Role } from '@healthsetu/contracts';

export interface UserContext {
  id: string;
  role: Role;
}

const extractIdStr = (val: any): string | undefined => {
  if (!val) return undefined;
  if (typeof val === 'string') return val;
  if (val._id) return val._id.toString();
  return val.toString();
};

export class AuthorizationService {
  /**
   * Enforces that only the patient who owns the report or the authoring doctor can read it.
   * Facility staff and other patients/doctors get 404 (not revealing existence).
   */
  assertCanReadReport(
    user: UserContext,
    report: { patientId: any; doctorId?: any },
  ): void {
    const patientIdStr = extractIdStr(report.patientId);
    const doctorIdStr = extractIdStr(report.doctorId);

    if (user.role === 'PATIENT' || user.role === 'ASHA') {
      if (patientIdStr === user.id) return;
    } else if (user.role === 'DOCTOR') {
      if (doctorIdStr === user.id) return;
    } else if (user.role === 'ADMIN') {
      return;
    }

    // Reject with 404 to avoid leaking record existence
    throw new AppError({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Medical report not found',
    });
  }

  /**
   * Enforces that only the owning patient or an authorized doctor can read the screening.
   */
  assertCanReadScreening(
    user: UserContext,
    screening: { patientId: any; submittedBy?: any },
  ): void {
    const patientIdStr = extractIdStr(screening.patientId);
    const submittedByStr = extractIdStr(screening.submittedBy);

    if (user.role === 'PATIENT' || user.role === 'ASHA') {
      if (patientIdStr === user.id || submittedByStr === user.id) return;
    } else if (user.role === 'DOCTOR' || user.role === 'ADMIN') {
      return;
    }

    throw new AppError({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Screening record not found',
    });
  }

  /**
   * Enforces consultation clinical access.
   */
  assertCanReadConsultation(
    user: UserContext,
    consultation: { patientId: any; doctorId?: any; status: string },
  ): void {
    const patientIdStr = extractIdStr(consultation.patientId);
    const doctorIdStr = extractIdStr(consultation.doctorId);

    if (user.role === 'PATIENT' || user.role === 'ASHA') {
      if (patientIdStr === user.id) return;
    } else if (user.role === 'DOCTOR') {
      // Doctor can read assigned consultations or waiting pool
      if (doctorIdStr === user.id || ['QUEUED', 'WAITING'].includes(consultation.status)) return;
    } else if (user.role === 'ADMIN') {
      return;
    }

    throw new AppError({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Consultation session not found',
    });
  }
}

export const authzService = new AuthorizationService();
