import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { Facility, FacilityType } from '@healthsetu/contracts';

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat: number;
    lon: number;
  };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  version?: number;
  generator?: string;
  elements: OverpassElement[];
}

export interface LiveDiscoveryResult {
  attempted: boolean;
  success: boolean;
  provider: string;
  durationMs: number;
  rawCount: number;
  validCount: number;
  facilities: Facility[];
  strategy?: string;
  note?: string;
  error?: string;
}

interface CacheEntry {
  timestamp: number;
  facilities: Facility[];
  strategy?: string;
  note?: string;
}

export class OverpassService {
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache to avoid overloading Overpass
  private readonly BACKUP_MIRRORS = [
    'https://lz4.overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];

  /**
   * Determine Indian healthcare facility classification according to genuine OSM tags and names.
   */
  classifyFacilityType(tags: Record<string, string> = {}): FacilityType {
    const name = (tags.name || tags['name:en'] || '').toLowerCase();
    const amenity = (tags.amenity || '').toLowerCase();
    const healthcare = (tags.healthcare || '').toLowerCase();
    const operatorType = (tags['operator:type'] || '').toLowerCase();

    // 1. Sub-Centres
    if (
      name.includes('sub centre') ||
      name.includes('sub-centre') ||
      name.includes('subcentre') ||
      name.includes('upkendra') ||
      name.includes('up-kendra') ||
      healthcare === 'subcentre' ||
      healthcare === 'sub_centre'
    ) {
      return 'SC';
    }

    // 2. Primary Health Centres
    if (
      name.includes('primary health') ||
      name.includes('phc') ||
      name.includes('prathmik arogya') ||
      healthcare === 'primary_health_centre'
    ) {
      return 'PHC';
    }

    // 3. Community Health Centres
    if (
      name.includes('community health') ||
      name.includes('chc') ||
      healthcare === 'community_health_centre'
    ) {
      return 'CHC';
    }

    // 4. Sub-District Hospitals
    if (
      name.includes('sub district hospital') ||
      name.includes('sub-district hospital') ||
      name.includes('sdh')
    ) {
      return 'SDH';
    }

    // 5. Pharmacies & Chemists
    if (amenity === 'pharmacy' || healthcare === 'pharmacy' || name.includes('pharmacy') || name.includes('chemist')) {
      return 'PHARMACY';
    }

    // 6. Clinics, Dispensaries & Doctors
    if (
      amenity === 'clinic' ||
      healthcare === 'clinic' ||
      amenity === 'doctors' ||
      healthcare === 'doctor' ||
      healthcare === 'dispensary' ||
      name.includes('clinic') ||
      name.includes('dispensary')
    ) {
      return 'CLINIC';
    }

    // 7. Hospitals (District / Civil / General / Municipal vs Private)
    if (amenity === 'hospital' || healthcare === 'hospital' || name.includes('hospital')) {
      if (
        operatorType === 'private' ||
        name.includes('private') ||
        name.includes('speciality') ||
        name.includes('specialty') ||
        name.includes('trust')
      ) {
        return 'PRIVATE';
      }
      return 'DH';
    }

    // 8. Health posts or generic centres
    if (amenity === 'health_post' || healthcare === 'health_post') {
      return 'PHC';
    }

    return 'CLINIC';
  }

  /**
   * Convert an Overpass element into a validated HealthSetu Facility schema object.
   */
  elementToFacility(element: OverpassElement): Facility | null {
    const lat = typeof element.lat === 'number' ? element.lat : element.center?.lat;
    const lng = typeof element.lon === 'number' ? element.lon : element.center?.lon;

    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
      return null;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return null;
    }

    const tags = element.tags || {};
    const name = tags.name || tags['name:en'] || tags['name:hi'] || tags['name:mr'];
    if (!name || name.trim().length === 0) {
      // Discard nameless geographic nodes to preserve directory quality
      return null;
    }

    const type = this.classifyFacilityType(tags);
    const emergencyCapable = tags.emergency === 'yes' || (!!tags.emergency && tags.emergency !== 'no');
    const open24x7 = tags.opening_hours === '24/7';

    // Assemble services genuinely present or inferred by type without inventing specialized capabilities
    const services: string[] = [];
    if (emergencyCapable) services.push('Emergency Care');
    if (open24x7) services.push('24x7 Services');
    if (type === 'PHARMACY') services.push('Medicine Dispense');
    else if (type === 'CLINIC') services.push('Doctor Consultation');
    else if (type === 'PHC' || type === 'SC') services.push('Primary Health Checkup');
    else if (type === 'DH' || type === 'CHC' || type === 'PRIVATE') services.push('Inpatient Services');

    let servicesMask = 1;
    if (emergencyCapable) servicesMask |= 2;
    if (open24x7) servicesMask |= 4;

    // Address construction from OSM address tags
    const addressParts = [
      tags['addr:housenumber'],
      tags['addr:street'],
      tags['addr:suburb'],
      tags['addr:city'],
      tags['addr:postcode'],
    ].filter(Boolean);
    const address = addressParts.length > 0 ? addressParts.join(', ') : '';

    const districtCode = tags['addr:district'] || tags['addr:city'] || '';
    const phone = tags.phone || tags['contact:phone'] || '';
    const openHours = tags.opening_hours || (open24x7 ? '24 Hours' : '');

    return {
      id: `osm:${element.type}:${element.id}`,
      osmId: String(element.id),
      name: name.trim(),
      type,
      location: {
        type: 'Point',
        coordinates: [lng, lat], // strictly [longitude, latitude]
      },
      districtCode,
      services,
      servicesMask,
      open24x7,
      openHours,
      phone,
      address,
      sourceAttribution: '© OpenStreetMap contributors',
      emergencyCapable,
      dataSource: 'OPEN_STREET_MAP',
      isMock: false,
      updatedAt: Date.now(),
    };
  }

