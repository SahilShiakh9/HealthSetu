import mongoose, { Types } from 'mongoose';
import {
  RequestConsultationInput,
  MatchingPreviewRequest,
  MatchingPreviewResponse,
  DoctorAvailability,
  SOCKET_EVENTS,
} from '@healthsetu/contracts';
import { QueueEntry, type IQueueEntry, type QueueEntryStatus } from '../models/QueueEntry.js';
import { Consultation, type IConsultation } from '../models/Consultation.js';
import { Doctor } from '../models/Doctor.js';
import { DoctorAffiliation } from '../models/DoctorAffiliation.js';
import { User } from '../models/User.js';
import { Screening } from '../models/Screening.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { buildPoolKey, scoreDoctor, calculateEstimatedWait } from './matching.service.js';
import { zegoService } from './zego.service.js';
import { runInTransaction } from '../utils/transaction.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

export const POOL_MAX_WAITING = 50;
export const NOW_MAX_WAIT_MIN = 30;

export const VALID_QUEUE_TRANSITIONS: Record<QueueEntryStatus, QueueEntryStatus[]> = {
  WAITING: ['CALLED', 'CANCELLED'],
  CALLED: ['WAITING', 'IN_PROGRESS', 'MISSED', 'CANCELLED'],
  IN_PROGRESS: ['DONE', 'CANCELLED'],
  DONE: [],
  CANCELLED: [],
  MISSED: ['WAITING'],
};

export class QueueService {
  joinPooledQueue = this.joinQueue.bind(this);

