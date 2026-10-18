import mongoose from 'mongoose';
import {
  RequestConsultationInput,
  MatchingPreviewRequest,
  MatchingPreviewResponse,
  CompleteConsultationInput,
  SendMessageInput,
  CallMode,
  DoctorAvailability,
  SOCKET_EVENTS,
} from '@healthsetu/contracts';
import { Consultation, type IConsultation } from '../models/Consultation.js';
import { Doctor } from '../models/Doctor.js';
import { User } from '../models/User.js';
import { QueueEntry } from '../models/QueueEntry.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { queueService, NOW_MAX_WAIT_MIN } from './queue.service.js';
import { scoreDoctor, calculateEstimatedWait } from './matching.service.js';
import { zegoService } from './zego.service.js';
import { authzService, type UserContext } from './authz.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

export class ConsultationService {
  /**
   * Request a new teleconsultation and enqueue it idempotently into the pooled queue.
   */
  async requestConsultation(
    patientId: string,
    input: RequestConsultationInput,
    ip?: string,
  ): Promise<IConsultation> {
    const result = await queueService.joinQueue(patientId, input, ip);
    return result.consultation;
  }

  /**
   * Preview and score available doctors matching patient's requirements using the pure formula.
   */
  async getMatchingPreview(req: MatchingPreviewRequest): Promise<MatchingPreviewResponse> {
    const doctors = await Doctor.find({
      verificationStatus: 'APPROVED',
    })
      .populate('userId')
      .populate('facilityId', 'name type district');

    const rankedDoctors = [];

    for (const doc of doctors) {
      const user = doc.userId as any;
      if (!user) continue;

      const currentQueue = await QueueEntry.countDocuments({
        doctorId: doc.userId._id,
        status: { $in: ['WAITING', 'CALLED', 'IN_PROGRESS'] },
      });

      const { total, breakdown } = scoreDoctor(
        {
          requiredSpecialty: req.requiredSpecialty || 'General Physician',
          preferredLanguage: req.preferredLanguage || 'hi',
          villageCode: req.villageCode,
          districtCode: req.districtCode,
        },
        {
          _id: doc.userId._id,
          name: user.name || 'Medical Officer',
          specialties: doc.specialties,
          languages: doc.languages,
          availability: doc.availability,
          districtCode: doc.districtCode,
          experienceYears: doc.experienceYears || 1,
          maxQueue: doc.maxQueue,
        },
        {
          currentQueueLength: currentQueue,
        },
      );

      const estimatedWait = calculateEstimatedWait(currentQueue, 1, doc.rollingAvgConsultMinutes || 10);
      const facility = doc.facilityId as any;

      rankedDoctors.push({
        doctorId: doc.userId._id.toString(),
        name: user.name || 'Medical Officer',
        specialties: doc.specialties,
        languages: doc.languages,
        experienceYears: doc.experienceYears || 1,
        availability: doc.availability,
        queueLength: currentQueue,
        estimatedWaitMinutes: Math.max(1, estimatedWait),
        score: total,
        breakdown,
        qualification: doc.qualification || 'MBBS',
        additionalQualification: doc.additionalQualification || undefined,
        registrationNumber: doc.registrationNumber || undefined,
        medicalCouncil: doc.medicalCouncil || undefined,
        facilityName: facility?.name || undefined,
        bio: doc.bio || undefined,
      });
    }

    // Deterministic tie-breaks: score descending, then experience descending, then doctorId ascending
    rankedDoctors.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.experienceYears !== a.experienceYears) return b.experienceYears - a.experienceYears;
      return a.doctorId.localeCompare(b.doctorId);
    });

    const hasImmediate = rankedDoctors.some(
      (d) => d.availability === 'AVAILABLE' && d.estimatedWaitMinutes <= NOW_MAX_WAIT_MIN,
    );

    return {
      recommendedAction: hasImmediate ? 'CONSULT_NOW' : 'BOOK_LATER',
      maxWaitLimitMinutes: NOW_MAX_WAIT_MIN,
      doctors: rankedDoctors.slice(0, 5),
    };
  }

  /**
   * Check live position and estimated wait time for a patient in queue.
   */
  async getQueueStatus(consultationId: string): Promise<{
    consultationId: string;
    positionInQueue: number;
    estimatedWaitMinutes: number;
    status: string;
  }> {
    const queueStatus = await queueService.getQueueStatus(consultationId);
    const consult = await Consultation.findById(consultationId).select('status');
    const isAdmitted =
      queueStatus.status === 'CALLED' ||
      queueStatus.status === 'ACTIVE' ||
      consult?.status === 'IN_PROGRESS';

    return {
      consultationId: queueStatus.consultationId,
      positionInQueue: isAdmitted ? 0 : queueStatus.positionInQueue,
      estimatedWaitMinutes: isAdmitted ? 0 : queueStatus.estimatedWaitMinutes,
      status: isAdmitted ? 'IN_PROGRESS' : queueStatus.status,
    };
  }

  /**
   * Doctor claims next consultation using atomic late binding findOneAndUpdate.
   */
  async acceptConsultation(
    doctorId: string,
    consultationId?: string,
  ): Promise<{ consultation: IConsultation; zegoToken: string; appId: number }> {
    const result = await queueService.startNextConsultation(doctorId, consultationId);
    if (!result) {
      throw new AppError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'No queued patients available to accept',
      });
    }

    // Broadcast admission event to waiting room and patient
    import('../server.js')
      .then(({ io }) => {
        const payload = {
          consultationId: result.consultation._id.toString(),
          doctorId,
          status: 'IN_PROGRESS',
        };
        io.to(result.consultation.zegoRoomId).emit(SOCKET_EVENTS.CONSULTATION_ASSIGNED, payload);
        io.to(`consultation_${result.consultation._id}`).emit(SOCKET_EVENTS.CONSULTATION_ASSIGNED, payload);
        io.emit(SOCKET_EVENTS.CONSULTATION_ASSIGNED, payload);
      })
      .catch((err) => logger.warn({ err }, 'Failed to emit consultation:assigned on accept'));

    return {
      consultation: result.consultation,
      zegoToken: result.zegoToken,
      appId: result.appId,
    };
  }

  /**
   * Switch consultation call mode (e.g. video degraded to audio or chat).
   */
  async changeMode(consultationId: string, mode: CallMode, reason?: string): Promise<IConsultation> {
    const consultation = await Consultation.findById(consultationId);
    if (!consultation) {
      throw new AppError({ statusCode: 404, code: 'NOT_FOUND', message: 'Consultation not found' });
    }

    consultation.callMode = mode;
    await consultation.save();

    logger.info({ consultationId, mode, reason }, 'Consultation call mode changed');
    return consultation;
  }

  /**
   * Complete consultation, issue prescription/outcome, and conclude session.
   */
  async completeConsultation(
    doctorId: string,
    consultationId: string,
    input: CompleteConsultationInput,
  ): Promise<IConsultation> {
    const consultation = await Consultation.findById(consultationId);
    if (!consultation) {
      throw new AppError({ statusCode: 404, code: 'NOT_FOUND', message: 'Consultation not found' });
    }

    consultation.status = 'COMPLETED';
    consultation.endedAt = new Date();
    consultation.outcome = {
      outcomeType: input.outcomeType,
      assessment: input.assessment,
      diagnosisLabel: input.diagnosisLabel,
      medications: input.medications || [],
      tests: input.tests || [],
      notes: input.notes,
      followUpDate: input.followUpDate,
      referralFacilityId: input.referralFacilityId,
      issuedAt: new Date(),
    };

    await consultation.save();

    // Mark doctor back to AVAILABLE
    await Doctor.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(doctorId) },
      { availability: 'AVAILABLE' },
    );

    // Audit Log
    await AuditEvent.create({
      actorId: new mongoose.Types.ObjectId(doctorId),
      action: 'CONSULTATION_COMPLETED',
      resourceType: 'Consultation',
      resourceId: consultation._id.toString(),
      metadata: { outcomeType: input.outcomeType, diagnosis: input.diagnosisLabel },
      at: new Date(),
    });

    return consultation;
  }

  /**
   * Append in-consultation chat message.
   */
  async sendMessage(
    consultationId: string,
    senderId: string,
    senderRole: string,
    input: SendMessageInput,
  ): Promise<IConsultation['messages'][0]> {
    const consultation = await Consultation.findById(consultationId);
    if (!consultation) {
      throw new AppError({ statusCode: 404, code: 'NOT_FOUND', message: 'Consultation not found' });
    }

    const messageItem = {
      clientId: input.clientId,
      senderId: new mongoose.Types.ObjectId(senderId),
      senderRole,
      kind: input.kind || 'TEXT',
      body: input.body,
      attachmentId: input.attachmentId,
      at: new Date(),
    };

    consultation.messages.push(messageItem as any);
    await consultation.save();

    const savedMsg = consultation.messages[consultation.messages.length - 1];

    // Broadcast message to room in real-time
    import('../server.js')
      .then(({ io }) => {
        io.to(consultation.zegoRoomId).emit(SOCKET_EVENTS.MESSAGE_NEW, {
          consultationId: consultation._id.toString(),
          message: {
            id: (savedMsg as any)._id?.toString() || input.clientId,
            clientId: input.clientId,
            senderRole,
            body: input.body,
            at: messageItem.at.toISOString(),
          },
        });
      })
      .catch((err) => logger.warn({ err }, 'Failed to emit socket message'));

    return messageItem as any;
  }

  /**
   * Retrieve doctor's queue of waiting patients.
   */
  async getDoctorQueue(doctorId: string): Promise<IConsultation[]> {
    const doctor = await Doctor.findOne({ userId: new mongoose.Types.ObjectId(doctorId) });
    const doctorSpecialties = doctor?.specialties || ['General Physician'];
    const doctorLanguages = doctor?.languages || ['hi', 'en'];

    const filter: Record<string, any> = {
      status: { $in: ['QUEUED', 'IN_PROGRESS'] },
      $or: [
        { doctorId: new mongoose.Types.ObjectId(doctorId) },
        {
          doctorId: null,
          requiredSpecialty: { $in: [...doctorSpecialties, 'General Physician'] },
          preferredLanguage: { $in: doctorLanguages },
        },
      ],
    };

    return Consultation.find(filter)
      .sort({ effectivePriority: -1, createdAt: 1 })
      .populate('patientId', 'name phone language')
      .populate('screeningId') as any;
  }

  /**
   * Retrieve consultation by ID.
   */
  async getConsultationById(id: string): Promise<IConsultation | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return Consultation.findById(id)
      .populate('patientId', 'name phone language')
      .populate('doctorId', 'name')
      .populate('screeningId');
  }

  /**
   * Update doctor status.
   */
  async updateDoctorAvailability(doctorId: string, availability: DoctorAvailability): Promise<void> {
    await Doctor.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(doctorId) },
      { availability, lastHeartbeatAt: new Date() },
      { upsert: true },
    );
  }

  /**
   * Retrieve consultations for a patient.
   */
  async getUserConsultations(patientId: string): Promise<IConsultation[]> {
    return Consultation.find({
      patientId: new mongoose.Types.ObjectId(patientId),
    })
      .sort({ createdAt: -1 })
      .populate('doctorId', 'name')
      .populate('screeningId');
  }

  /**
   * Authorizes and joins a consultation, updating status to IN_PROGRESS and issuing RTC credentials.
   */
  async joinConsultation(
    user: UserContext,
    consultationId: string,
  ): Promise<{
    consultation: IConsultation;
    token: string;
    appId: number;
    roomId: string;
    isMock: boolean;
    isConfigured: boolean;
  }> {
    const consultation = await Consultation.findById(consultationId);
    if (!consultation) {
      throw new AppError({ statusCode: 404, code: 'NOT_FOUND', message: 'Consultation not found' });
    }

    authzService.assertCanReadConsultation(user, consultation);

    if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(consultation.status)) {
      throw new AppError({
        statusCode: 400,
        code: 'CONSULTATION_INACTIVE',
        message: `Consultation status is ${consultation.status}. Inactive consultations cannot be joined.`,
      });
    }

    if (consultation.status === 'QUEUED') {
      if (user.role === 'DOCTOR') {
        consultation.status = 'IN_PROGRESS';
        if (!consultation.startedAt) consultation.startedAt = new Date();
        await consultation.save();

        import('../server.js')
          .then(({ io }) => {
            io.to(consultation.zegoRoomId).emit(SOCKET_EVENTS.CONSULTATION_ASSIGNED, {
              consultationId: consultation._id.toString(),
              doctorId: user.id,
              status: 'IN_PROGRESS',
            });
          })
          .catch((err) => logger.warn({ err }, 'Failed to emit consultation:assigned'));
      }
      // If patient enters pre-call room while QUEUED, they receive credentials but
      // consultation.status remains QUEUED until doctor admits.
    } else if (consultation.status === 'READY') {
      consultation.status = 'IN_PROGRESS';
      if (!consultation.startedAt) consultation.startedAt = new Date();
      await consultation.save();
    }

    const zegoAuth = zegoService.generateRtcToken(user.id, consultation.zegoRoomId, 900);

    return {
      consultation,
      token: zegoAuth.token,
      appId: zegoAuth.appId,
      roomId: consultation.zegoRoomId,
      isMock: zegoAuth.isMock,
      isConfigured: !zegoAuth.isMock,
    };
  }

  /**
   * Concludes a consultation call without auto-finalizing clinical documentation.
   * Sets status to DOCUMENTATION_PENDING and cleans up presence.
   */
  async endConsultation(
    user: UserContext,
    consultationId: string,
  ): Promise<IConsultation> {
    const consultation = await Consultation.findById(consultationId);
    if (!consultation) {
      throw new AppError({ statusCode: 404, code: 'NOT_FOUND', message: 'Consultation not found' });
    }

    authzService.assertCanReadConsultation(user, consultation);

    consultation.status = 'DOCUMENTATION_PENDING';
    consultation.endedAt = new Date();
    await consultation.save();

    // Mark QueueEntry as DONE if not already
    await QueueEntry.updateMany(
      { consultationId: consultation._id, status: { $in: ['WAITING', 'CALLED', 'IN_PROGRESS'] } },
      { $set: { status: 'DONE' } },
    );

    // Free doctor availability back to AVAILABLE if they were in this call
    if (consultation.doctorId) {
      await Doctor.updateOne(
        { userId: consultation.doctorId, availability: 'BUSY' },
        { $set: { availability: 'AVAILABLE' } },
      );
    }

    // Broadcast call:ended to both participants
    import('../server.js')
      .then(({ io }) => {
        io.to(consultation.zegoRoomId).emit(SOCKET_EVENTS.CALL_ENDED, {
          consultationId: consultation._id.toString(),
          status: 'DOCUMENTATION_PENDING',
          endedBy: user.id,
        });
      })
      .catch((err) => logger.warn({ err }, 'Failed to emit call:ended'));

    logger.info({ consultationId, endedBy: user.id }, 'Consultation call ended. Status set to DOCUMENTATION_PENDING');
    return consultation;
  }
}

export const consultationService = new ConsultationService();
