import type { Facility } from './schemas/facility.js';
import { calculateHaversineDistanceKm } from './ranker.js';

/**
 * Normalizes a facility name by removing noise words, punctuation, and extra whitespace
 * so that variants like "Alandi Primary Health Centre" and "PHC Alandi Devachi" match accurately.
 */
export function normalizeFacilityName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(
      /\b(hospital|clinic|dispensary|phc|chc|sdh|dh|sub centre|subcentre|sub-centre|dr|doctor|pvt|ltd|trust|rugnalaya|dawakana|dawakhana|arogya|kendra|centre|center|primary health|community health|district hospital|rural hospital)\b/g,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks whether two facility records represent the exact same real-world facility.
 * Match criteria:
 * 1. Exact ID or OSM ID match.
 * 2. Cross-provider stable identifier match (e.g. `osm:12345` vs `geoapify:place:...` containing osm_id `12345`).
 * 3. Spatial proximity (< 80 meters) + high name similarity (exact normalized substring or token overlap).
 */
export function areFacilitiesDuplicate(a: Facility, b: Facility): boolean {
  if (!a || !b) return false;

  // 1. Exact ID or OSM ID match
  if (a.id && b.id && a.id === b.id) return true;
  if (a.osmId && b.osmId && String(a.osmId) === String(b.osmId)) return true;

  // Cross-provider OSM ID matching
  if (a.id && b.osmId && a.id.includes(String(b.osmId))) return true;
  if (b.id && a.osmId && b.id.includes(String(a.osmId))) return true;

  // 2. Spatial proximity & normalized name matching
  if (!a.location?.coordinates || !b.location?.coordinates) return false;
  const [lonA, latA] = a.location.coordinates;
  const [lonB, latB] = b.location.coordinates;
  if (typeof latA !== 'number' || typeof lonA !== 'number' || typeof latB !== 'number' || typeof lonB !== 'number') {
    return false;
  }

  const distMeters = calculateHaversineDistanceKm(latA, lonA, latB, lonB) * 1000;

  // If farther than 80 meters, strictly do NOT consider duplicate
  if (distMeters > 80) return false;

  const normA = normalizeFacilityName(a.name);
  const normB = normalizeFacilityName(b.name);

  // Exact match after normalization within 80m
  if (normA && normB && (normA === normB || normA.includes(normB) || normB.includes(normA))) {
    return true;
  }

  // If very close (< 25m) and identical facility type
  if (distMeters < 25 && a.type === b.type && normA.length > 2 && normB.length > 2) {
    const tokensA = new Set(normA.split(' ').filter(Boolean));
    const tokensB = new Set(normB.split(' ').filter(Boolean));
    const intersection = [...tokensA].filter((x) => tokensB.has(x));
    if (intersection.length >= 1) return true;
  }

  return false;
}

/**
 * Merges two duplicate facility records, preserving both source attributions,
 * unioning services, keeping verified values, and never overwriting reliable data with empty fields.
 */
export function mergeFacilityRecords(target: Facility, incoming: Facility): Facility {
  const existingSources = (target as any).sources || [target.dataSource || 'MOCK_DEMO'];
  const incomingSources = (incoming as any).sources || [incoming.dataSource || 'MOCK_DEMO'];
  const mergedSources = Array.from(new Set([...existingSources, ...incomingSources]));

  const mergedServices = Array.from(
    new Set([...(target.services || []), ...(incoming.services || [])]),
  );

  // Preserve non-empty phone number
  const phone =
    target.phone && target.phone.trim().length > 0
      ? target.phone
      : incoming.phone && incoming.phone.trim().length > 0
      ? incoming.phone
      : '';

  // Preserve more complete address
  const address =
    target.address && target.address.length >= (incoming.address || '').length
      ? target.address
      : incoming.address || target.address;

  // Preserve operating hours
  const openHours =
    target.openHours && target.openHours !== '8:00 AM - 4:00 PM'
      ? target.openHours
      : incoming.openHours || target.openHours;

  // Combined source attribution
  let sourceAttribution = target.sourceAttribution;
  if (incoming.sourceAttribution && incoming.sourceAttribution !== target.sourceAttribution) {
    sourceAttribution = sourceAttribution
      ? `${sourceAttribution} • ${incoming.sourceAttribution}`
      : incoming.sourceAttribution;
  }

  return {
    ...target,
    name: target.name.length >= incoming.name.length ? target.name : incoming.name,
    phone,
    address,
    openHours,
    open24x7: Boolean(target.open24x7 || incoming.open24x7),
    emergencyCapable: Boolean(target.emergencyCapable || incoming.emergencyCapable),
    services: mergedServices,
    sourceAttribution,
    osmId: target.osmId || incoming.osmId,
    sources: mergedSources,
    dataSource: target.dataSource !== 'MOCK_DEMO' ? target.dataSource : incoming.dataSource,
  };
}

/**
 * Merges an incoming list of facilities into an existing list of facilities,
 * deduplicating records progressively while maintaining stability.
 */
export function mergeAndDeduplicateFacilities(
  existing: Facility[],
  incoming: Facility[],
): Facility[] {
  const result: Facility[] = [...existing];

  for (const inc of incoming) {
    let duplicateIndex = -1;
    for (let i = 0; i < result.length; i++) {
      if (areFacilitiesDuplicate(result[i], inc)) {
        duplicateIndex = i;
        break;
      }
    }

    if (duplicateIndex >= 0) {
      result[duplicateIndex] = mergeFacilityRecords(result[duplicateIndex], inc);
    } else {
      result.push(inc);
    }
  }

  return result;
}
