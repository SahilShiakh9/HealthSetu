import mongoose from 'mongoose';
import dns from 'dns';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let isConnected = false;

export const connectDb = async (uriOverride?: string): Promise<void> => {
  if (isConnected) return;

  const mongoUri = uriOverride || env.MONGODB_URI;

  if (mongoUri.startsWith('mongodb+srv://')) {
    try {
      dns.setServers(['8.8.8.8', '1.1.1.1']);
      if (typeof (dns as any).setDefaultResultOrder === 'function') {
        (dns as any).setDefaultResultOrder('ipv4first');
      }
    } catch {
      // Ignore if cannot override DNS servers
    }
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
    });
    isConnected = true;
    logger.info({ uri: mongoUri.replace(/\/\/.*@/, '//***@') }, 'MongoDB connected successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to connect to MongoDB');
    throw error;
  }
};

export const disconnectDb = async (): Promise<void> => {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  logger.info('MongoDB disconnected');
};
