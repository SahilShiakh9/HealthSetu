import { overpassService } from '../services/overpass.service.js';
import { geoapifyService } from '../services/geoapify.service.js';
import { env } from '../config/env.js';

interface LocationBenchmarkTarget {
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  expectedType: 'urban' | 'rural' | 'metropolitan' | 'remote_ocean';
}

const BENCHMARK_LOCATIONS: LocationBenchmarkTarget[] = [
  {
    name: 'Alandi, Maharashtra',
    lat: 18.6752,
    lng: 73.898,
    radiusMeters: 25000,
    expectedType: 'rural',
  },
  {
    name: 'Kendur / Shikrapur, Maharashtra',
    lat: 18.7842,
    lng: 74.1205,
    radiusMeters: 25000,
    expectedType: 'rural',
  },
  {
    name: 'Nashik, Maharashtra',
    lat: 19.9982,
    lng: 73.7891,
    radiusMeters: 25000,
    expectedType: 'urban',
  },
  {
    name: 'Central Delhi',
    lat: 28.6139,
    lng: 77.209,
    radiusMeters: 10000,
    expectedType: 'metropolitan',
  },
  {
    name: 'Bengaluru Urban',
    lat: 12.9716,
    lng: 77.5946,
    radiusMeters: 15000,
    expectedType: 'metropolitan',
  },
  {
    name: 'Sparse Ocean (Honest Empty Boundary)',
    lat: 15.0,
    lng: 70.0,
    radiusMeters: 25000,
    expectedType: 'remote_ocean',
  },
];

async function runBenchmark() {
  console.log('========================================================================');
  console.log('HealthSetu: Live Geospatial Healthcare Provider Benchmark');
  console.log('Comparing OpenStreetMap Overpass vs. Geoapify Places API v2');
  console.log('========================================================================\n');

  const hasGeoapifyKey = Boolean(env.GEOAPIFY_API_KEY && env.GEOAPIFY_API_KEY.trim().length > 0);
  console.log(`[Configuration] GEOAPIFY_API_KEY configured: ${hasGeoapifyKey ? 'YES' : 'NO (Live Geoapify calls will be skipped)'}`);
  console.log(`[Configuration] OVERPASS_API_URL: ${env.OVERPASS_API_URL}\n`);

  const results: any[] = [];

  for (const loc of BENCHMARK_LOCATIONS) {
    console.log(`--- Testing Location: ${loc.name} (${loc.lat}, ${loc.lng}) | Radius: ${loc.radiusMeters / 1000}km ---`);

    // 1. Benchmark Overpass
    const opStart = Date.now();
    let opResult: any = null;
    try {
      opResult = await overpassService.discoverHealthcareFacilities(loc.lat, loc.lng, loc.radiusMeters);
    } catch (e: any) {
      opResult = { success: false, error: e.message, facilities: [], durationMs: Date.now() - opStart };
    }

    const opFacilities = opResult.facilities || [];
    const opCategories: Record<string, number> = {};
    let opWithPhone = 0;
    let opWithAddress = 0;
    let opGovtCount = 0; // PHC, CHC, SC, DH

    for (const f of opFacilities) {
      opCategories[f.type] = (opCategories[f.type] || 0) + 1;
      if (f.phone && f.phone.trim().length > 0) opWithPhone++;
      if (f.address && f.address.trim().length > 0) opWithAddress++;
      if (['PHC', 'CHC', 'SC', 'DH', 'SDH'].includes(f.type)) opGovtCount++;
    }

    console.log(`  [Overpass] Success: ${opResult.success} | Duration: ${opResult.durationMs}ms | Total: ${opFacilities.length} | Govt (PHC/CHC/SC/DH): ${opGovtCount} | With Phone: ${opWithPhone}`);

    // 2. Benchmark Geoapify
    let geoResult: any = null;
    let geoCategories: Record<string, number> = {};
    let geoWithPhone = 0;
    let geoWithAddress = 0;
    let geoGovtCount = 0;

    if (hasGeoapifyKey) {
      try {
        geoResult = await geoapifyService.discoverHealthcareFacilities(loc.lat, loc.lng, loc.radiusMeters);
        const geoFacilities = geoResult.facilities || [];
        for (const f of geoFacilities) {
          geoCategories[f.type] = (geoCategories[f.type] || 0) + 1;
          if (f.phone && f.phone.trim().length > 0) geoWithPhone++;
          if (f.address && f.address.trim().length > 0) geoWithAddress++;
          if (['PHC', 'CHC', 'SC', 'DH', 'SDH'].includes(f.type)) geoGovtCount++;
        }
        console.log(`  [Geoapify] Success: ${geoResult.success} | Duration: ${geoResult.durationMs}ms | Total: ${geoFacilities.length} | Govt: ${geoGovtCount} | With Phone: ${geoWithPhone}`);
      } catch (e: any) {
        geoResult = { success: false, error: e.message, facilities: [], durationMs: 0 };
        console.log(`  [Geoapify] Error: ${e.message}`);
      }
    } else {
      console.log('  [Geoapify] NOT RUN (Requires GEOAPIFY_API_KEY in .env)');
      geoResult = {
        attempted: false,
        success: false,
        durationMs: 0,
        facilities: [],
        note: 'Not run: no API key configured',
      };
    }

    results.push({
      location: loc.name,
      lat: loc.lat,
      lng: loc.lng,
      radiusKm: loc.radiusMeters / 1000,
      overpass: {
        success: opResult.success,
        durationMs: opResult.durationMs,
        count: opFacilities.length,
        categories: opCategories,
        withPhone: opWithPhone,
        withAddress: opWithAddress,
        govtCount: opGovtCount,
        error: opResult.error,
      },
      geoapify: {
        attempted: hasGeoapifyKey,
        success: geoResult.success,
        durationMs: geoResult.durationMs,
        count: (geoResult.facilities || []).length,
        categories: geoCategories,
        withPhone: geoWithPhone,
        withAddress: geoWithAddress,
        govtCount: geoGovtCount,
        note: geoResult.note,
        error: geoResult.error,
      },
    });

    console.log('');
  }

  console.log('========================================================================');
  console.log('Benchmark Execution Summary:');
  console.log(JSON.stringify(results, null, 2));
  console.log('========================================================================');
}

runBenchmark().catch((err) => {
  console.error('Benchmark fatal error:', err);
});
