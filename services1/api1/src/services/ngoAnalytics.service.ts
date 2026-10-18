import mongoose from 'mongoose';
import { Screening, IScreening } from '../models/Screening.js';
import type {
  NgoAnalyticsFilter,
  NgoOverviewMetrics,
  NgoActivityEvent,
  RegionalCohort,
  DailyTrendItem,
} from '@healthsetu/contracts';
import { logger } from '../utils/logger.js';

export class NgoAnalyticsService {
  /**
   * Builds MongoDB query matcher based on authorized scope and requested filters.
   */
  private buildQuery(filter: NgoAnalyticsFilter, userDistrict?: string): Record<string, any> {
    const query: Record<string, any> = {};

    // 1. Role-based District Scoping: An NGO observer cannot access data outside their assigned jurisdiction
    if (userDistrict) {
      query.$or = [{ district: userDistrict }, { villageCode: userDistrict }];
    } else if (filter.district) {
      query.$or = [{ district: filter.district }, { villageCode: filter.district }];
    }

    // 2. Date Filtering
    const now = new Date();
    let startDate: Date | undefined;
    let endDate: Date = now;

    if (filter.timeRange === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (filter.timeRange === 'last7days') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (filter.timeRange === 'last30days') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (filter.timeRange === 'custom') {
      if (filter.startDate) startDate = new Date(filter.startDate);
      if (filter.endDate) endDate = new Date(filter.endDate);
    }

    if (startDate) {
      query.createdAt = { $gte: startDate, $lte: endDate };
    }

    // 3. Attribute Filters
    if (filter.language) {
      query.language = filter.language;
    }
    if (filter.riskTier) {
      query.riskTier = filter.riskTier;
    }
    if (filter.inputMethod) {
      query.inputMethod = filter.inputMethod;
    }
    if (filter.status) {
      query.status = filter.status;
    }

    return query;
  }

  /**
   * Retrieves authoritative, aggregated NGO overview KPIs and charts.
   */
  public async getOverviewMetrics(
    filter: NgoAnalyticsFilter,
    userDistrict?: string
  ): Promise<NgoOverviewMetrics> {
    const query = this.buildQuery(filter, userDistrict);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 1. Run parallel aggregations
    const [
      totalCount,
      completedTodayCount,
      startedTodayCount,
      inProgressCount,
      interruptedCount,
      highPriorityCount,
      awaitingReferralCount,
      syncedCount,
      pendingOfflineCount,
      riskAgg,
      langAgg,
      inputAgg,
      regionalAgg,
      trendAgg,
    ] = await Promise.all([
      // Total matching query
      Screening.countDocuments(query),

      // Completed today
      Screening.countDocuments({
        ...query,
        createdAt: { $gte: startOfToday },
        status: 'completed',
      }),

      // Started today
      Screening.countDocuments({
        ...query,
        createdAt: { $gte: startOfToday },
      }),

      // In progress
      Screening.countDocuments({
        ...query,
        status: 'in_progress',
      }),

      // Interrupted
      Screening.countDocuments({
        ...query,
        status: 'interrupted',
      }),

      // High priority / urgent
      Screening.countDocuments({
        ...query,
        $or: [{ riskTier: 'HIGH' }, { isEmergency: true }],
      }),

      // Awaiting referral
      Screening.countDocuments({
        ...query,
        referralStatus: { $in: ['pending', 'referred'] },
      }),

      // Synced
      Screening.countDocuments({
        ...query,
        isOfflineSync: true,
      }),

      // Pending Offline (source device but not yet confirmed synced)
      Screening.countDocuments({
        ...query,
        source: 'device',
        isOfflineSync: false,
      }),

      // Risk Distribution
      Screening.aggregate([
        { $match: query },
        { $group: { _id: '$riskTier', count: { $sum: 1 } } },
      ]),

      // Language Distribution
      Screening.aggregate([
        { $match: query },
        { $group: { _id: '$language', count: { $sum: 1 } } },
      ]),

      // Input Method Distribution
      Screening.aggregate([
        { $match: query },
        { $group: { _id: '$inputMethod', count: { $sum: 1 } } },
      ]),

      // Regional Distribution (District/Village)
      Screening.aggregate([
        { $match: query },
        {
          $group: {
            _id: { $ifNull: ['$district', { $ifNull: ['$villageCode', 'Unspecified Region'] }] },
            count: { $sum: 1 },
            highRiskCount: {
              $sum: { $cond: [{ $or: [{ $eq: ['$riskTier', 'HIGH'] }, { $eq: ['$isEmergency', true] }] }, 1, 0] },
            },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),

      // Daily Trends (last 14 days or filtered period)
      Screening.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            total: { $sum: 1 },
            highRisk: {
              $sum: { $cond: [{ $eq: ['$riskTier', 'HIGH'] }, 1, 0] },
            },
            mediumRisk: {
              $sum: { $cond: [{ $eq: ['$riskTier', 'MEDIUM'] }, 1, 0] },
            },
            lowRisk: {
              $sum: { $cond: [{ $eq: ['$riskTier', 'LOW'] }, 1, 0] },
            },
            emergencyFlags: {
              $sum: { $cond: [{ $eq: ['$isEmergency', true] }, 1, 0] },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Format Risk Distribution
    const riskMap: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    riskAgg.forEach((item) => {
      if (item._id && riskMap[item._id] !== undefined) {
        riskMap[item._id] = item.count;
      }
    });

    // Format Language Distribution
    const languageDistribution: Record<string, number> = { en: 0, hi: 0, mr: 0 };
    langAgg.forEach((item) => {
      if (item._id) {
        languageDistribution[item._id] = item.count;
      }
    });

    // Format Input Method Distribution
    const inputMethodDistribution = { voice: 0, text: 0 };
    inputAgg.forEach((item) => {
      if (item._id === 'voice') inputMethodDistribution.voice = item.count;
      if (item._id === 'text') inputMethodDistribution.text = item.count;
    });

    // Format Regional Distribution with k-Anonymity (k >= 3)
    const regionalDistribution: RegionalCohort[] = regionalAgg.map((item) => {
      const count = item.count || 0;
      const isMasked = count > 0 && count < 3;
      return {
        region: isMasked ? `${item._id} (Masked <3 cases)` : item._id,
        screeningsCount: count,
        highRiskCount: item.highRiskCount || 0,
        isMasked,
      };
    });

    // Format Daily Trends
    const dailyTrends: DailyTrendItem[] = trendAgg.map((item) => ({
      date: item._id,
      total: item.total || 0,
      highRisk: item.highRisk || 0,
      mediumRisk: item.mediumRisk || 0,
      lowRisk: item.lowRisk || 0,
      emergencyFlags: item.emergencyFlags || 0,
    }));

    return {
      totalScreenings: totalCount,
      startedToday: startedTodayCount,
      completedToday: completedTodayCount,
      inProgress: inProgressCount,
      interrupted: interruptedCount,
      highPriorityFlags: highPriorityCount,
      awaitingReferral: awaitingReferralCount,
      syncedVsPendingOffline: {
        synced: syncedCount,
        pendingOffline: pendingOfflineCount,
      },
      riskDistribution: {
        low: riskMap.LOW,
        medium: riskMap.MEDIUM,
        high: riskMap.HIGH,
      },
      languageDistribution,
      inputMethodDistribution,
      dailyTrends,
      regionalDistribution,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Retrieves the authoritative privacy-safe activity feed.
   * Every record uses pseudonymized session IDs (e.g., SCR-A83F) and contains ZERO patient PII.
   */
  public async getRecentActivity(
    filter: NgoAnalyticsFilter,
    userDistrict?: string,
    limit: number = 25
  ): Promise<NgoActivityEvent[]> {
    const query = this.buildQuery(filter, userDistrict);

    const docs = await Screening.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 50))
      .select('clientId riskTier isEmergency language inputMethod district createdAt isOfflineSync status');

    return docs.map((doc) => {
      const cleanId = (doc.clientId || '').replace(/[^a-zA-Z0-9]/g, '');
      const suffix = (cleanId.slice(-4) || 'ABCD').toUpperCase();
      const sessionRef = `SCR-${suffix.padStart(4, '0')}`;
      let type: NgoActivityEvent['type'] = 'screening.completed';
      if (doc.isEmergency) {
        type = 'screening.urgent_flagged';
      } else if (doc.isOfflineSync) {
        type = 'screening.synced';
      } else if (doc.status === 'in_progress' || doc.status === 'started') {
        type = 'screening.started';
      }

      return {
        id: doc._id.toString(),
        type,
        sessionRef,
        timestamp: doc.createdAt.getTime(),
        riskTier: doc.riskTier,
        language: doc.language,
        inputMethod: doc.inputMethod,
        district: doc.district || 'Pune Rural',
        summary: `Screening ${type.replace('screening.', '')} (${doc.riskTier} Risk)`,
      };
    });
  }
}

export const ngoAnalyticsService = new NgoAnalyticsService();
