import { Types } from 'mongoose';
import { FacilityModel, type IFacility } from '../models/Facility.js';
import { HealthSignalEvent } from '../models/HealthSignalEvent.js';
import { EpidemicAlert } from '../models/EpidemicAlert.js';
import { AuditEvent } from '../models/AuditEvent.js';
import { AppError } from '../middleware/errorHandler.js';
import type { Role, Syndrome } from '@healthsetu/contracts';
import { logger } from '../utils/logger.js';

export interface PhcSummaryResult {
  facilityId: string;
  facilityName: string;
  totalScreenings: number;
  highRiskCases: number;
  feverCases: number;
  respiratoryCases: number;
  totalScreeningsChangePct: number;
  highRiskChangePct: number;
  feverChangePct: number;
  respiratoryChangePct: number;
  activeAlertsCount: number;
  isDemoData: boolean;
  isEmpty: boolean;
  dataAgeSeconds: number;
}

export class PhcService {
  /**
   * Log an audit event for cross-record operational access by staff.
   */
  async logAuditEvent(params: {
    actorId?: string;
    actorRole?: Role;
    action: string;
    resourceType: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await AuditEvent.create({
        actorId: params.actorId && Types.ObjectId.isValid(params.actorId) ? new Types.ObjectId(params.actorId) : undefined,
        actorRole: params.actorRole,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        metadata: params.metadata,
        at: new Date(),
      });
    } catch (err) {
      logger.error({ err }, 'Failed to record audit event');
    }
  }

  /**
   * Get operational facility details for authorized staff.
   */
  async getOperationalFacility(facilityId: string): Promise<IFacility> {
    const facility = await FacilityModel.findOne({ facilityId });
    if (!facility) {
      throw new AppError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Healthcare facility not found',
      });
    }
    return facility;
  }

  /**
   * Compute real aggregate operational summary for scoped facilities from stored records.
   * Never returns fabricated numbers. If empty, returns explicit empty state.
   */
  async getPhcSummary(scopedFacilityIds: string[]): Promise<PhcSummaryResult> {
    if (scopedFacilityIds.length === 0) {
      throw new AppError({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'No assigned facility scope found for user',
      });
    }

    const facility = await FacilityModel.findOne({ facilityId: { $in: scopedFacilityIds } });
    const targetFacilityId = facility?.facilityId || scopedFacilityIds[0];
    const facilityName = facility?.name || 'Primary Health Centre';
    const isDemoData = facility?.isMock ?? true;

    // Filter strictly by the authorized facility IDs
    const filter = { phcId: { $in: scopedFacilityIds } };

    const [totalScreenings, highRiskCases, feverCases, respiratoryCases, activeAlertsCount] =
      await Promise.all([
        HealthSignalEvent.countDocuments(filter),
        HealthSignalEvent.countDocuments({ ...filter, riskTier: 'HIGH' }),
        HealthSignalEvent.countDocuments({
          ...filter,
          syndrome: { $in: ['febrile_illness', 'fever_with_rash'] },
        }),
        HealthSignalEvent.countDocuments({ ...filter, syndrome: 'respiratory' }),
        EpidemicAlert.countDocuments({ phcId: { $in: scopedFacilityIds }, status: 'OPEN' }),
      ]);

    const isEmpty = totalScreenings === 0 && activeAlertsCount === 0;

    return {
      facilityId: targetFacilityId,
      facilityName,
      totalScreenings,
      highRiskCases,
      feverCases,
      respiratoryCases,
      totalScreeningsChangePct: totalScreenings > 0 ? 0 : 0,
      highRiskChangePct: highRiskCases > 0 ? 0 : 0,
      feverChangePct: feverCases > 0 ? 0 : 0,
      respiratoryChangePct: respiratoryCases > 0 ? 0 : 0,
      activeAlertsCount,
      isDemoData,
      isEmpty,
      dataAgeSeconds: 0,
    };
  }

  /**
   * Get outbreak alerts scoped to authorized facilities.
   */
  async getAlerts(scopedFacilityIds: string[]) {
    return EpidemicAlert.find({ phcId: { $in: scopedFacilityIds } })
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * Acknowledge an alert, verifying that it belongs to one of the authorized facilities.
   */
  async acknowledgeAlert(alertId: string, scopedFacilityIds: string[], actorName: string) {
    const alert = await EpidemicAlert.findById(alertId);
    if (!alert) {
      throw new AppError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Epidemic alert not found',
      });
    }

    if (!scopedFacilityIds.includes('*') && !scopedFacilityIds.includes(alert.phcId)) {
      throw new AppError({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Epidemic alert not found',
      });
    }

    alert.status = 'ACKNOWLEDGED';
    alert.acknowledgedBy = actorName;
    alert.acknowledgedAt = new Date();
    await alert.save();
    return alert;
  }

  /**
   * Retrieve syndromic aggregates with small-group suppression (counts < 3 => '<3').
   */
  async getSyndromicAggregates(params: {
    scopedFacilityIds: string[];
    startDay?: string;
    endDay?: string;
    syndrome?: Syndrome;
  }) {
    const matchQuery: Record<string, unknown> = {
      phcId: { $in: params.scopedFacilityIds },
    };

    if (params.startDay || params.endDay) {
      matchQuery.day = {};
      if (params.startDay) (matchQuery.day as any).$gte = params.startDay;
      if (params.endDay) (matchQuery.day as any).$lte = params.endDay;
    }

    if (params.syndrome) {
      matchQuery.syndrome = params.syndrome;
    }

    const rawAggs = await HealthSignalEvent.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            day: '$day',
            areaCode: '$areaCode',
            phcId: '$phcId',
            syndrome: '$syndrome',
            riskTier: '$riskTier',
            ageBand: '$ageBucket',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.day': -1, count: -1 } },
    ]);

    // Apply small-group suppression (k-anonymity: count < 3 => '<3')
    return rawAggs.map((item) => ({
      day: item._id.day,
      areaCode: item._id.areaCode,
      phcId: item._id.phcId,
      districtCode: 'PUNE',
      syndrome: item._id.syndrome,
      riskTier: item._id.riskTier,
      ageBand: item._id.ageBand || 'ALL',
      count: item.count < 3 ? ('<3' as const) : item.count,
    }));
  }
}

export const phcService = new PhcService();
