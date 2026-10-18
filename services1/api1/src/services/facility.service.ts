import {
  MOCK_FACILITIES,
  rankFacilities,
  mergeAndDeduplicateFacilities,
  type Facility,
  type PublicFacility,
  type RankedFacility,
  type NearbyFacilitiesQuery,
} from '@healthsetu/contracts';
import type { PipelineStage } from 'mongoose';
import { FacilityModel, type IFacility } from '../models/Facility.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import { env } from '../config/env.js';
import { overpassService, type LiveDiscoveryResult } from './overpass.service.js';
import { geoapifyService } from './geoapify.service.js';

export class FacilityService {
  /**
   * Convert Mongoose document or contract Facility to PublicFacility schema object.
   * Excludes operational metrics (capacityPerDay, currentLoad, staff, queues).
   */
  toPublicFacility(doc: IFacility | Facility | PublicFacility | any): PublicFacility {
    const isDoc = 'facilityId' in doc;
    return {
      id: isDoc ? (doc as IFacility).facilityId : (doc as Facility).id,
      name: doc.name,
      type: doc.type,
      location: doc.location,
      villageCode: doc.villageCode,
      districtCode: doc.districtCode,
      services: doc.services || [],
      servicesMask: doc.servicesMask,
      open24x7: doc.open24x7,
      openHours: doc.openHours || '8:00 AM - 4:00 PM',
      phone: doc.phone || '',
      address: doc.address || '',
      sourceAttribution: doc.sourceAttribution || (doc.dataSource === 'GEOAPIFY' ? 'Powered by Geoapify | © OpenStreetMap contributors' : doc.dataSource === 'OPEN_STREET_MAP' ? '© OpenStreetMap contributors' : undefined),
      osmId: doc.osmId,
      emergencyCapable: doc.emergencyCapable,
      dataSource: (doc as any).dataSource || 'MOCK_DEMO',
      sources: (doc as any).sources || [(doc as any).dataSource || 'MOCK_DEMO'],
      verifiedAt: (doc as any).verifiedAt
        ? typeof (doc as any).verifiedAt === 'object' && 'toISOString' in (doc as any).verifiedAt
          ? (doc as any).verifiedAt.toISOString()
          : String((doc as any).verifiedAt)
        : undefined,
      isMock: doc.isMock ?? (doc.dataSource === 'MOCK_DEMO'),
      updatedAt: isDoc ? (doc as IFacility).updatedAtTimestamp || Date.now() : (doc as Facility).updatedAt,
    };
  }

  /**
   * Convert Mongoose document to full Facility schema object (staff/operational use).
   */
  private toContractFacility(doc: IFacility | any): Facility {
    const isDoc = 'facilityId' in doc;
    return {
      id: isDoc ? (doc as IFacility).facilityId : (doc as Facility).id,
      name: doc.name,
      type: doc.type,
      location: doc.location,
      villageCode: doc.villageCode,
      districtCode: doc.districtCode,
      services: doc.services || [],
      servicesMask: doc.servicesMask || 0,
      open24x7: doc.open24x7,
      openHours: doc.openHours || '8:00 AM - 4:00 PM',
      phone: doc.phone || '',
      address: doc.address || '',
      sourceAttribution: doc.sourceAttribution,
      osmId: doc.osmId,
      capacityPerDay: doc.capacityPerDay,
      currentLoad: doc.currentLoad,
      emergencyCapable: doc.emergencyCapable,
      dataSource: doc.dataSource || 'MOCK_DEMO',
      verifiedAt: doc.verifiedAt ? (typeof doc.verifiedAt === 'object' && 'toISOString' in doc.verifiedAt ? doc.verifiedAt.toISOString() : String(doc.verifiedAt)) : undefined,
      isMock: doc.isMock ?? (doc.dataSource === 'MOCK_DEMO'),
      updatedAt: isDoc ? (doc as IFacility).updatedAtTimestamp || Date.now() : (doc as Facility).updatedAt,
    };
  }

