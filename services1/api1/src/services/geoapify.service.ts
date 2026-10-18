import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { Facility, FacilityType } from '@healthsetu/contracts';

export interface GeoapifyPlaceFeature {
  type: string;
  properties: {
    place_id?: string;
    osm_id?: number | string;
    name?: string;
    formatted?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    district?: string;
    postcode?: string;
    country?: string;
    lon: number;
    lat: number;
    categories?: string[];
    details?: string[];
    datasource?: {
      sourcename?: string;
      attribution?: string;
      license?: string;
      url?: string;
      raw?: Record<string, any>;
    };
    contact?: {
      phone?: string;
      email?: string;
    };
    opening_hours?: string;
    website?: string;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lon, lat]
  };
}

export interface GeoapifyPlacesResponse {
  type?: string;
  features?: GeoapifyPlaceFeature[];
  error?: string;
  message?: string;
  statusCode?: number;
}

export interface GeoapifyDiscoveryResult {
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
}

export class GeoapifyService {
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache to avoid redundant quota usage

  /**
   * Determine Indian healthcare facility classification from Geoapify categories and name.
   */
  classifyFacilityType(properties: GeoapifyPlaceFeature['properties']): FacilityType {
    const categories = (properties.categories || []).map((c) => c.toLowerCase());
    const name = (properties.name || properties.address_line1 || '').toLowerCase();
    const raw = properties.datasource?.raw || {};
    const healthcareRaw = String(raw.healthcare || '').toLowerCase();
    const amenityRaw = String(raw.amenity || '').toLowerCase();

    // 1. Sub-Centre
    if (
      name.includes('sub centre') ||
      name.includes('sub-centre') ||
      name.includes('subcentre') ||
      name.includes('upkendra') ||
      name.includes('up-kendra') ||
      healthcareRaw === 'subcentre' ||
      healthcareRaw === 'sub_centre'
    ) {
      return 'SC';
    }

    // 2. Primary Health Centre
    if (
      name.includes('primary health') ||
      name.includes('phc') ||
      name.includes('prathmik arogya') ||
      healthcareRaw === 'primary_health_centre'
    ) {
      return 'PHC';
    }

    // 3. Community Health Centre
    if (
      name.includes('community health') ||
      name.includes('chc') ||
      healthcareRaw === 'community_health_centre'
    ) {
      return 'CHC';
    }

    // 4. Sub-District Hospital
    if (
      name.includes('sub district hospital') ||
      name.includes('sub-district hospital') ||
      name.includes('sdh')
    ) {
      return 'SDH';
    }

    // 5. District Hospital / Civil Hospital
    if (
      name.includes('district hospital') ||
      name.includes('civil hospital') ||
      name.includes('government hospital')
    ) {
      return 'DH';
    }

    // 6. Pharmacy
    if (
      categories.includes('healthcare.pharmacy') ||
      categories.includes('commercial.chemist') ||
      amenityRaw === 'pharmacy' ||
      name.includes('pharmacy') ||
      name.includes('chemist') ||
      name.includes('medical store')
    ) {
      return 'PHARMACY';
    }

    // 7. General Hospital (Mapped to DH - District / General Hospital tier in HealthSetu schema)
    if (
      categories.includes('healthcare.hospital') ||
      amenityRaw === 'hospital' ||
      name.includes('hospital') ||
      name.includes('rugnalaya')
    ) {
      return 'DH';
    }

    // 8. Clinic / Dispensary
    if (
      categories.includes('healthcare.clinic') ||
      amenityRaw === 'clinic' ||
      amenityRaw === 'doctors' ||
      name.includes('clinic') ||
      name.includes('dispensary') ||
      name.includes('dawakhana')
    ) {
      return 'CLINIC';
    }

    return 'CLINIC';
  }

