import cron, { type ScheduledTask } from 'node-cron';
import { Doctor } from '../models/Doctor.js';
import { QueueEntry } from '../models/QueueEntry.js';
import { queueService } from '../services/queue.service.js';
import { logger } from '../utils/logger.js';

export const DOCTOR_HEARTBEAT_TIMEOUT_MS = 60 * 1000; // 60 seconds
export const DOCTOR_RESPONSE_TIMEOUT_MS = 150 * 1000; // 150 seconds
export const PATIENT_JOIN_TIMEOUT_MS = 180 * 1000; // 180 seconds

/**
 * Sweeps doctors whose last heartbeat is older than 60s and marks them OFFLINE.
 */
export const runDoctorHeartbeatCheck = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - DOCTOR_HEARTBEAT_TIMEOUT_MS);
  const result = await Doctor.updateMany(
    {
      availability: { $in: ['AVAILABLE', 'BUSY', 'BREAK'] },
      $or: [
        { lastHeartbeatAt: { $lt: cutoff } },
        { lastHeartbeatAt: null },
      ],
    },
    {
      $set: { availability: 'OFFLINE' },
    },
  );

  if (result.modifiedCount > 0) {
    logger.info({ modified: result.modifiedCount }, 'Marked unresponsive doctors OFFLINE due to missed heartbeat');
  }
  return result.modifiedCount;
};

/**
 * Checks called queue entries where doctor did not respond within DOCTOR_RESPONSE_TIMEOUT_MS (150s).
 * Reverts entry to WAITING (preserving original sequence) and marks doctor as BREAK.
 */
export const runDoctorTimeoutCheck = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - DOCTOR_RESPONSE_TIMEOUT_MS);
  const timedOutEntries = await QueueEntry.find({
    status: 'CALLED',
    calledAt: { $lte: cutoff },
  });

  let count = 0;
  for (const entry of timedOutEntries) {
    // 1. Revert entry to WAITING so patient does not lose place in queue
    entry.status = 'WAITING';
    entry.calledAt = undefined;
    await entry.save();

    // 2. Mark doctor BREAK
    if (entry.doctorId) {
      await Doctor.findOneAndUpdate(
        { userId: entry.doctorId },
        { availability: 'BREAK' },
      );
    }
    count++;
  }

  if (count > 0) {
    logger.warn({ count }, 'Reverted CALLED entries back to WAITING due to doctor response timeout');
  }
  return count;
};

/**
 * Checks entries where patient did not join call within PATIENT_JOIN_TIMEOUT_MS (180s).
 * Marks entry as MISSED and frees doctor back to AVAILABLE.
 */
export const runPatientTimeoutCheck = async (): Promise<number> => {
  const cutoff = new Date(Date.now() - PATIENT_JOIN_TIMEOUT_MS);
  const missedEntries = await QueueEntry.find({
    status: 'CALLED',
    calledAt: { $lte: cutoff },
  });

  let count = 0;
  for (const entry of missedEntries) {
    entry.status = 'MISSED';
    await entry.save();

    if (entry.doctorId) {
      await Doctor.findOneAndUpdate(
        { userId: entry.doctorId },
        { availability: 'AVAILABLE' },
      );
    }
    count++;
  }

  return count;
};

/**
 * Starvation aging sweep: lowers effectivePriority by 1 for entries waiting > 15 minutes.
 */
export const runStarvationAging = async (agingMinutes = 15): Promise<number> => {
  return queueService.ageWaitingEntries(agingMinutes);
};

let heartbeatCronTask: ScheduledTask | null = null;
let timeoutCronTask: ScheduledTask | null = null;
let agingCronTask: ScheduledTask | null = null;

/**
 * Starts all queue monitor cron background jobs.
 */
export const startQueueMonitorJobs = (): void => {
  // 1. Doctor presence heartbeat check every 30s
  heartbeatCronTask = cron.schedule('*/30 * * * * *', async () => {
    try {
      await runDoctorHeartbeatCheck();
    } catch (err) {
      logger.error({ err }, 'Error in doctor heartbeat monitor cron');
    }
  });

  // 2. Doctor response timeout check every 15s
  timeoutCronTask = cron.schedule('*/15 * * * * *', async () => {
    try {
      await runDoctorTimeoutCheck();
    } catch (err) {
      logger.error({ err }, 'Error in doctor timeout monitor cron');
    }
  });

  // 3. Starvation aging check every 5 minutes
  agingCronTask = cron.schedule('*/5 * * * *', async () => {
    try {
      await runStarvationAging(15);
    } catch (err) {
      logger.error({ err }, 'Error in starvation aging cron');
    }
  });

  logger.info('Queue monitor background cron jobs initialized');
};

/**
 * Stops all queue monitor cron jobs.
 */
export const stopQueueMonitorJobs = (): void => {
  heartbeatCronTask?.stop();
  timeoutCronTask?.stop();
  agingCronTask?.stop();
  heartbeatCronTask = null;
  timeoutCronTask = null;
  agingCronTask = null;
};