  /**
   * Enqueues a patient into a pooled specialty/language queue with late binding.
   * Emergency cases bypass queue entirely.
   */
  async joinQueue(
    patientId: string,
    input: RequestConsultationInput,
    ip?: string,
  ): Promise<{
    consultation: IConsultation;
    queueEntry: IQueueEntry;
    positionInQueue: number;
    estimatedWaitMinutes: number;
    overflow: boolean;
    suggestedAction?: 'CONSULT_NOW' | 'BOOK_LATER' | 'CHAT_ASYNC' | 'NEAREST_FACILITY';
  }> {
    // 1. Idempotency check on queueEntry or consultation
    const existingQueue = await QueueEntry.findOne({ idempotencyKey: input.idempotencyKey });
    if (existingQueue) {
      const existingConsult = await Consultation.findById(existingQueue.consultationId);
      if (existingConsult) {
        logger.info({ key: input.idempotencyKey }, 'Queue entry already exists for idempotency key');
        const pos = await this.getQueueStatus(existingConsult._id.toString());
        return {
          consultation: existingConsult,
          queueEntry: existingQueue,
          positionInQueue: pos.positionInQueue,
          estimatedWaitMinutes: pos.estimatedWaitMinutes,
          overflow: pos.overflow,
          suggestedAction: pos.overflow ? 'BOOK_LATER' : 'CONSULT_NOW',
        };
      }
    }

    // A patient may have only one active instant consultation. Mobile retries
    // can generate a new idempotency key, so also deduplicate by patient and
    // active status instead of creating duplicate queue tokens.
    const activeConsultation = await Consultation.findOne({
      patientId: new Types.ObjectId(patientId),
      status: { $in: ['QUEUED', 'IN_PROGRESS', 'DOCUMENTATION_PENDING'] },
    }).sort({ createdAt: -1 });
    if (activeConsultation) {
      const activeQueue = await QueueEntry.findOne({ consultationId: activeConsultation._id });
      if (activeQueue) {
        const pos = await this.getQueueStatus(activeConsultation._id.toString());
        logger.info(
          { patientId, consultationId: activeConsultation._id.toString() },
          'Active consultation reused for repeated queue request',
        );
        return {
          consultation: activeConsultation,
          queueEntry: activeQueue,
          positionInQueue: pos.positionInQueue,
          estimatedWaitMinutes: pos.estimatedWaitMinutes,
          overflow: pos.overflow,
          suggestedAction: pos.overflow ? 'BOOK_LATER' : 'CONSULT_NOW',
        };
      }
    }

    // 2. Emergency Rule: Emergencies NEVER enter the teleconsultation queue
    if (input.screeningId && Types.ObjectId.isValid(input.screeningId)) {
      const screening = await Screening.findById(input.screeningId);
      if (screening && (screening.isEmergency || (screening.emergencyFlags && screening.emergencyFlags.length > 0))) {
        throw new AppError({
          statusCode: 400,
          code: 'EMERGENCY_QUEUE_BYPASS',
          message: 'Emergency red-flag symptoms detected. Emergencies must never enter teleconsultation queue. Route to Emergency 108 immediately.',
          details: { emergencyFlags: screening.emergencyFlags, isEmergency: true },
        });
      }
    }

    // 3. Determine poolKey and priority rank
    const specialty = input.requiredSpecialty || 'General Physician';
    const language = input.preferredLanguage || 'hi';
    const poolKey = buildPoolKey(specialty, language);

    // priorityRank: HIGH 0, MEDIUM 1, LOW 2
    let priorityRank = 2; // Default LOW
    let effectivePriority = 20;

    if (input.screeningId && Types.ObjectId.isValid(input.screeningId)) {
      const screening = await Screening.findById(input.screeningId);
      if (screening) {
        if (screening.riskTier === 'HIGH') {
          priorityRank = 0;
          effectivePriority = 0;
        } else if (screening.riskTier === 'MEDIUM') {
          priorityRank = 1;
          effectivePriority = 10;
        }
      }
    }

    // 4. Validate direct preferred doctor if specified
    let preferredDoctorId: Types.ObjectId | undefined;
    if (input.doctorId && Types.ObjectId.isValid(input.doctorId)) {
      const targetDoc = await Doctor.findOne({
        userId: new Types.ObjectId(input.doctorId),
        verificationStatus: 'APPROVED',
      });
      if (!targetDoc) {
        throw new AppError({
          statusCode: 400,
          code: 'DOCTOR_NOT_VERIFIED',
          message: 'The selected doctor has not yet been approved by the medical council and cannot accept consultations.',
        });
      }
      preferredDoctorId = new Types.ObjectId(input.doctorId);
    }

    // 5. Calculate entries ahead and active doctors for honest wait estimation
    // Direct-doctor queue and pooled queue are kept strictly isolated
    let entriesAhead = 0;
    let activeDoctorsCount = 0;

    if (preferredDoctorId) {
      entriesAhead = await QueueEntry.countDocuments({
        preferredDoctorId,
        status: 'WAITING',
      });
      const activeDoc = await Doctor.findOne({
        userId: preferredDoctorId,
        verificationStatus: 'APPROVED',
        availability: { $in: ['AVAILABLE', 'BUSY'] },
      });
      activeDoctorsCount = activeDoc ? 1 : 0;
    } else {
      entriesAhead = await QueueEntry.countDocuments({
        poolKey,
        preferredDoctorId: null,
        status: 'WAITING',
      });
      activeDoctorsCount = await Doctor.countDocuments({
        verificationStatus: 'APPROVED',
        specialties: specialty,
        languages: language,
        availability: { $in: ['AVAILABLE', 'BUSY'] },
      });
    }

    const estimatedWaitMinutes =
      activeDoctorsCount > 0
        ? calculateEstimatedWait(entriesAhead, activeDoctorsCount, 10)
        : -1; // -1 clearly indicates doctor offline / cannot calculate reliably
    const positionInQueue = entriesAhead + 1;
    const overflow =
      entriesAhead >= POOL_MAX_WAITING ||
      (estimatedWaitMinutes > 0 && estimatedWaitMinutes > NOW_MAX_WAIT_MIN);

    // 6. Sequence counter for tie-breaking
    const lastEntry = await QueueEntry.findOne({ poolKey }).sort({ sequence: -1 });
    const sequence = (lastEntry?.sequence || 0) + 1;

    // 7. Generate secure room ID
    const sanitizedKey = input.idempotencyKey.replace(/-/g, '').slice(0, 12);
    const zegoRoomId = `room_${sanitizedKey}`;

    // 7. Atomic transaction for Consultation + QueueEntry
    const { consultation, queueEntry } = await runInTransaction(async (session) => {
      const newConsult = new Consultation({
        patientId: new Types.ObjectId(patientId),
        doctorId: preferredDoctorId,
        screeningId: input.screeningId && Types.ObjectId.isValid(input.screeningId)
          ? new Types.ObjectId(input.screeningId)
          : undefined,
        idempotencyKey: input.idempotencyKey,
        type: input.type || 'NOW',
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : undefined,
        status: 'QUEUED',
        callMode: 'VIDEO',
        preferredLanguage: language,
        requiredSpecialty: specialty,
        priorityRank,
        effectivePriority,
        sequence,
        positionInQueue,
        estimatedWaitMinutes,
        zegoRoomId,
        messages: [],
      });

      const newQueue = new QueueEntry({
        consultationId: newConsult._id,
        patientId: new Types.ObjectId(patientId),
        poolKey,
        priorityRank,
        effectivePriority,
        sequence,
        preferredDoctorId,
        status: 'WAITING',
        joinedAt: new Date(),
        idempotencyKey: input.idempotencyKey,
      });

      const auditEvent = new AuditEvent({
        actorId: new Types.ObjectId(patientId),
        action: 'QUEUE_JOINED',
        resourceType: 'QueueEntry',
        resourceId: newQueue._id.toString(),
        metadata: {
          poolKey,
          priorityRank,
          effectivePriority,
          sequence,
          estimatedWaitMinutes,
          overflow,
        },
        ip: ip || '127.0.0.1',
        at: new Date(),
      });

      if (session) {
        await newConsult.save({ session });
        await newQueue.save({ session });
        await auditEvent.save({ session });
      } else {
        await newConsult.save();
        await newQueue.save();
        await auditEvent.save();
      }

      return { consultation: newConsult, queueEntry: newQueue };
    });

    return {
      consultation,
      queueEntry,
      positionInQueue,
      estimatedWaitMinutes,
      overflow,
      suggestedAction: overflow ? 'BOOK_LATER' : 'CONSULT_NOW',
    };
  }