  /**
   * Normalize Geoapify Place feature into HealthSetu Facility model.
   * Strictly adheres to zero fabrication: unlisted phone/hours remain empty,
   * and emergencyCapable is true only when explicit emergency tag exists.
   */
  featureToFacility(feature: GeoapifyPlaceFeature): Facility | null {
    const props = feature.properties;
    if (!props) return null;

    const lon = typeof props.lon === 'number' ? props.lon : feature.geometry?.coordinates?.[0];
    const lat = typeof props.lat === 'number' ? props.lat : feature.geometry?.coordinates?.[1];

    if (typeof lon !== 'number' || typeof lat !== 'number' || isNaN(lon) || isNaN(lat)) {
      return null;
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return null;
    }

    const type = this.classifyFacilityType(props);
    const raw = props.datasource?.raw || {};

    // Stable ID: prefer place_id, fallback to osm_id or lon_lat
    const rawOsmId = props.osm_id || raw.osm_id;
    const osmIdStr = rawOsmId ? String(rawOsmId) : undefined;
    const stableId = props.place_id
      ? `geoapify:place:${props.place_id}`
      : osmIdStr
      ? `osm:${osmIdStr}`
      : `geoapify:${lon.toFixed(5)}_${lat.toFixed(5)}`;

    // Address
    const address = props.formatted || props.address_line2 || props.address_line1 || '';

    // Contact phone: never fabricate
    const rawPhone = props.contact?.phone || raw.phone || raw['contact:phone'] || '';
    const phone = typeof rawPhone === 'string' ? rawPhone.trim() : '';

    // Operating hours: never fabricate
    const rawHours = props.opening_hours || raw.opening_hours || '';
    const openHours = typeof rawHours === 'string' ? rawHours.trim() : '';
    const open24x7 = openHours.toLowerCase() === '24/7' || rawHours === '24/7';

    // Emergency capability: conservative check - never fabricate
    const rawEmergency = String(raw.emergency || '').toLowerCase();
    const emergencyCapable = rawEmergency === 'yes' || rawEmergency === 'true';

    // Services
    const services: string[] = [];
    if (type === 'DH' || type === 'SDH') {
      services.push('Inpatient Care', 'OPD');
      if (emergencyCapable) services.push('Emergency');
    } else if (type === 'PHC') {
      services.push('Primary OPD', 'Maternal Care', 'Immunization');
    } else if (type === 'CHC') {
      services.push('Secondary OPD', 'Maternity', 'Basic Surgery');
    } else if (type === 'SC') {
      services.push('Primary Healthcare', 'Maternal Health');
    } else if (type === 'PHARMACY') {
      services.push('Essential Medicines', 'Prescription Dispensing');
    } else {
      services.push('General Outpatient Consultation');
    }

    return {
      id: stableId,
      osmId: osmIdStr,
      name: (props.name || props.address_line1 || (type === 'PHARMACY' ? 'Medical Store / Pharmacy' : `${type} Healthcare Facility`)).trim(),
      type,
      location: {
        type: 'Point',
        coordinates: [lon, lat], // GeoJSON order: [longitude, latitude]
      },
      districtCode: props.district || props.city || 'Discovered',
      services,
      servicesMask: 0,
      open24x7,
      openHours: openHours || (open24x7 ? '24x7' : 'Consult facility'),
      phone,
      address,
      sourceAttribution: 'Powered by Geoapify | © OpenStreetMap contributors',
      emergencyCapable,
      dataSource: 'GEOAPIFY',
      isMock: false,
      updatedAt: Date.now(),
    };
  }

