import { performance } from 'perf_hooks';
import { calculateHaversineDistanceKm, rankFacilities, MOCK_FACILITIES } from '@healthsetu/contracts';

async function measureApiLatency() {
  const samples = [];
  const url = 'http://localhost:4000/api/v1/facilities/nearby?lat=18.6775&lng=73.8970&maxRadiusKm=25';

  console.log('--- 1. Measuring Nearby Facilities Online API Latency (20 runs) ---');
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    const res = await fetch(url);
    const data = await res.json();
    const elapsed = performance.now() - t0;
    samples.push(elapsed);
  }

  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length * 0.5)].toFixed(2);
  const p95 = samples[Math.floor(samples.length * 0.95)].toFixed(2);
  const min = samples[0].toFixed(2);
  const max = samples[samples.length - 1].toFixed(2);
  const avg = (samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(2);

  console.log(`Results: Min=${min}ms | Avg=${avg}ms | p50=${p50}ms | p95=${p95}ms | Max=${max}ms`);
}

function measureLocalRankingLatency() {
  console.log('--- 2. Measuring Local Distance & Ranking Computation Latency (100 runs) ---');
  const samples = [];

  for (let i = 0; i < 100; i++) {
    const t0 = performance.now();
    const ranked = rankFacilities(MOCK_FACILITIES, 18.6775, 73.8970, { riskTier: 'LOW', maxRadiusKm: 50 });
    const elapsed = performance.now() - t0;
    samples.push(elapsed);
  }

  samples.sort((a, b) => a - b);
  const p50 = samples[Math.floor(samples.length * 0.5)].toFixed(3);
  const p95 = samples[Math.floor(samples.length * 0.95)].toFixed(3);
  const min = samples[0].toFixed(3);
  const avg = (samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(3);

  console.log(`Results: Min=${min}ms | Avg=${avg}ms | p50=${p50}ms | p95=${p95}ms`);
}

async function run() {
  await measureApiLatency();
  measureLocalRankingLatency();
}

run().catch(console.error);