  /**
   * Late Binding: Available doctor claims next waiting patient in their pool using atomic findOneAndUpdate.
   * Guarantees zero double assignment under heavy concurrent requests.
   */
  async startNextConsultation(
    doctorId: string,
    specificConsultationId?: string,
  ): Promise<{
    queueEntry: IQueueEntry;
    consultation: IConsultation;
    zegoToken: string;
    appId: number;
  } | null> {
    const doctor = await Doctor.findOne({ userId: new Types.ObjectId(doctorId) });
    if (!doctor) {
      throw new AppError({ statusCode: 404, code: 'NOT_FOUND', message: 'Doctor profile not found' });
    }

    if (doctor.verificationStatus !== 'APPROVED') {
      throw new AppError({
        statusCode: 403,
        code: 'DOCTOR_NOT_VERIFIED',
        message: `Doctor professional verification status is ${doctor.verificationStatus}. Must be APPROVED by medical council/reviewer before accepting consultations.`,
      });
    }

    if (doctor.availability === 'OFFLINE' || doctor.availability === 'BREAK') {
      throw new AppError({
        statusCode: 400,
        code: 'DOCTOR_NOT_AVAILABLE',
        message: `Doctor status is ${doctor.availability}. Must be AVAILABLE or BUSY to take consultations.`,
      });
    }

    // Generate all poolKeys doctor is qualified to serve
    const doctorPoolKeys = doctor.specialties.flatMap((s) =>
      doctor.languages.map((l) => buildPoolKey(s, l)),
    );

    // Also include General Physician pool keys for doctor's spoken languages
    doctor.languages.forEach((l) => {
      const gpKey = buildPoolKey('General Physician', l);
      if (!doctorPoolKeys.includes(gpKey)) {
        doctorPoolKeys.push(gpKey);
      }
    });

    // Affiliation check: if doctor has affiliation records, require at least one active affiliation
    const affiliations = await DoctorAffiliation.find({
      doctorUserId: new Types.ObjectId(doctorId),
    });

    if (affiliations.length > 0) {
      const activeAffiliations = affiliations.filter((a) => a.status === 'ACTIVE');
      if (activeAffiliations.length === 0) {
        throw new AppError({
          statusCode: 403,
          code: 'DOCTOR_NOT_AFFILIATED',
          message: 'Doctor has no active hospital affiliations. Affiliation must be approved before accepting consultations.',
        });
      }

      if (specificConsultationId && Types.ObjectId.isValid(specificConsultationId)) {
        const targetConsult = await Consultation.findById(specificConsultationId);
        if (targetConsult && targetConsult.facilityId) {
          const isAffiliatedWithFacility = activeAffiliations.some(
            (a) => a.facilityId.toString() === targetConsult.facilityId!.toString(),
          );
          if (!isAffiliatedWithFacility) {
            throw new AppError({
              statusCode: 403,
              code: 'FORBIDDEN_FACILITY_QUEUE',
              message: 'Doctor is not actively affiliated with the facility for this consultation.',
            });
          }
        }
      }
    }

    const now = new Date();

    // 1. Atomic claim via findOneAndUpdate
    const filter: Record<string, any> = {
      status: 'WAITING',
      poolKey: { $in: doctorPoolKeys },
      $or: [{ preferredDoctorId: null }, { preferredDoctorId: new Types.ObjectId(doctorId) }],
    };

    if (specificConsultationId && Types.ObjectId.isValid(specificConsultationId)) {
      filter.consultationId = new Types.ObjectId(specificConsultationId);
    }

    const queueEntry = await QueueEntry.findOneAndUpdate(
      filter,
      {
        $set: {
          status: 'CALLED',
          doctorId: new Types.ObjectId(doctorId),
          calledAt: now,
        },
      },
      {
        sort: { effectivePriority: 1, sequence: 1 },
        returnDocument: 'after',
      },
    );

    if (!queueEntry) {
      return null;
    }

    // 2. Update Consultation to IN_PROGRESS
    const consultation = await Consultation.findById(queueEntry.consultationId);
    if (!consultation) {
      throw new AppError({ statusCode: 404, code: 'NOT_FOUND', message: 'Consultation record not found' });
    }

    consultation.doctorId = new Types.ObjectId(doctorId);
    consultation.status = 'IN_PROGRESS';
    consultation.startedAt = now;
    await consultation.save();

    // 3. Mark doctor as BUSY
    doctor.availability = 'BUSY';
    doctor.lastHeartbeatAt = now;
    await doctor.save();

    // 4. Generate Zego RTC Token
    const zegoAuth = zegoService.generateRtcToken(doctorId, consultation.zegoRoomId);

    // 5. Audit Log
    await AuditEvent.create({
      actorId: new Types.ObjectId(doctorId),
      action: 'CONSULTATION_CLAIMED_LATE_BINDING',
      resourceType: 'QueueEntry',
      resourceId: queueEntry._id.toString(),
      metadata: {
        consultationId: consultation._id.toString(),
        poolKey: queueEntry.poolKey,
        priorityRank: queueEntry.priorityRank,
        effectivePriority: queueEntry.effectivePriority,
        sequence: queueEntry.sequence,
      },
      at: now,
    });

    return {
      queueEntry,
      consultation,
      zegoToken: zegoAuth.token,
      appId: zegoAuth.appId,
    };
  }

