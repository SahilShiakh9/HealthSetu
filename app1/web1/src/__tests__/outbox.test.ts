import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../offline/db.js';
import {
  queueOutboxEvent,
  getPendingOutboxEvents,
  markEventSynced,
  markEventFailed,
  calculateNextAttemptDelayMs,
} from '../offline/outbox.js';

describe('Phase 2 Dexie Outbox & Backoff Suite', () => {
  beforeEach(async () => {
    await db.outbox.clear();
  });

  it('queues an outbox event with client UUID and pending status', async () => {
    const event = await queueOutboxEvent('SCREENING_CREATED', {
      clientId: '550e8400-e29b-41d4-a716-446655440000',
      riskTier: 'LOW',
    });

    expect(event.eventId).toBeDefined();
    expect(event.status).toBe('pending');
    expect(event.attempts).toBe(0);

    const stored = await db.outbox.get(event.eventId);
    expect(stored).toBeDefined();
    expect(stored?.type).toBe('SCREENING_CREATED');
  });

  it('sorts pending events giving priority to CONSENT_GIVEN before SCREENING_CREATED', async () => {
    // Queue screening first, then consent
    const screening = await queueOutboxEvent('SCREENING_CREATED', { id: 1 });
    const consent = await queueOutboxEvent('CONSENT_GIVEN', { purpose: 'SCREENING_STORAGE' });

    const pending = await getPendingOutboxEvents();
    expect(pending.length).toBe(2);
    // Consent must come before screening
    expect(pending[0].eventId).toBe(consent.eventId);
    expect(pending[1].eventId).toBe(screening.eventId);
  });

  it('marks event synced and removes from pending queue', async () => {
    const event = await queueOutboxEvent('PROFILE_UPDATED', { name: 'Sunil' });
    await markEventSynced(event.eventId);

    const stored = await db.outbox.get(event.eventId);
    expect(stored?.status).toBe('synced');

    const pending = await getPendingOutboxEvents();
    expect(pending.find((e) => e.eventId === event.eventId)).toBeUndefined();
  });

  it('calculates exponential backoff with jitter bounded by 15 minutes', () => {
    const delay0 = calculateNextAttemptDelayMs(0);
    expect(delay0).toBeGreaterThanOrEqual(5000);
    expect(delay0).toBeLessThanOrEqual(7500);

    const delay5 = calculateNextAttemptDelayMs(5);
    expect(delay5).toBeGreaterThanOrEqual(160000);

    const delay10 = calculateNextAttemptDelayMs(10);
    // Capped at 15 minutes (900000 ms) + jitter
    expect(delay10).toBeLessThanOrEqual(15 * 60 * 1000 + 2500);
  });

  it('transitions event to failed after 8 unsuccessful attempts', async () => {
    const event = await queueOutboxEvent('CONSULTATION_REQUESTED', { doctorId: 'doc1' });

    for (let i = 0; i < 7; i++) {
      await markEventFailed(event.eventId, 'Network error');
      const doc = await db.outbox.get(event.eventId);
      expect(doc?.status).toBe('pending');
    }

    // 8th failure -> marked failed
    await markEventFailed(event.eventId, 'Final failure');
    const finalDoc = await db.outbox.get(event.eventId);
    expect(finalDoc?.status).toBe('failed');
    expect(finalDoc?.attempts).toBe(8);
  });
});