  /**
   * Discover real healthcare facilities via Geoapify Places API v2.
   * Spatial order: circle:lon,lat,radiusMeters
   */
  async discoverHealthcareFacilities(
    lat: number,
    lng: number,
    maxRadiusMeters: number = 25000,
  ): Promise<GeoapifyDiscoveryResult> {
    const startTime = Date.now();
    const effectiveRadiusM = Math.min(Math.max(maxRadiusMeters, 1000), 100000);

    // Cache key: 3 decimal places (~100m grid)
    const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)},${Math.round(effectiveRadiusM / 1000)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return {
        attempted: true,
        success: true,
        provider: 'geoapify (memory-cache)',
        durationMs: Date.now() - startTime,
        rawCount: cached.facilities.length,
        validCount: cached.facilities.length,
        facilities: cached.facilities,
        strategy: 'geoapify-cached',
      };
    }

    const apiKey = env.GEOAPIFY_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      return {
        attempted: false,
        success: false,
        provider: 'geoapify',
        durationMs: 0,
        rawCount: 0,
        validCount: 0,
        facilities: [],
        note: 'GEOAPIFY_API_KEY not configured. Falling back to next configured provider.',
      };
    }

    const categories = 'healthcare,healthcare.hospital,healthcare.pharmacy';
    // Geoapify spatial format: circle:lon,lat,radiusMeters
    const filter = `circle:${lng},${lat},${effectiveRadiusM}`;
    const bias = `proximity:${lng},${lat}`;
    const limit = 100;

    const url = new URL('https://api.geoapify.com/v2/places');
    url.searchParams.set('categories', categories);
    url.searchParams.set('filter', filter);
    url.searchParams.set('bias', bias);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('apiKey', apiKey.trim());

    const timeoutMs = env.GEOAPIFY_TIMEOUT_MS || 8000;

    try {
      logger.info(
        { lat, lng, radiusMeters: effectiveRadiusM },
        'Executing live Geoapify Places healthcare discovery...',
      );

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'HealthSetu-RuralHealthcare/1.0',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        // Redact any occurrences of API key
        const safeError = errorText.replace(new RegExp(apiKey, 'g'), '[REDACTED]');
        logger.warn(
          { status: response.status, durationMs, safeError },
          'Geoapify Places API returned HTTP non-200',
        );

        let errorMsg = `Geoapify HTTP ${response.status}`;
        if (response.status === 401 || response.status === 403) {
          errorMsg = 'Geoapify authorization failed: invalid or restricted API key';
        } else if (response.status === 429) {
          errorMsg = 'Geoapify rate limit reached / quota exceeded';
        }

        return {
          attempted: true,
          success: false,
          provider: 'geoapify',
          durationMs,
          rawCount: 0,
          validCount: 0,
          facilities: [],
          error: errorMsg,
        };
      }

      const data = (await response.json()) as GeoapifyPlacesResponse;
      const features = Array.isArray(data.features) ? data.features : [];
      const rawCount = features.length;

      const validFacilities: Facility[] = [];
      for (const feature of features) {
        try {
          const fac = this.featureToFacility(feature);
          if (fac) validFacilities.push(fac);
        } catch {
          // Ignore malformed individual features
        }
      }

      // Store in memory cache
      this.cache.set(cacheKey, {
        timestamp: Date.now(),
        facilities: validFacilities,
      });

      logger.info(
        {
          rawCount,
          validCount: validFacilities.length,
          durationMs,
        },
        'Geoapify Places healthcare discovery succeeded',
      );

      return {
        attempted: true,
        success: true,
        provider: 'geoapify',
        durationMs,
        rawCount,
        validCount: validFacilities.length,
        facilities: validFacilities,
        strategy: 'geoapify-places-v2',
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      const errorMsg = isTimeout
        ? `Geoapify discovery timed out after ${timeoutMs}ms`
        : err?.message || 'Geoapify network connection failed';

      logger.warn({ errorMsg, durationMs }, 'Geoapify discovery failed');

      return {
        attempted: true,
        success: false,
        provider: 'geoapify',
        durationMs,
        rawCount: 0,
        validCount: 0,
        facilities: [],
        error: errorMsg,
      };
    }
  }

  /**
   * Clear in-memory discovery cache (useful for testing & forced refresh).
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export const geoapifyService = new GeoapifyService();