  /**
   * Automatically seed MOCK_FACILITIES and real OSM datasets if database collection is empty.
   */
  async seedDefaultFacilities(): Promise<void> {
    const count = await FacilityModel.countDocuments();
    if (count === 0) {
      logger.info('Seeding default facilities and real OSM healthcare records into MongoDB...');
      const docs = MOCK_FACILITIES.map((f) => ({
        facilityId: f.id,
        name: f.name,
        type: f.type,
        location: f.location,
        villageCode: f.villageCode,
        districtCode: f.districtCode,
        services: f.services,
        servicesMask: f.servicesMask,
        open24x7: f.open24x7,
        openHours: f.openHours,
        phone: f.phone,
        capacityPerDay: f.capacityPerDay,
        currentLoad: f.currentLoad,
        emergencyCapable: f.emergencyCapable,
        dataSource: 'MOCK_DEMO',
        isMock: f.isMock,
        updatedAtTimestamp: f.updatedAt,
      }));
      await FacilityModel.insertMany(docs);
      await FacilityModel.collection.createIndex({ location: '2dsphere' });
      logger.info({ count: docs.length }, 'Default demo facilities seeded.');
    } else {
      await FacilityModel.collection.createIndex({ location: '2dsphere' });
    }

    // Ensure OSM facilities are also present
    try {
      const { ingestOsmFacilitiesFromFile } = await import('../scripts/ingest_osm.js');
      await ingestOsmFacilitiesFromFile();
    } catch (e) {
      logger.warn({ err: e }, 'Initial OSM file auto-ingest note');
    }
  }

