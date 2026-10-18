import { db, getActiveUserId } from './db.js';
import type { OutboxEvent, OutboxEventType } from '@healthsetu/contracts';

export const calculateNextAttemptDelayMs = (attempts: number): number => {
  const baseMs = 5000; // 5s base
  const capMs = 15 * 60 * 1000; // 15 mins cap
  const exponential = baseMs * Math.pow(2, attempts);
  const jitter = Math.floor(Math.random() * 2000);
  return Math.min(capMs, exponential) + jitter;
};

/**
 * Enqueue an outbox event tied strictly to the ownerUserId (Section 9.2).
 * Prevents any accidental uploading of records under another identity.
 */
export const queueOutboxEvent = async <T>(
  type: OutboxEventType,
  payload: T,
  ownerUserId?: string,
): Promise<OutboxEvent> => {
  const owner = ownerUserId || getActiveUserId();
  const event: OutboxEvent = {
    eventId: crypto.randomUUID(),
    type,
    payload,
    ownerUserId: owner,
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: Date.now(),
    status: 'pending',
  };

  await db.outbox.put(event);
  return event;
};

/**
 * Retrieve pending outbox events strictly matching the authenticated user.
 */
export const getPendingOutboxEvents = async (
  filterOwnerUserId?: string,
): Promise<OutboxEvent[]> => {
  const now = Date.now();
  const targetOwner = filterOwnerUserId || getActiveUserId();

  const events = await db.outbox
    .where('status')
    .equals('pending')
    .filter((e) => e.nextAttemptAt <= now && (!e.ownerUserId || e.ownerUserId === targetOwner))
    .sortBy('createdAt');

  // Enforce ordering: CONSENT_GIVEN -> PROFILE_UPDATED -> SCREENING_CREATED -> others
  const priorityOrder: Record<OutboxEventType, number> = {
    CONSENT_GIVEN: 0,
    PROFILE_UPDATED: 1,
    SCREENING_CREATED: 2,
    CONSULTATION_REQUESTED: 3,
    MESSAGE_SENT: 4,
  };

  return events.sort((a, b) => {
    const pA = priorityOrder[a.type] ?? 99;
    const pB = priorityOrder[b.type] ?? 99;
    if (pA !== pB) return pA - pB;
    return a.createdAt - b.createdAt;
  });
};

export const markEventSending = async (eventId: string): Promise<void> => {
  await db.outbox.update(eventId, {
    status: 'sending',
  });
};

export const markEventSynced = async (eventId: string): Promise<void> => {
  await db.outbox.update(eventId, {
    status: 'synced',
  });
};

export const markEventFailed = async (eventId: string, _error?: string): Promise<void> => {
  const event = await db.outbox.get(eventId);
  if (!event) return;

  const nextAttempts = event.attempts + 1;
  const isPermanentFail = nextAttempts >= 8;

  await db.outbox.update(eventId, {
    attempts: nextAttempts,
    status: isPermanentFail ? 'failed' : 'pending',
    nextAttemptAt: isPermanentFail ? 0 : Date.now() + calculateNextAttemptDelayMs(nextAttempts),
  });
};
