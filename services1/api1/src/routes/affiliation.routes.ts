import { Router } from 'express';
import {
  RequestAffiliationSchema,
  InviteDoctorSchema,
  UpdateAffiliationStatusSchema,
} from '@healthsetu/contracts';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { AffiliationService } from '../services/affiliation.service.js';
import { AppError } from '../middleware/errorHandler.js';

export const affiliationRouter = Router();

// Doctor requests affiliation with a facility
affiliationRouter.post(
  '/affiliations/request',
  requireAuth,
  requireRole('DOCTOR'),
  async (req, res, next) => {
    try {
      const input = RequestAffiliationSchema.parse(req.body);
      const affiliation = await AffiliationService.requestAffiliation(
        req.user!.id,
        input.facilityId,
        input.roleInFacility,
        input.notes,
      );
      res.status(201).json({ affiliation });
    } catch (err) {
      next(err);
    }
  },
);

// Hospital admin invites a doctor
affiliationRouter.post(
  '/affiliations/invite',
  requireAuth,
  requireRole('HOSPITAL_ADMIN', 'ADMIN'),
  async (req, res, next) => {
    try {
      const input = InviteDoctorSchema.parse(req.body);
      const affiliation = await AffiliationService.inviteDoctor(
        req.user!.id,
        input.facilityId,
        {
          email: input.doctorEmail,
          doctorUserId: input.doctorId,
        },
        input.roleInFacility,
        input.notes,
      );
      res.status(200).json({ affiliation });
    } catch (err) {
      next(err);
    }
  },
);

// Hospital admin approves/rejects/revokes affiliation
affiliationRouter.patch(
  '/affiliations/:id/status',
  requireAuth,
  requireRole('HOSPITAL_ADMIN', 'ADMIN'),
  async (req, res, next) => {
    try {
      const input = UpdateAffiliationStatusSchema.parse(req.body);
      const affiliation = await AffiliationService.updateAffiliationStatus(
        req.user!.id,
        req.params.id,
        input.status,
        input.notes,
      );
      res.status(200).json({ affiliation });
    } catch (err) {
      next(err);
    }
  },
);

// Doctor fetches their own affiliations
affiliationRouter.get(
  '/affiliations/doctor',
  requireAuth,
  requireRole('DOCTOR'),
  async (req, res, next) => {
    try {
      const { affiliations, doctorProfile } = await AffiliationService.getDoctorAffiliations(req.user!.id);
      res.status(200).json({ affiliations, doctorProfile });
    } catch (err) {
      next(err);
    }
  },
);

// Hospital admin fetches all affiliations & doctor roster for a facility
affiliationRouter.get(
  '/affiliations/facility/:facilityId',
  requireAuth,
  requireRole('HOSPITAL_ADMIN', 'ADMIN', 'PHC_OFFICER'),
  async (req, res, next) => {
    try {
      const affiliations = await AffiliationService.getFacilityAffiliations(
        req.params.facilityId,
        req.user!.role === 'ADMIN' ? undefined : req.user!.id,
      );
      res.status(200).json({ affiliations });
    } catch (err) {
      next(err);
    }
  },
);
