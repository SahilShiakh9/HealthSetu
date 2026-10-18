import { Types } from 'mongoose';
import { Consent, type IConsent } from '../models/Consent.js';
import { Patient } from '../models/Patient.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { AppError } from '../middleware/errorHandler.js';
import type { ConsentPurpose, Language } from '@healthsetu/contracts';

export class ConsentService {
  static async recordConsent(
    subjectId: string,
    purpose: ConsentPurpose,
    granted: boolean,
    policyVersion: string = '1.0.0',
    language: Language = 'en',
    ip?: string,
  ): Promise<IConsent> {
    const consent = await Consent.create({
      subjectId: new Types.ObjectId(subjectId),
      purpose,
      granted,
      policyVersion,
      language,
      givenAt: new Date(),
      ...(granted ? {} : { revokedAt: new Date() }),
    });

    const consentId = consent._id as Types.ObjectId;

    // Link to patient profile if patient exists
    await Patient.findOneAndUpdate(
      { userId: subjectId },
      { $addToSet: { consentRefs: consentId } },
    );

    await AuditEvent.create({
      actorId: new Types.ObjectId(subjectId),
      action: granted ? 'CONSENT_GRANTED' : 'CONSENT_DENIED',
      resourceType: 'Consent',
      resourceId: consentId.toString(),
      metadata: { purpose, policyVersion },
      ip,
      at: new Date(),
    });

    return consent as unknown as IConsent;
  }

  static async listUserConsents(subjectId: string): Promise<IConsent[]> {
    return Consent.find({ subjectId }).sort({ createdAt: -1 });
  }

  static async revokeConsent(subjectId: string, consentId: string, ip?: string): Promise<IConsent> {
    const consent = await Consent.findOne({
      _id: consentId,
      subjectId,
    });

    if (!consent) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Consent record not found',
      });
    }

    consent.granted = false;
    consent.revokedAt = new Date();
    await consent.save();

    await AuditEvent.create({
      actorId: new Types.ObjectId(subjectId),
      action: 'CONSENT_REVOKED',
      resourceType: 'Consent',
      resourceId: consent._id.toString(),
      metadata: { purpose: consent.purpose },
      ip,
      at: new Date(),
    });

    return consent;
  }

  static async hasActiveConsent(subjectId: string, purpose: ConsentPurpose): Promise<boolean> {
    const active = await Consent.findOne({
      subjectId,
      purpose,
      granted: true,
      revokedAt: null,
    }).sort({ createdAt: -1 });

    return !!active;
  }
}
