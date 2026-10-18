import mongoose, { ClientSession } from 'mongoose';
import { logger } from './logger.js';

let isReplicaSet: boolean | null = null;

/**
 * Checks whether the connected MongoDB instance supports replica-set transactions.
 */
export async function checkReplicaSetSupport(): Promise<boolean> {
  if (isReplicaSet !== null) return isReplicaSet;

  try {
    const admin = mongoose.connection.db?.admin();
    const serverStatus = await admin?.serverStatus();
    isReplicaSet = Boolean(serverStatus?.repl);
  } catch (err) {
    logger.warn({ err }, 'Could not determine MongoDB replica set status; assuming standalone');
    isReplicaSet = false;
  }

  return isReplicaSet;
}

/**
 * Executes an operation inside a MongoDB transaction when supported by the deployment.
 * Falls back to ordered, idempotent execution when running on a standalone instance (e.g. non-replica local/memory server).
 */
export async function runInTransaction<T>(
  operation: (session: ClientSession | null) => Promise<T>,
): Promise<T> {
  const supportsTransactions = await checkReplicaSetSupport();

  if (!supportsTransactions) {
    // Non-replica set fallback
    return operation(null);
  }

  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    return result!;
  } finally {
    await session.endSession();
  }
}
