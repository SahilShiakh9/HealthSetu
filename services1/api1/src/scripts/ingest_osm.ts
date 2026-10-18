import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../config/db.js';
import { FacilityModel } from '../models/Facility.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface IngestionReport {
  importedCount: number;
  updatedCount: number;
  regions: string[];
  categories: Record<string, number>;
  sourceAttribution: string;
  missingDataNotes: string[];
}

/**
 * Normalizes OpenStreetMap element to HealthSetu IFacility format.
 */
export function normalizeOsmElement(el: any, defaultDistrict: string = 'Pune') {
  const tags = el.tags || {};
  const lat = el.lat || el.center?.lat;
  const lon = el.lon || el.center?.lon;

  if (!lat || !lon) return null;

  const osmId = String(el.id);
  const facilityId = `osm:${el.type || 'node'}:${osmId}`;
  const name = tags.name || tags['name:en'] || tags.operator || `Healthcare Facility (${osmId})`;

  let type: 'HOSPITAL' | 'CHC' | 'PHC' | 'SC' | 'DH' | 'SDH' | 'CLINIC' | 'PHARMACY' | 'PRIVATE' = 'CLINIC';
  const amenity = tags.amenity || '';
  const healthcare = tags.healthcare || '';

  if (amenity === 'pharmacy') {
    type = 'PHARMACY';
  } else if (amenity === 'hospital' || healthcare === 'hospital') {
    if (name.toLowerCase().includes('district') || name.toLowerCase().includes('civil')) {
      type = 'DH';
    } else if (name.toLowerCase().includes('sub-district') || name.toLowerCase().includes('sub divisional')) {
      type = 'SDH';
    } else if (name.toLowerCase().includes('community') || name.toLowerCase().includes('chc')) {
      type = 'CHC';
    } else {
      type = 'HOSPITAL';
    }
  } else if (healthcare === 'centre' || name.toLowerCase().includes('sub centre') || name.toLowerCase().includes('sub-center')) {
    type = 'SC';
  } else if (name.toLowerCase().includes('primary health') || name.toLowerCase().includes('phc')) {
    type = 'PHC';
  } else if (amenity === 'clinic' || amenity === 'doctors' || healthcare === 'clinic') {
    type = 'CLINIC';
  }

  // Emergency is strictly true ONLY if explicitly tagged
  const emergencyCapable = tags.emergency === 'yes';

  // Open 24/7 strictly if tagged
  const open24x7 = tags.opening_hours === '24/7';
  const openHours = tags.opening_hours || (open24x7 ? '24 Hours' : '8:00 AM - 4:00 PM');

  // Contact
  const phone = tags.phone || tags['contact:phone'] || '';

  // Address
  const addressParts = [
    tags['addr:full'],
    tags['addr:street'],
    tags['addr:subdistrict'],
    tags['addr:district'],
    tags['addr:state'],
    tags['addr:postcode'],
  ].filter(Boolean);
  const address = addressParts.length > 0 ? addressParts.join(', ') : tags['addr:city'] || '';

  const districtCode = tags['addr:district'] || defaultDistrict;

  return {
    facilityId,
    osmId,
    name,
    type,
    location: {
      type: 'Point',
      coordinates: [lon, lat],
    },
    districtCode,
    services: tags.healthcare ? [tags.healthcare] : ['Outpatient Care'],
    servicesMask: emergencyCapable ? 7 : 3,
    open24x7,
    openHours,
    phone,
    address,
    emergencyCapable,
    dataSource: 'OPEN_STREET_MAP' as const,
    sourceAttribution: '© OpenStreetMap contributors',
    isMock: false,
    updatedAtTimestamp: Date.now(),
  };
}

/**
 * Ingest from pre-extracted seed JSON dataset across Indian clusters.
 */
export async function ingestOsmFacilitiesFromFile(
  filePath?: string,
): Promise<IngestionReport> {
  const targetPath =
    filePath || path.resolve(__dirname, '../../data/osm_facilities_india.json');

  if (!fs.existsSync(targetPath)) {
    throw new Error(`OSM facilities dataset file not found: ${targetPath}`);
  }

  const raw = fs.readFileSync(targetPath, 'utf-8');
  const items = JSON.parse(raw);

  let importedCount = 0;
  let updatedCount = 0;
  const categories: Record<string, number> = {};
  const regions = new Set<string>();

  for (const item of items) {
    regions.add(item.districtCode || 'Unknown');
    categories[item.type] = (categories[item.type] || 0) + 1;

    const res = await FacilityModel.updateOne(
      { facilityId: item.facilityId },
      {
        $set: {
          name: item.name,
          type: item.type,
          location: item.location,
          districtCode: item.districtCode,
          address: item.address || '',
          services: item.services || [],
          servicesMask: item.servicesMask || 0,
          open24x7: !!item.open24x7,
          openHours: item.openHours || '8:00 AM - 4:00 PM',
          phone: item.phone || '',
          emergencyCapable: !!item.emergencyCapable,
          dataSource: 'OPEN_STREET_MAP',
          sourceAttribution: '© OpenStreetMap contributors',
          osmId: item.osmId,
          isMock: false,
          updatedAtTimestamp: Date.now(),
        },
      },
      { upsert: true },
    );

    if (res.upsertedCount > 0) importedCount++;
    else updatedCount++;
  }

  // Verify and ensure 2dsphere index
  await FacilityModel.collection.createIndex({ location: '2dsphere' });

  const report: IngestionReport = {
    importedCount,
    updatedCount,
    regions: Array.from(regions),
    categories,
    sourceAttribution: '© OpenStreetMap contributors',
    missingDataNotes: [
      'OSM phone numbers are populated where tagged; unlisted facilities show empty phone',
      'Emergency capability is marked true only where emergency=yes is present in OSM',
      'Distances are calculated as spherical straight-line distance; travel times are rural road estimates',
    ],
  };

  logger.info({ report }, 'OSM facilities ingestion completed');
  return report;
}

// Direct execution CLI support
if (process.argv[1] && process.argv[1].endsWith('ingest_osm.ts')) {
  (async () => {
    try {
      await connectDb();
      const report = await ingestOsmFacilitiesFromFile();
      console.log('Ingestion Report:', JSON.stringify(report, null, 2));
    } catch (err) {
      console.error('Ingestion failed:', err);
      process.exit(1);
    } finally {
      await disconnectDb();
      process.exit(0);
    }
  })();
}