  /**
   * Retrieves authoritative queue position and wait estimate for a consultation.
   */
  async getQueueStatus(consultationId: string): Promise<{
    consultationId: string;
    positionInQueue: number;
    entriesAhead: number;
    estimatedWaitMinutes: number;
    status: QueueEntryStatus | string;
    poolKey: string;
    overflow: boolean;
  }> {
    if (!Types.ObjectId.isValid(consultationId)) {
      throw new AppError({ statusCode: 400, code: 'INVALID_OBJECT_ID', message: 'Invalid consultation ID' });
    }

    const entry = await QueueEntry.findOne({ consultationId: new Types.ObjectId(consultationId) });
    if (!entry) {
      const consult = await Consultation.findById(consultationId);
      if (!consult) {
        throw new AppError({ statusCode: 404, code: 'NOT_FOUND', message: 'Consultation not found in queue' });
      }
      return {
        consultationId,
        positionInQueue: 0,
        entriesAhead: 0,
        estimatedWaitMinutes: 0,
        status: consult.status,
        poolKey: '',
        overflow: false,
      };
    }

    const consult = await Consultation.findById(consultationId).select('status');
    if (consult?.status === 'IN_PROGRESS') {
      return {
        consultationId,
        positionInQueue: 0,
        entriesAhead: 0,
        estimatedWaitMinutes: 0,
        status: 'IN_PROGRESS',
        poolKey: entry.poolKey,
        overflow: false,
      };
    }

    // Recover records created before consultation and queue statuses were
    // updated atomically. An active queued consultation must remain claimable.
    if (consult?.status === 'QUEUED' && entry.status === 'DONE') {
      entry.status = 'WAITING';
      entry.calledAt = undefined;
      entry.doctorId = undefined;
      await entry.save();
    }

    if (entry.status !== 'WAITING') {
      return {
        consultationId,
        positionInQueue: 0,
        entriesAhead: 0,
        estimatedWaitMinutes: 0,
        status: entry.status,
        poolKey: entry.poolKey,
        overflow: false,
      };
    }

    // Direct-doctor queue vs Pooled queue isolation
    let entriesAhead = 0;
    let activeDoctorsCount = 0;

    if (entry.preferredDoctorId) {
      entriesAhead = await QueueEntry.countDocuments({
        preferredDoctorId: entry.preferredDoctorId,
        status: 'WAITING',
        $or: [
          { effectivePriority: { $lt: entry.effectivePriority } },
          { effectivePriority: entry.effectivePriority, sequence: { $lt: entry.sequence } },
        ],
      });

      const activeDoc = await Doctor.findOne({
        userId: entry.preferredDoctorId,
        verificationStatus: 'APPROVED',
        availability: { $in: ['AVAILABLE', 'BUSY'] },
      });
      activeDoctorsCount = activeDoc ? 1 : 0;
    } else {
      entriesAhead = await QueueEntry.countDocuments({
        poolKey: entry.poolKey,
        preferredDoctorId: null,
        status: 'WAITING',
        $or: [
          { effectivePriority: { $lt: entry.effectivePriority } },
          { effectivePriority: entry.effectivePriority, sequence: { $lt: entry.sequence } },
        ],
      });

      // Resolve specialty and language from poolKey
      const [specPart, langPart] = entry.poolKey.split(':');
      const specialty = specPart ? specPart.replace(/_/g, ' ') : 'General Physician';
      const language = langPart || 'hi';

      activeDoctorsCount = await Doctor.countDocuments({
        verificationStatus: 'APPROVED',
        specialties: new RegExp(specialty, 'i'),
        languages: language,
        availability: { $in: ['AVAILABLE', 'BUSY'] },
      });
    }

    const estimatedWaitMinutes =
      activeDoctorsCount > 0
        ? calculateEstimatedWait(entriesAhead, activeDoctorsCount, 10)
        : -1;
    const positionInQueue = entriesAhead + 1;
    const overflow =
      entriesAhead >= POOL_MAX_WAITING ||
      (estimatedWaitMinutes > 0 && estimatedWaitMinutes > NOW_MAX_WAIT_MIN);

    return {
      consultationId,
      positionInQueue,
      entriesAhead,
      estimatedWaitMinutes,
      status: entry.status,
      poolKey: entry.poolKey,
      overflow,
    };
  }

