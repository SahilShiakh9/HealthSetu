import { connectDb, disconnectDb } from '../config/db.js';
import { facilityService } from '../services/facility.service.js';

async function main() {
  await connectDb();
  console.log('Running explain on 2dsphere index query for Alandi (18.6775, 73.8970)...');
  const explain = await facilityService.explainNearbyQuery(18.6775, 73.8970, 25);
  const stage = explain.queryPlanner?.winningPlan?.inputStage?.stage || explain.queryPlanner?.winningPlan?.stage;
  const indexName = explain.queryPlanner?.winningPlan?.inputStage?.indexName || explain.queryPlanner?.winningPlan?.indexName;
  console.log('Explain Stage:', stage);
  console.log('Index Name Used:', indexName);
  console.log('Total Query Planner:', JSON.stringify(explain.queryPlanner?.winningPlan, null, 2));
  await disconnectDb();
}

main().catch(console.error);
