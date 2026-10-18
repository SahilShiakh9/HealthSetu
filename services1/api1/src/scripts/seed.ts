import { connectDb, disconnectDb } from '../config/db.js';
import { facilityService } from '../services/facility.service.js';
import { seedDefaultUsers } from '../services/seed.service.js';
import { logger } from '../utils/logger.js';

const run = async () => {
  try {
    logger.info('Connecting to database for seeding...');
    await connectDb();
    await facilityService.seedDefaultFacilities();
    await seedDefaultUsers();
    logger.info('Database seeding completed successfully.');
  } catch (err) {
    logger.error({ err }, 'Database seeding failed');
    process.exit(1);
  } finally {
    await disconnectDb();
    process.exit(0);
  }
};

run();