  /**
   * Safely transitions queue entry status with validation.
   */
  async transitionQueueEntry(
    queueEntryId: string,
    newStatus: QueueEntryStatus,
  ): Promise<IQueueEntry> {
    const entry = await QueueEntry.findById(queueEntryId);
    if (!entry) {
      throw new AppError({ statusCode: 404, code: 'NOT_FOUND', message: 'Queue entry not found' });
    }

    const allowed = VALID_QUEUE_TRANSITIONS[entry.status];
    if (!allowed.includes(newStatus)) {
      throw new AppError({
        statusCode: 400,
        code: 'ILLEGAL_QUEUE_TRANSITION',
        message: `Illegal queue transition from ${entry.status} to ${newStatus}. Permitted: [${allowed.join(', ')}]`,
      });
    }

    entry.status = newStatus;
    await entry.save();
    return entry;
  }

  /**
   * Starvation control: Decrements effectivePriority for aging entries waiting in queue.
   */
  async ageWaitingEntries(agingMinutes = 15): Promise<number> {
    const cutoff = new Date(Date.now() - agingMinutes * 60000);
    const result = await QueueEntry.updateMany(
      {
        status: 'WAITING',
        effectivePriority: { $gt: 0 },
        joinedAt: { $lte: cutoff },
      },
      {
        $inc: { effectivePriority: -1 },
      },
    );

    return result.modifiedCount;
  }

  /**
   * Reconnect: Refetches active queue position for authenticated patient.
   */
  async getPatientActiveQueue(patientId: string): Promise<IQueueEntry | null> {
    return QueueEntry.findOne({
      patientId: new Types.ObjectId(patientId),
      status: { $in: ['WAITING', 'CALLED', 'IN_PROGRESS'] },
    });
  }

  /**
   * If an offer is declined or expires, restores the request to WAITING in the queue
   * with the exact same sequence and priority rank without creating duplicate entries.
   */
  async declineConsultation(doctorId: string, consultationId: string): Promise<IConsultation> {
    const consultation = await Consultation.findById(consultationId);
    if (!consultation) {
      throw new AppError({ statusCode: 404, code: 'NOT_FOUND', message: 'Consultation not found' });
    }

    const queueEntry = await QueueEntry.findOne({ consultationId: consultation._id });
    if (queueEntry && ['CALLED', 'IN_PROGRESS'].includes(queueEntry.status)) {
      queueEntry.status = 'WAITING';
      // If patient had not selected a specific doctor, clear assigned doctor
      if (!queueEntry.preferredDoctorId) {
        queueEntry.doctorId = undefined;
      }
      await queueEntry.save();
    }

    consultation.status = 'QUEUED';
    consultation.startedAt = undefined;
    if (!queueEntry?.preferredDoctorId) {
      consultation.doctorId = undefined;
    }
    await consultation.save();

    await Doctor.updateOne(
      { userId: new Types.ObjectId(doctorId), availability: 'BUSY' },
      { $set: { availability: 'AVAILABLE' } },
    );

    return consultation;
  }
}

export const queueService = new QueueService();
