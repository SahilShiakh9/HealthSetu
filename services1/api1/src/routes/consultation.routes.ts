import { Router } from 'express';
import {
  RequestConsultationSchema,
  MatchingPreviewRequestSchema,
  CompleteConsultationSchema,
  SendMessageSchema,
  ChangeModeSchema,
  DoctorAvailabilityEnum,
} from '@healthsetu/contracts';
import { consultationService } from '../services/consultation.service.js';
import { reportService } from '../services/report.service.js';
import { authzService } from '../services/authz.service.js';
import { zegoService } from '../services/zego.service.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateObjectIdParam } from '../middleware/validateObjectId.js';
import { AppError } from '../middleware/errorHandler.js';

export const consultationRouter = Router();

// POST /api/v1/consultations/request (Patient joins queue)
consultationRouter.post('/consultations/request', requireAuth, async (req, res, next) => {
  try {
    const input = RequestConsultationSchema.parse(req.body);
    const consultation = await consultationService.requestConsultation(
      req.user!.id,
      input,
      req.ip,
    );

    res.status(201).json({
      status: 'success',
      consultation,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/consultations/preview (Preview matching doctors and wait times)
consultationRouter.post('/consultations/preview', requireAuth, async (req, res, next) => {
  try {
    const input = MatchingPreviewRequestSchema.parse(req.body);
    const preview = await consultationService.getMatchingPreview(input);

    res.status(200).json({
      status: 'success',
      ...preview,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/consultations/queue/:id (Check live queue position)
consultationRouter.get('/consultations/queue/:id', requireAuth, validateObjectIdParam('id'), async (req, res, next) => {
  try {
    const status = await consultationService.getQueueStatus(req.params.id);
    res.status(200).json(status);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/consultations/doctor/queue (Doctor view of waiting queue)
consultationRouter.get(
  '/consultations/doctor/queue',
  requireAuth,
  requireRole(['DOCTOR']),
  async (req, res, next) => {
    try {
      const queue = await consultationService.getDoctorQueue(req.user!.id);
      res.status(200).json({
        status: 'success',
        total: queue.length,
        queue,
      });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/consultations/doctor/availability (Doctor status toggle)
consultationRouter.patch(
  '/consultations/doctor/availability',
  requireAuth,
  requireRole(['DOCTOR']),
  async (req, res, next) => {
    try {
      const availability = DoctorAvailabilityEnum.parse(req.body.availability);
      await consultationService.updateDoctorAvailability(req.user!.id, availability);
      res.status(200).json({
        status: 'success',
        availability,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/consultations/doctor/heartbeat (Doctor presence heartbeat every 20s)
consultationRouter.post(
  '/consultations/doctor/heartbeat',
  requireAuth,
  requireRole(['DOCTOR']),
  async (req, res, next) => {
    try {
      await consultationService.updateDoctorAvailability(req.user!.id, 'AVAILABLE');
      res.status(200).json({
        status: 'success',
        heartbeat: true,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/consultations/:id/accept (Doctor accepts patient)
consultationRouter.post(
  '/consultations/:id/accept',
  requireAuth,
  requireRole(['DOCTOR']),
  (req, _res, next) => {
    if (req.params.id !== 'next') {
      return validateObjectIdParam('id')(req, _res, next);
    }
    next();
  },
  async (req, res, next) => {
    try {
      const result = await consultationService.acceptConsultation(
        req.user!.id,
        req.params.id !== 'next' ? req.params.id : undefined,
      );

      res.status(200).json({
        status: 'success',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/v1/consultations/:id/mode (Switch call mode: VIDEO -> AUDIO -> CHAT)
consultationRouter.patch(
  '/consultations/:id/mode',
  requireAuth,
  validateObjectIdParam('id'),
  async (req, res, next) => {
    try {
      const input = ChangeModeSchema.parse(req.body);
      const consultation = await consultationService.changeMode(
        req.params.id,
        input.mode,
        input.reason,
      );

      res.status(200).json({
        status: 'success',
        callMode: consultation.callMode,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/consultations/:id/complete (Doctor concludes call with clinical prescription)
consultationRouter.post(
  '/consultations/:id/complete',
  requireAuth,
  requireRole(['DOCTOR']),
  validateObjectIdParam('id'),
  async (req, res, next) => {
    try {
      const input = CompleteConsultationSchema.parse(req.body);
      const result = await reportService.createReportFromEncounter(
        req.user!.id,
        req.params.id,
        input,
      );

      const consultation = await consultationService.getConsultationById(req.params.id);

      res.status(200).json({
        status: 'success',
        consultation,
        encounter: result.encounter,
        report: result.report,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/consultations/:id/encounter/draft (Doctor saves draft encounter)
consultationRouter.post(
  '/consultations/:id/encounter/draft',
  requireAuth,
  requireRole(['DOCTOR']),
  validateObjectIdParam('id'),
  async (req, res, next) => {
    try {
      const draft = await reportService.saveDraftEncounter(
        req.user!.id,
        req.params.id,
        req.body,
      );
      res.status(200).json({
        status: 'success',
        encounter: draft,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/consultations/:id/encounter/amend (Doctor amends a finalised encounter)
consultationRouter.post(
  '/consultations/:id/encounter/amend',
  requireAuth,
  requireRole(['DOCTOR']),
  validateObjectIdParam('id'),
  async (req, res, next) => {
    try {
      const input = CompleteConsultationSchema.parse(req.body);
      const result = await reportService.amendFinalEncounter(
        req.user!.id,
        req.params.id,
        input,
      );
      res.status(200).json({
        status: 'success',
        previousEncounter: result.previousEncounter,
        encounter: result.newEncounter,
        report: result.report,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/consultations/:id/messages (In-consultation text message)
consultationRouter.post(
  '/consultations/:id/messages',
  requireAuth,
  validateObjectIdParam('id'),
  async (req, res, next) => {
    try {
      const input = SendMessageSchema.parse(req.body);
      const message = await consultationService.sendMessage(
        req.params.id,
        req.user!.id,
        req.user!.role,
        input,
      );

      res.status(201).json({
        status: 'success',
        message,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/consultations/user/history (Get patient consultation history / medical reports)
consultationRouter.get('/consultations/user/history', requireAuth, async (req, res, next) => {
  try {
    const consultations = await consultationService.getUserConsultations(req.user!.id);
    res.status(200).json({
      status: 'success',
      consultations,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/consultations/:id (Get consultation record and RTC token)
// POST /api/v1/consultations/:id/join (Authorizes and joins consultation, generates server token)
consultationRouter.post(
  '/consultations/:id/join',
  requireAuth,
  validateObjectIdParam('id'),
  async (req, res, next) => {
    try {
      const result = await consultationService.joinConsultation(req.user!, req.params.id);
      res.status(200).json({
        status: 'success',
        consultation: result.consultation,
        zego: {
          token: result.token,
          appId: result.appId,
          roomId: result.roomId,
          isMock: result.isMock,
          isConfigured: result.isConfigured,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/consultations/:id/end (Doctor or patient ends call -> DOCUMENTATION_PENDING)
consultationRouter.post(
  '/consultations/:id/end',
  requireAuth,
  validateObjectIdParam('id'),
  async (req, res, next) => {
    try {
      const consultation = await consultationService.endConsultation(req.user!, req.params.id);
      res.status(200).json({
        status: 'success',
        consultation,
        consultationStatus: consultation.status,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/consultations/:id (Get consultation record and RTC token)
consultationRouter.get(
  '/consultations/:id',
  requireAuth,
  validateObjectIdParam('id'),
  async (req, res, next) => {
    try {
      const consultation = await consultationService.getConsultationById(req.params.id);
      if (!consultation) {
        throw new AppError({ statusCode: 404, code: 'NOT_FOUND', message: 'Consultation not found' });
      }

      // Service-layer clinical authorization check: caller must be participant or admin
      authzService.assertCanReadConsultation(req.user!, consultation);

      // Generate ZEGOCLOUD room token for the caller
      const zegoAuth = zegoService.generateRtcToken(req.user!.id, consultation.zegoRoomId);

      res.status(200).json({
        status: 'success',
        consultation,
        zego: {
          token: zegoAuth.token,
          appId: zegoAuth.appId,
          roomId: consultation.zegoRoomId,
          isMock: zegoAuth.isMock,
          isConfigured: !zegoAuth.isMock,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);
