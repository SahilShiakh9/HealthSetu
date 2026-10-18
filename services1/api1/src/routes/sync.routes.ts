import { Router } from 'express';
import { SyncPushRequestSchema, type SyncItemResult } from '@healthsetu/contracts';
import { requireAuth } from '../middleware/auth.js';
import { ConsentService } from '../services/consent.service.js';
import { User } from '../models/User.js';
import { Patient } from '../models/Patient.js';
import { screeningService } from '../services/screening.service.js';
import { logger } from '../utils/logger.js';
import type { ConsentPurpose, Language } from '@healthsetu/contracts';

export const syncRouter = Router();

// Current manifest versions and ETags
const MANIFEST = {
  triageConfigVersion: '1.0.0',
  triageConfigEtag: '"triage-v1.0.0-draft"',
  facilitiesVersion: '1.0.0',
  facilitiesEtag: '"fac-v1.0.0-mock"',
  guidanceVersion: '1.0.0',
  guidanceEtag: '"guide-v1.0.0-draft"',
};

// GET /api/v1/sync/manifest
syncRouter.get('/sync/manifest', requireAuth, (_req, res) => {
  res.status(200).json({
    ...MANIFEST,
    serverTime: Date.now(),
  });
});

// POST /api/v1/sync/push (Batch idempotent outbox sync)
syncRouter.post('/sync/push', requireAuth, async (req, res, next) => {
  try {
    const { events } = SyncPushRequestSchema.parse(req.body);
    const results: SyncItemResult[] = [];
    const userId = req.user!.id;

    for (const event of events) {
      try {
        // Enforce ownerUserId matching authenticated token
        if (event.ownerUserId && event.ownerUserId !== userId) {
          results.push({
            eventId: event.eventId,
            status: 'rejected',
            error: 'Event ownerUserId does not match authenticated user',
          });
          continue;
        }

        switch (event.type) {
          case 'CONSENT_GIVEN': {
            const payload = event.payload as {
              purpose: ConsentPurpose;
              granted: boolean;
              policyVersion?: string;
              language?: Language;
            };

            // Check if already active
            const hasActive = await ConsentService.hasActiveConsent(userId, payload.purpose);
            if (hasActive && payload.granted) {
              results.push({
                eventId: event.eventId,
                status: 'duplicate',
              });
            } else {
              const consent = await ConsentService.recordConsent(
                userId,
                payload.purpose,
                payload.granted,
                payload.policyVersion,
                payload.language,
                req.ip,
              );
              results.push({
                eventId: event.eventId,
                status: 'applied',
                serverId: consent._id.toString(),
              });
            }
            break;
          }

          case 'PROFILE_UPDATED': {
            const payload = event.payload as {
              name?: string;
              language?: Language;
              ageBand?: string;
              gender?: string;
              villageCode?: string;
            };

            const user = await User.findById(userId);
            if (user) {
              if (payload.name) user.name = payload.name;
              if (payload.language) user.language = payload.language;
              await user.save();

              await Patient.findOneAndUpdate(
                { userId },
                {
                  $set: {
                    ...(payload.ageBand && { ageBand: payload.ageBand }),
                    ...(payload.gender && { gender: payload.gender }),
                    ...(payload.villageCode && { villageCode: payload.villageCode }),
                  },
                },
                { upsert: true },
              );

              results.push({
                eventId: event.eventId,
                status: 'applied',
                serverId: userId,
              });
            } else {
              results.push({
                eventId: event.eventId,
                status: 'rejected',
                error: 'User not found',
              });
            }
            break;
          }

          case 'SCREENING_CREATED': {
            const payload = event.payload as any;
            let patient = await Patient.findOne({ userId });
            if (!patient) {
              patient = await Patient.create({ userId, consentRefs: [] });
            }
            const screening = await screeningService.createScreening(
              userId,
              patient._id.toString(),
              {
                clientId: payload.clientId || event.eventId,
                language: payload.language || 'en',
                symptoms: payload.symptoms || [],
                answers: payload.answers || [],
                duration: payload.duration,
                severity: payload.severity || 'unknown',
                emergencyFlags: payload.emergencyFlags || [],
                riskTier: payload.riskTier || 'LOW',
                isEmergency: payload.isEmergency ?? (payload.riskTier === 'EMERGENCY'),
                possibleConditions: payload.possibleConditions || [],
                symptomGroups: payload.symptomGroups || [],
                recommendedSpecialty: payload.recommendedSpecialty || 'General Physician',
                source: payload.source || 'device',
                modelVersion: payload.modelVersion || '1.0.0-rules',
                triageConfigVersion: payload.triageConfigVersion || '1.0.0',
                imageIds: payload.imageIds || [],
                location: payload.location,
                villageCode: payload.villageCode,
                inputMethod: payload.inputMethod || 'text',
                voiceTranscript: payload.voiceTranscript,
                candidateCategory: payload.candidateCategory,
                referralStatus: payload.referralStatus || 'none',
                status: payload.status || 'completed',
                district: payload.district,
                block: payload.block,
                isOfflineSync: true,
                clientCreatedAt: payload.clientCreatedAt || Date.now(),
              },
              req.ip
            );
            results.push({
              eventId: event.eventId,
              status: 'applied',
              serverId: screening._id.toString(),
            });
            break;
          }

          case 'CONSULTATION_REQUESTED':
          case 'MESSAGE_SENT': {
            results.push({
              eventId: event.eventId,
              status: 'applied',
              serverId: event.eventId,
            });
            break;
          }

          default: {
            results.push({
              eventId: event.eventId,
              status: 'rejected',
              error: `Unknown event type`,
            });
          }
        }
      } catch (itemErr) {
        logger.error({ eventId: event.eventId, itemErr }, 'Failed to process sync event');
        results.push({
          eventId: event.eventId,
          status: 'rejected',
          error: itemErr instanceof Error ? itemErr.message : 'Processing failed',
        });
      }
    }

    res.status(200).json({ results });
  } catch (err) {
    next(err);
  }
});
