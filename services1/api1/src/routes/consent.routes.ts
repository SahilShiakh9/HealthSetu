import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { ConsentService } from '../services/consent.service.js';
import { ConsentPurposeEnum, LanguageEnum } from '@healthsetu/contracts';

export const consentRouter = Router();

const RecordConsentSchema = z.object({
  purpose: ConsentPurposeEnum,
  granted: z.boolean().default(true),
  policyVersion: z.string().default('1.0.0'),
  language: LanguageEnum.default('en'),
});

// POST /api/v1/consents
consentRouter.post('/consents', requireAuth, async (req, res, next) => {
  try {
    const input = RecordConsentSchema.parse(req.body);
    const consent = await ConsentService.recordConsent(
      req.user!.id,
      input.purpose,
      input.granted,
      input.policyVersion,
      input.language,
      req.ip,
    );

    res.status(201).json({
      consent: {
        id: consent._id.toString(),
        purpose: consent.purpose,
        granted: consent.granted,
        policyVersion: consent.policyVersion,
        language: consent.language,
        givenAt: consent.givenAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/consents/me
consentRouter.get('/consents/me', requireAuth, async (req, res, next) => {
  try {
    const consents = await ConsentService.listUserConsents(req.user!.id);
    res.status(200).json({
      consents: consents.map((c) => ({
        id: c._id.toString(),
        purpose: c.purpose,
        granted: c.granted,
        policyVersion: c.policyVersion,
        language: c.language,
        givenAt: c.givenAt,
        revokedAt: c.revokedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/consents/:id/revoke
consentRouter.post('/consents/:id/revoke', requireAuth, async (req, res, next) => {
  try {
    const consent = await ConsentService.revokeConsent(req.user!.id, req.params.id, req.ip);
    res.status(200).json({
      message: 'Consent revoked successfully',
      consentId: consent._id.toString(),
      purpose: consent.purpose,
      granted: consent.granted,
      revokedAt: consent.revokedAt,
    });
  } catch (err) {
    next(err);
  }
});