  /**
   * Execute live OpenStreetMap Overpass discovery around given coordinates.
   */
  async discoverHealthcareFacilities(
    lat: number,
    lng: number,
    radiusMeters: number,
  ): Promise<LiveDiscoveryResult> {
    if (process.env.NODE_ENV === 'test' && process.env.ENABLE_LIVE_OVERPASS !== 'true') {
      return {
        attempted: true,
        success: true,
        provider: 'test-stub',
        durationMs: 0,
        rawCount: 0,
        validCount: 0,
        facilities: [],
      };
    }

    const cacheKey = `${lat.toFixed(3)}_${lng.toFixed(3)}_${radiusMeters}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return {
        attempted: true,
        success: true,
        provider: 'cache',
        durationMs: 0,
        rawCount: cached.facilities.length,
        validCount: cached.facilities.length,
        facilities: cached.facilities,
        strategy: cached.strategy,
        note: cached.note,
      };
    }

    const t0 = performance.now();
    const timeoutMs = env.OVERPASS_TIMEOUT_MS || 8000;
    const timeoutSeconds = Math.ceil(timeoutMs / 1000) + 2;

    const isLargeRadius = radiusMeters > 25000;
    const strategy = isLargeRadius ? 'bounded_node_scan' : 'full_feature_scan';
    const note = isLargeRadius
      ? 'Optimized to point facilities across 50 km to ensure responsive discovery without polygon timeout'
      : undefined;

    // Targeted, high-performance Overpass QL query targeting genuine healthcare amenities
    // For large radii (>25km / 50km), we focus on point nodes to prevent polygon boundary indexing timeouts on public servers
    const query = `[out:json][timeout:${timeoutSeconds}];
(
  node["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
  node["amenity"="clinic"](around:${radiusMeters},${lat},${lng});
  node["amenity"="doctors"](around:${radiusMeters},${lat},${lng});
  node["amenity"="pharmacy"](around:${radiusMeters},${lat},${lng});
  node["amenity"="health_post"](around:${radiusMeters},${lat},${lng});
  ${!isLargeRadius ? `
  way["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
  way["amenity"="clinic"](around:${radiusMeters},${lat},${lng});
  ` : ''}
);
out center tags 120;`;

    const endpoints = [env.OVERPASS_API_URL, ...this.BACKUP_MIRRORS].filter(
      (v, i, a) => a.indexOf(v) === i,
    );

    let lastError: string | undefined;

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'HealthSetu/1.0 (healthcare-discovery; contact@healthsetu.in)',
            Accept: 'application/json',
          },
          body: 'data=' + encodeURIComponent(query),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!response.ok) {
          lastError = `HTTP ${response.status} from ${endpoint}`;
          logger.warn({ lat, lng, radiusKm: radiusMeters / 1000, endpoint, error: lastError }, 'Overpass endpoint failed');
          continue;
        }

        const data = (await response.json()) as OverpassResponse;
        const durationMs = Math.round(performance.now() - t0);
        const rawElements = data.elements || [];

        // Deduplicate elements by ID in raw response
        const seenIds = new Set<string>();
        const validFacilities: Facility[] = [];

        for (const el of rawElements) {
          const fid = `${el.type}:${el.id}`;
          if (seenIds.has(fid)) continue;
          seenIds.add(fid);

          const facility = this.elementToFacility(el);
          if (facility) {
            validFacilities.push(facility);
          }
        }

        // Cache valid result (failures are never cached)
        this.cache.set(cacheKey, {
          timestamp: Date.now(),
          facilities: validFacilities,
          strategy,
          note,
        });

        logger.info(
          {
            endpoint,
            durationMs,
            rawCount: rawElements.length,
            validCount: validFacilities.length,
            strategy,
          },
          'Live Overpass discovery completed',
        );

        return {
          attempted: true,
          success: true,
          provider: endpoint,
          durationMs,
          rawCount: rawElements.length,
          validCount: validFacilities.length,
          facilities: validFacilities,
          strategy,
          note,
        };
      } catch (err: any) {
        lastError = err?.message || 'Network/timeout error';
        logger.warn({ endpoint, err: lastError }, 'Overpass endpoint request failed');
      }
    }

    const durationMs = Math.round(performance.now() - t0);
    return {
      attempted: true,
      success: false,
      provider: env.OVERPASS_API_URL,
      durationMs,
      rawCount: 0,
      validCount: 0,
      facilities: [],
      strategy,
      error: lastError || 'All Overpass endpoints failed or timed out',
    };
  }
}

export const overpassService = new OverpassService();