  /**
   * Explain geospatial index utilization for performance diagnostics.
   */
  async explainNearbyQuery(lat: number, lng: number, maxRadiusKm: number = 50) {
    return FacilityModel.collection.find({
      location: {
        $nearSphere: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat],
          },
          $maxDistance: maxRadiusKm * 1000,
        },
      },
    }).explain();
  }

  /**
   * Retrieve, discover via live Overpass, deduplicate, and rank facilities around coordinate.
   * Merges existing database records with live Overpass discoveries.
   */
  async getNearbyFacilitiesDetailed(query: NearbyFacilitiesQuery): Promise<{
    facilities: RankedFacility[];
    effectiveRadiusKm: number;
    breakdown: { within10km: number; within25km: number; within50km: number };
    discovery: {
      liveAttempted: boolean;
      liveSuccess: boolean;
      provider: string;
      durationMs: number;
      dbCount: number;
      liveRawCount: number;
      validLiveCount: number;
      newLiveAdded: number;
      duplicatesRemoved: number;
      strategy?: string;
      note?: string;
      error?: string;
    };
  }> {
    const { lat, lng, riskTier, syndrome, maxRadiusKm = 50 } = query;

    // Strict boundary validation
    if (typeof lat !== 'number' || isNaN(lat) || lat < -90 || lat > 90) {
      throw new AppError({
        statusCode: 400,
        code: 'INVALID_COORDINATES',
        message: 'Invalid latitude: must be between -90 and 90',
      });
    }
    if (typeof lng !== 'number' || isNaN(lng) || lng < -180 || lng > 180) {
      throw new AppError({
        statusCode: 400,
        code: 'INVALID_COORDINATES',
        message: 'Invalid longitude: must be between -180 and 180',
      });
    }

    const effectiveRadiusKm = Math.min(Math.max(Number(maxRadiusKm) || 25, 1), 100);
    const maxDistanceMeters = effectiveRadiusKm * 1000;

    const buildPipeline = (radiusMeters: number): PipelineStage[] => [
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [lng, lat] as [number, number], // Strictly [longitude, latitude]
          },
          distanceField: 'calculatedDistanceMeters',
          maxDistance: radiusMeters,
          spherical: true,
        },
      },
      {
        $project: {
          facilityId: 1,
          name: 1,
          type: 1,
          location: 1,
          districtCode: 1,
          services: 1,
          servicesMask: 1,
          open24x7: 1,
          openHours: 1,
          phone: 1,
          address: 1,
          sourceAttribution: 1,
          osmId: 1,
          emergencyCapable: 1,
          dataSource: 1,
          isMock: 1,
          updatedAtTimestamp: 1,
          calculatedDistanceMeters: 1,
        },
      },
      { $limit: 100 },
    ];

    // 1. Fetch existing database records (only if strategy includes mongodb or hybrid)
    const effectiveStrategy = query.strategy || env.FACILITY_DISCOVERY_STRATEGY || 'hybrid';
    const shouldQueryDb = effectiveStrategy === 'mongodb' || effectiveStrategy === 'hybrid';
    let dbFacilities: Facility[] = [];

    if (shouldQueryDb) {
      let docs: any[] = [];
      try {
        docs = await FacilityModel.aggregate(buildPipeline(maxDistanceMeters));
      } catch {
        const dbCount = await FacilityModel.countDocuments();
        if (dbCount === 0) {
          await this.seedDefaultFacilities();
          try {
            docs = await FacilityModel.aggregate(buildPipeline(maxDistanceMeters));
          } catch {
            docs = [];
          }
        }
      }
      dbFacilities = docs.map((d) => this.toContractFacility(d));
    }

    // 2. Concurrently execute live discovery based on configured strategy (mongodb | geoapify | overpass | hybrid)
    let liveDiscovery: LiveDiscoveryResult = {
      attempted: false,
      success: false,
      provider: effectiveStrategy,
      durationMs: 0,
      rawCount: 0,
      validCount: 0,
      facilities: [],
    };

    try {
      if (effectiveStrategy === 'mongodb') {
        liveDiscovery = {
          attempted: false,
          success: true,
          provider: 'mongodb-local',
          durationMs: 0,
          rawCount: 0,
          validCount: 0,
          facilities: [],
          strategy: 'mongodb-only',
          note: 'Local MongoDB spatial query executed without external API call',
        };
      } else if (effectiveStrategy === 'geoapify') {
        liveDiscovery = await geoapifyService.discoverHealthcareFacilities(
          lat,
          lng,
          maxDistanceMeters,
        );
      } else if (effectiveStrategy === 'overpass') {
        liveDiscovery = await overpassService.discoverHealthcareFacilities(
          lat,
          lng,
          maxDistanceMeters,
        );
      } else {
        // 'hybrid' strategy:
        // Try Geoapify first if API key configured; fallback to OpenStreetMap Overpass
        if (env.GEOAPIFY_API_KEY && env.GEOAPIFY_API_KEY.trim().length > 0) {
          liveDiscovery = await geoapifyService.discoverHealthcareFacilities(
            lat,
            lng,
            maxDistanceMeters,
          );
          if (!liveDiscovery.success) {
            logger.info('Primary Geoapify discovery had no results/failed; falling back to Overpass...');
            const fallback = await overpassService.discoverHealthcareFacilities(
              lat,
              lng,
              maxDistanceMeters,
            );
            liveDiscovery = {
              ...fallback,
              note: `Primary Geoapify attempted (${liveDiscovery.error || 'no results'}), fell back to Overpass.`,
            };
          }
        } else {
          liveDiscovery = await overpassService.discoverHealthcareFacilities(
            lat,
            lng,
            maxDistanceMeters,
          );
          liveDiscovery.note = 'GEOAPIFY_API_KEY not configured; live discovery served by OpenStreetMap Overpass';
        }
      }
    } catch (err: any) {
      logger.warn({ err: err?.message, strategy: effectiveStrategy }, 'Live discovery invocation caught error');
      liveDiscovery = {
        attempted: true,
        success: false,
        provider: effectiveStrategy,
        durationMs: 0,
        rawCount: 0,
        validCount: 0,
        facilities: [],
        error: err?.message,
      };
    }

    // 3. Deduplicate live discoveries against database records using stable OSM identity, spatial matching, and provenance preservation
    const mergedFacilities = mergeAndDeduplicateFacilities(dbFacilities, liveDiscovery.facilities);
    const duplicatesRemoved = Math.max(0, (dbFacilities.length + liveDiscovery.facilities.length) - mergedFacilities.length);
    const newLiveFacilities = mergedFacilities.filter((f) => !dbFacilities.some((dbF) => dbF.id === f.id));

    // 4. Asynchronously persist new live discoveries into MongoDB for offline caching & subsequent index scans
    if (newLiveFacilities.length > 0) {
      const upsertOps = newLiveFacilities.map((f) => ({
        updateOne: {
          filter: { facilityId: f.id },
          update: {
            $setOnInsert: {
              facilityId: f.id,
              osmId: f.osmId,
              name: f.name,
              type: f.type,
              location: f.location,
              districtCode: f.districtCode || 'Live Discovered',
              services: f.services,
              servicesMask: f.servicesMask,
              open24x7: f.open24x7,
              openHours: f.openHours || '',
              phone: f.phone || '',
              address: f.address || '',
              sourceAttribution: f.sourceAttribution || (f.dataSource === 'GEOAPIFY' ? 'Powered by Geoapify | © OpenStreetMap contributors' : '© OpenStreetMap contributors'),
              emergencyCapable: f.emergencyCapable,
              dataSource: f.dataSource || 'OPEN_STREET_MAP',
              isMock: false,
              updatedAtTimestamp: f.updatedAt || Date.now(),
            },
          },
          upsert: true,
        },
      }));

      FacilityModel.bulkWrite(upsertOps, { ordered: false }).catch((err) => {
        logger.warn({ err: err?.message }, 'Background MongoDB cache upsert note');
      });
    }

    // If still 0 matching facilities honestly return empty results
    if (mergedFacilities.length === 0) {
      return {
        facilities: [],
        effectiveRadiusKm,
        breakdown: { within10km: 0, within25km: 0, within50km: 0 },
        discovery: {
          liveAttempted: liveDiscovery.attempted,
          liveSuccess: liveDiscovery.success,
          provider: liveDiscovery.provider,
          durationMs: liveDiscovery.durationMs,
          dbCount: dbFacilities.length,
          liveRawCount: liveDiscovery.rawCount,
          validLiveCount: liveDiscovery.validCount,
          newLiveAdded: newLiveFacilities.length,
          duplicatesRemoved,
          strategy: liveDiscovery.strategy,
          note: liveDiscovery.note,
          error: liveDiscovery.error,
        },
      };
    }

    // 6. Clinical proximity and risk ranking
    const ranked = rankFacilities(mergedFacilities, lat, lng, {
      riskTier,
      syndrome,
      maxRadiusKm: effectiveRadiusKm,
    });

    // 7. Strip private operational fields for public directory
    const publicRanked = ranked.map((r) => ({
      ...r,
      facility: this.toPublicFacility(r.facility),
    }));

    const breakdown = {
      within10km: publicRanked.filter((r) => r.distanceKm <= 10).length,
      within25km: publicRanked.filter((r) => r.distanceKm <= 25).length,
      within50km: publicRanked.filter((r) => r.distanceKm <= 50).length,
    };

    logger.info({
      coords: { lat, lng },
      effectiveRadiusKm,
      dbCount: dbFacilities.length,
      liveSuccess: liveDiscovery.success,
      newLiveAdded: newLiveFacilities.length,
      totalMerged: mergedFacilities.length,
      liveDurationMs: liveDiscovery.durationMs,
    }, 'Nearby facilities query processed');

    return {
      facilities: publicRanked,
      effectiveRadiusKm,
      breakdown,
      discovery: {
        liveAttempted: liveDiscovery.attempted,
        liveSuccess: liveDiscovery.success,
        provider: liveDiscovery.provider,
        durationMs: liveDiscovery.durationMs,
        dbCount: dbFacilities.length,
        liveRawCount: liveDiscovery.rawCount,
        validLiveCount: liveDiscovery.validCount,
        newLiveAdded: newLiveFacilities.length,
        duplicatesRemoved,
        strategy: liveDiscovery.strategy,
        note: liveDiscovery.note,
        error: liveDiscovery.error,
      },
    };
  }

  /**
   * Retrieve and rank facilities around coordinate within radius.
   * Backward-compatible wrapper returning RankedFacility[] array.
   */
  async getNearbyFacilities(query: NearbyFacilitiesQuery): Promise<RankedFacility[]> {
    const result = await this.getNearbyFacilitiesDetailed(query);
    return result.facilities;
  }

  /**
   * Retrieve single public facility by facilityId (public directory fields only).
   */
  async getPublicFacilityById(id: string): Promise<PublicFacility | null> {
    const doc = await FacilityModel.findOne({ facilityId: id });
    if (doc) {
      return this.toPublicFacility(doc);
    }
    const mock = MOCK_FACILITIES.find((f) => f.id === id);
    return mock ? this.toPublicFacility(mock) : null;
  }

  /**
   * Retrieve operational facility details (capacity, load) for authorized staff.
   */
  async getOperationalFacilityById(id: string): Promise<Facility | null> {
    const doc = await FacilityModel.findOne({ facilityId: id });
    if (doc) {
      return this.toContractFacility(doc);
    }
    const mock = MOCK_FACILITIES.find((f) => f.id === id);
    return mock || null;
  }

  /**
   * List public facilities in district or system (public directory fields only).
   * Supports filtering to registered healthcare organizations only (registeredOnly=true).
   */
  async listFacilities(districtCode?: string, registeredOnly?: boolean): Promise<PublicFacility[]> {
    const query: Record<string, any> = districtCode ? { districtCode } : {};
    if (registeredOnly) {
      query.dataSource = { $ne: 'OPEN_STREET_MAP' };
    }
    const docs = await FacilityModel.find(query).sort({ updatedAtTimestamp: -1, createdAt: -1 });
    if (docs.length > 0) {
      return docs.map((d) => ({
        ...this.toPublicFacility(d),
        _id: d._id.toString(),
        facilityId: d.facilityId || d._id.toString(),
      } as PublicFacility));
    }
    return MOCK_FACILITIES.map((f) => ({
      ...this.toPublicFacility(f),
      _id: f.id,
      facilityId: f.id,
    } as PublicFacility));
  }
}

export const facilityService = new FacilityService();
