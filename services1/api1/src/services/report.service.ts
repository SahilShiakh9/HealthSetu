import { Types } from 'mongoose';
import crypto from 'crypto';
import { Encounter, type IEncounter } from '../models/Encounter.js';
import { Report, type IReport } from '../models/Report.js';
import { User } from '../models/User.js';
import { Doctor } from '../models/Doctor.js';
import { Consultation } from '../models/Consultation.js';
import { authzService, type UserContext } from './authz.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { runInTransaction } from '../utils/transaction.js';
import { logger } from '../utils/logger.js';

export class ReportService {
  /**
   * Finalizes an encounter and creates an official, immutable Report record referencing real patient and doctor.
   */
  async createReportFromEncounter(
    doctorId: string,
    consultationId: string,
    encounterInput: {
      assessment: string;
      diagnosisLabel: string;
      medications: Array<{
        name: string;
        dosage: string;
        frequency: string;
        durationDays: number;
        instructions?: string;
      }>;
      tests?: string[];
      notes?: string;
      followUpDate?: string;
      referralFacilityId?: string;
    },
  ): Promise<{ encounter: IEncounter; report: IReport }> {
    const consultation = await Consultation.findById(consultationId);
    if (!consultation) {
      throw new AppError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Consultation not found',
      });
    }

    // Only the assigned clinician can finalise the consultation
    if (consultation.doctorId && consultation.doctorId.toString() !== doctorId) {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Only the assigned clinician can finalise this consultation',
      });
    }

    // Phase 7: A FINAL encounter is strictly immutable
    const existingFinal = await Encounter.findOne({
      consultationId: consultation._id,
      status: 'FINAL',
    });
    if (existingFinal) {
      throw new AppError({
        statusCode: 400,
        code: 'FINALIZED_ENCOUNTER_IMMUTABLE',
        message: 'A finalised encounter is immutable. Use amendEncounter to create a superseding version.',
      });
    }

    const patient = await User.findById(consultation.patientId);
    if (!patient) {
      throw new AppError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Patient user record not found',
      });
    }

    const doctor = await User.findById(doctorId);
    const doctorProfile = await Doctor.findOne({ userId: new Types.ObjectId(doctorId) });

    const result = await runInTransaction(async (session) => {
      // 1. Check if a DRAFT encounter already exists
      const existingDraft = await Encounter.findOne({
        consultationId: consultation._id,
        status: 'DRAFT',
      });

      let encounter: IEncounter;
      if (existingDraft) {
        existingDraft.status = 'FINAL';
        existingDraft.assessment = encounterInput.assessment;
        existingDraft.diagnosisLabel = encounterInput.diagnosisLabel;
        existingDraft.medications = encounterInput.medications || [];
        existingDraft.tests = encounterInput.tests || [];
        existingDraft.notes = encounterInput.notes;
        existingDraft.followUpDate = encounterInput.followUpDate;
        existingDraft.referralFacilityId = encounterInput.referralFacilityId;
        existingDraft.finalizedAt = new Date();
        existingDraft.finalizedBy = new Types.ObjectId(doctorId);
        encounter = existingDraft;
      } else {
        encounter = new Encounter({
          consultationId: consultation._id,
          patientId: consultation.patientId,
          doctorId: new Types.ObjectId(doctorId),
          screeningId: consultation.screeningId,
          status: 'FINAL',
          version: 1,
          assessment: encounterInput.assessment,
          diagnosisLabel: encounterInput.diagnosisLabel,
          medications: encounterInput.medications || [],
          tests: encounterInput.tests || [],
          notes: encounterInput.notes,
          followUpDate: encounterInput.followUpDate,
          referralFacilityId: encounterInput.referralFacilityId,
          finalizedAt: new Date(),
          finalizedBy: new Types.ObjectId(doctorId),
        });
      }

      if (session) {
        await encounter.save({ session });
      } else {
        await encounter.save();
      }

      // 2. Build official Report from the persisted encounter
      const reportNumber = `REP-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const report = new Report({
        encounterId: encounter._id,
        consultationId: consultation._id,
        patientId: consultation.patientId,
        doctorId: new Types.ObjectId(doctorId),
        reportNumber,
        patientName: patient.name,
        patientPhone: patient.phone,
        doctorName: doctor?.name || 'Dr. Assigned Clinician',
        doctorRegistration: doctorProfile?.registrationNumber || 'MMC/REG-VERIFIED',
        facilityName: doctorProfile?.districtCode
          ? `${doctorProfile.districtCode} Telemedicine Cell`
          : 'Primary Healthcare Network',
        diagnosis: encounter.diagnosisLabel,
        assessment: encounter.assessment,
        medications: encounter.medications,
        tests: encounter.tests,
        notes: encounter.notes,
        followUpDate: encounter.followUpDate,
        referralFacilityId: encounter.referralFacilityId,
        issuedAt: new Date(),
        isMock: doctorProfile?.isMock ?? false,
      });

      if (session) {
        await report.save({ session });
      } else {
        await report.save();
      }

      // 3. Update consultation status and reference
      consultation.status = 'COMPLETED';
      consultation.endedAt = new Date();
      consultation.outcome = {
        outcomeType: 'PRESCRIPTION',
        assessment: encounter.assessment,
        diagnosisLabel: encounter.diagnosisLabel,
        medications: encounter.medications,
        tests: encounter.tests,
        notes: encounter.notes,
        followUpDate: encounter.followUpDate,
        referralFacilityId: encounter.referralFacilityId,
        issuedAt: new Date(),
      };

      if (session) {
        await consultation.save({ session });
      } else {
        await consultation.save();
      }

      return { encounter, report };
    });

    // Broadcast consultation:completed to consultation room participants in real-time
    import('../server.js')
      .then(({ io }) => {
        io.to(consultation.zegoRoomId).emit('consultation:completed', {
          consultationId: consultation._id.toString(),
          status: 'COMPLETED',
          reportId: result.report._id.toString(),
          reportNumber: result.report.reportNumber,
        });
      })
      .catch((err) => logger.warn({ err }, 'Failed to emit consultation:completed'));

    return result;
  }

  /**
   * Saves a draft encounter without completing consultation or finalizing.
   */
  async saveDraftEncounter(
    doctorId: string,
    consultationId: string,
    encounterInput: {
      assessment?: string;
      diagnosisLabel?: string;
      medications?: Array<{
        name: string;
        dosage: string;
        frequency: string;
        durationDays: number;
        instructions?: string;
      }>;
      tests?: string[];
      notes?: string;
      followUpDate?: string;
      referralFacilityId?: string;
    },
  ): Promise<IEncounter> {
    const consultation = await Consultation.findById(consultationId);
    if (!consultation) {
      throw new AppError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Consultation not found',
      });
    }

    if (consultation.doctorId && consultation.doctorId.toString() !== doctorId) {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Only the assigned clinician can edit drafts for this consultation',
      });
    }

    const existingFinal = await Encounter.findOne({
      consultationId: consultation._id,
      status: 'FINAL',
    });
    if (existingFinal) {
      throw new AppError({
        statusCode: 400,
        code: 'FINALIZED_ENCOUNTER_IMMUTABLE',
        message: 'A finalised encounter is immutable and cannot be drafted over. Use amendEncounter.',
      });
    }

    const existingDraft = await Encounter.findOne({
      consultationId: consultation._id,
      status: 'DRAFT',
    });

    if (existingDraft) {
      if (encounterInput.assessment !== undefined) existingDraft.assessment = encounterInput.assessment;
      if (encounterInput.diagnosisLabel !== undefined) existingDraft.diagnosisLabel = encounterInput.diagnosisLabel;
      if (encounterInput.medications !== undefined) existingDraft.medications = encounterInput.medications;
      if (encounterInput.tests !== undefined) existingDraft.tests = encounterInput.tests;
      if (encounterInput.notes !== undefined) existingDraft.notes = encounterInput.notes;
      if (encounterInput.followUpDate !== undefined) existingDraft.followUpDate = encounterInput.followUpDate;
      if (encounterInput.referralFacilityId !== undefined) existingDraft.referralFacilityId = encounterInput.referralFacilityId;
      await existingDraft.save();
      return existingDraft;
    }

    const draft = new Encounter({
      consultationId: consultation._id,
      patientId: consultation.patientId,
      doctorId: new Types.ObjectId(doctorId),
      screeningId: consultation.screeningId,
      status: 'DRAFT',
      version: 1,
      assessment: encounterInput.assessment || 'Draft clinical assessment',
      diagnosisLabel: encounterInput.diagnosisLabel || 'Evaluation in progress',
      medications: encounterInput.medications || [],
      tests: encounterInput.tests || [],
      notes: encounterInput.notes,
      followUpDate: encounterInput.followUpDate,
      referralFacilityId: encounterInput.referralFacilityId,
    });
    await draft.save();
    return draft;
  }

  /**
   * Creates an amendment to an already finalised encounter.
   * Retains the immutable prior version and creates version (N + 1) superseding it.
   */
  async amendFinalEncounter(
    doctorId: string,
    consultationId: string,
    encounterInput: {
      assessment: string;
      diagnosisLabel: string;
      medications: Array<{
        name: string;
        dosage: string;
        frequency: string;
        durationDays: number;
        instructions?: string;
      }>;
      tests?: string[];
      notes?: string;
      followUpDate?: string;
      referralFacilityId?: string;
    },
  ): Promise<{ previousEncounter: IEncounter; newEncounter: IEncounter; report: IReport }> {
    const consultation = await Consultation.findById(consultationId);
    if (!consultation) {
      throw new AppError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Consultation not found',
      });
    }

    if (consultation.doctorId && consultation.doctorId.toString() !== doctorId) {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'Only the authoring clinician can amend encounters for this consultation',
      });
    }

    const previousEncounter = await Encounter.findOne({
      consultationId: consultation._id,
      status: 'FINAL',
    }).sort({ version: -1 });

    if (!previousEncounter) {
      throw new AppError({
        statusCode: 400,
        code: 'NO_FINAL_ENCOUNTER',
        message: 'No finalised encounter exists to amend. Finalise an encounter first.',
      });
    }

    return runInTransaction(async (session) => {
      // Create new superseding version (immutable previous version is completely preserved)
      const newEncounter = new Encounter({
        consultationId: consultation._id,
        patientId: consultation.patientId,
        doctorId: new Types.ObjectId(doctorId),
        screeningId: consultation.screeningId,
        status: 'FINAL',
        version: previousEncounter.version + 1,
        supersedes: previousEncounter._id,
        assessment: encounterInput.assessment,
        diagnosisLabel: encounterInput.diagnosisLabel,
        medications: encounterInput.medications || [],
        tests: encounterInput.tests || [],
        notes: encounterInput.notes,
        followUpDate: encounterInput.followUpDate,
        referralFacilityId: encounterInput.referralFacilityId,
        finalizedAt: new Date(),
        finalizedBy: new Types.ObjectId(doctorId),
      });

      if (session) {
        await newEncounter.save({ session });
      } else {
        await newEncounter.save();
      }

      // Update Report to point to new superseding encounter
      const report = await Report.findOne({ consultationId: consultation._id });
      if (report) {
        report.encounterId = newEncounter._id;
        report.diagnosis = newEncounter.diagnosisLabel;
        report.assessment = newEncounter.assessment;
        report.medications = newEncounter.medications;
        report.tests = newEncounter.tests;
        report.notes = newEncounter.notes;
        report.followUpDate = newEncounter.followUpDate;
        report.referralFacilityId = newEncounter.referralFacilityId;
        if (session) {
          await report.save({ session });
        } else {
          await report.save();
        }
      }

      // Update consultation outcome snapshot
      consultation.outcome = {
        outcomeType: 'PRESCRIPTION',
        assessment: newEncounter.assessment,
        diagnosisLabel: newEncounter.diagnosisLabel,
        medications: newEncounter.medications,
        tests: newEncounter.tests,
        notes: newEncounter.notes,
        followUpDate: newEncounter.followUpDate,
        referralFacilityId: newEncounter.referralFacilityId,
        issuedAt: new Date(),
      };
      if (session) {
        await consultation.save({ session });
      } else {
        await consultation.save();
      }

      return { previousEncounter, newEncounter, report: report! };
    });
  }

  /**
   * Retrieves single report by reportId or consultationId with service-layer authorization.
   */
  async getReport(id: string, user: UserContext): Promise<IReport> {
    const isObjectId = Types.ObjectId.isValid(id);
    const query = isObjectId
      ? { $or: [{ _id: new Types.ObjectId(id) }, { consultationId: new Types.ObjectId(id) }, { encounterId: new Types.ObjectId(id) }] }
      : { reportNumber: id };

    const report = await Report.findOne(query);
    if (!report) {
      throw new AppError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Medical report not found',
      });
    }

    // Service-layer authorization check
    authzService.assertCanReadReport(user, report);

    return report;
  }

  /**
   * Lists reports for the authenticated user.
   */
  async listReports(user: UserContext): Promise<IReport[]> {
    if (user.role === 'PATIENT' || user.role === 'ASHA') {
      return Report.find({ patientId: new Types.ObjectId(user.id) }).sort({ issuedAt: -1 });
    } else if (user.role === 'DOCTOR') {
      return Report.find({ doctorId: new Types.ObjectId(user.id) }).sort({ issuedAt: -1 });
    } else if (user.role === 'ADMIN') {
      return Report.find().sort({ issuedAt: -1 }).limit(100);
    }

    return [];
  }
}

export const reportService = new ReportService();
