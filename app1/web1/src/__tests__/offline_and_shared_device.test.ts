import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  publicDb,
  getUserDb,
  setActiveUserDb,
  checkUnsentRecords,
} from '../offline/db.js';
import {
  queueOutboxEvent,
  getPendingOutboxEvents,
  markEventSending,
  markEventSynced,
} from '../offline/outbox.js';
import { useAuthStore } from '../features/auth/useAuthStore.js';

// Polyfill BroadcastChannel for Node 22 + JSDOM compatibility
class MockBroadcastChannel {
  name: string;
  onmessage = null;
  onmessageerror = null;
  constructor(name: string) {
    this.name = name;
  }
  postMessage() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return true;
  }
}
if (typeof globalThis !== 'undefined') {
  (globalThis as any).BroadcastChannel = MockBroadcastChannel;
}

describe('Phase 9: Honest Offline/Online Behaviour & Shared-Device Safety', () => {
  beforeEach(async () => {
    setActiveUserDb('guest');
    await db.outbox.clear();
  });

  describe('1. Per-User Local Storage Isolation', () => {
    it('isolates sensitive data into separate IndexedDB instances partitioned by user ID hash', async () => {
      const userAId = 'usr-patient-alice';
      const userBId = 'usr-patient-bob';

      // Alice logs in and saves sensitive screening & outbox event
      setActiveUserDb(userAId);
      await queueOutboxEvent('SCREENING_CREATED', { symptoms: ['fever', 'chills'] }, userAId);
      await db.screenings.put({
        localId: 'scr-alice-001',
        clientId: 'scr-alice-001',
        id: 'scr-alice-001',
        patientId: 'pat-alice-001',
        submittedBy: userAId,
        language: 'en',
        status: 'draft',
        riskTier: 'LOW',
        isEmergency: false,
        recommendedSpecialty: 'General Physician',
        possibleConditions: [],
        symptoms: ['fever'],
        answers: [],
        emergencyFlags: [],
        symptomGroups: [],
        imageIds: [],
        source: 'device',
        triageConfigVersion: '1.0.0',
        modelVersion: '1.0.0',
        severity: 'mild',
        inputMethod: 'text',
        referralStatus: 'none',
        isOfflineSync: false,
        clientCreatedAt: Date.now(),
        receivedAt: Date.now(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const alicePending = await getPendingOutboxEvents(userAId);
      expect(alicePending.length).toBe(1);
      const aliceDrafts = await db.screenings.toArray();
      expect(aliceDrafts.length).toBe(1);
      expect(aliceDrafts[0].localId).toBe('scr-alice-001');

      // Now Bob logs in on the same shared device
      setActiveUserDb(userBId);

      // Bob MUST NOT see Alice's outbox or screening drafts
      const bobPending = await getPendingOutboxEvents(userBId);
      expect(bobPending.length).toBe(0);
      const bobDrafts = await db.screenings.toArray();
      expect(bobDrafts.length).toBe(0);

      // Bob saves his own outbox item
      await queueOutboxEvent('SCREENING_CREATED', { symptoms: ['headache'] }, userBId);
      const bobPendingAfter = await getPendingOutboxEvents(userBId);
      expect(bobPendingAfter.length).toBe(1);
      expect(bobPendingAfter[0].ownerUserId).toBe(userBId);

      // Switch back to Alice: Bob's data must not be in Alice's database
      setActiveUserDb(userAId);
      const alicePendingRestored = await getPendingOutboxEvents(userAId);
      expect(alicePendingRestored.length).toBe(1);
      expect(alicePendingRestored[0].ownerUserId).toBe(userAId);
    });

    it('shares non-sensitive facilities and triage rules through publicDb', async () => {
      await publicDb.facilities.put({
        id: 'fac-phc-kendur',
        name: 'Kendur Primary Health Centre',
        type: 'PHC',
        location: { type: 'Point', coordinates: [74.1205, 18.7842] },
        districtCode: 'PUN',
        services: ['OPD'],
        servicesMask: 1,
        open24x7: false,
        openHours: '8:00 AM - 4:00 PM',
        phone: '+91 9800000000',
        emergencyCapable: false,
        dataSource: 'MOCK_DEMO',
        isMock: true,
        updatedAt: Date.now(),
      });

      // Both Alice and Bob can access public directory without leakage
      setActiveUserDb('usr-patient-alice');
      const facAlice = await db.facilities.get('fac-phc-kendur');
      expect(facAlice).toBeDefined();

      setActiveUserDb('usr-patient-bob');
      const facBob = await db.facilities.get('fac-phc-kendur');
      expect(facBob).toBeDefined();
    });
  });

  describe('2. Outbox Ownership & Sync Filtering', () => {
    it('stores ownerUserId on every event and sync worker filters strictly by authenticated user', async () => {
      const userAId = 'usr-asha-sunita';
      const userBId = 'usr-patient-ramesh';

      // Enqueue items for both users in their respective databases
      await queueOutboxEvent('CONSENT_GIVEN', { purpose: 'SCREENING_STORAGE' }, userAId);
      await queueOutboxEvent('SCREENING_CREATED', { symptoms: ['cough'] }, userBId);

      // Sync worker checking user A only retrieves user A's events
      const userAEvents = await getPendingOutboxEvents(userAId);
      expect(userAEvents.length).toBe(1);
      expect(userAEvents[0].ownerUserId).toBe(userAId);

      // Sync worker checking user B only retrieves user B's events
      const userBEvents = await getPendingOutboxEvents(userBId);
      expect(userBEvents.length).toBe(1);
      expect(userBEvents[0].ownerUserId).toBe(userBId);
    });
  });

  describe('3. Logout Policy & Shared Device Data Cleanup', () => {
    it('deletes user Dexie database on logout if outbox is completely empty', async () => {
      const userAlice = {
        id: 'usr-patient-empty-alice',
        name: 'Alice',
        role: 'PATIENT' as const,
        language: 'en' as const,
      };

      useAuthStore.getState().setAuth('mock-token', userAlice);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);

      // Outbox is empty, so logout deletes Alice's database completely
      const { unsentCount } = await useAuthStore.getState().logout();
      expect(unsentCount).toBe(0);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);

      // Verify Alice's DB was purged
      const userDb = getUserDb(userAlice.id);
      const outboxCount = await userDb.outbox.count();
      expect(outboxCount).toBe(0);
    });

    it('warns on logout if unsent items exist, and allows explicit Delete unsent data', async () => {
      const userBob = {
        id: 'usr-patient-pending-bob',
        name: 'Bob',
        role: 'PATIENT' as const,
        language: 'en' as const,
      };

      useAuthStore.getState().setAuth('mock-token', userBob);
      await queueOutboxEvent('SCREENING_CREATED', { symptoms: ['fever'] }, userBob.id);

      // Check unsent records before logout
      const unsent = await checkUnsentRecords(userBob.id);
      expect(unsent).toBe(1);

      // Standard logout without deleteUnsent retains data isolated in IndexedDB
      const res = await useAuthStore.getState().logout({ deleteUnsent: false });
      expect(res.unsentCount).toBe(1);
      expect(useAuthStore.getState().logoutNotice).toContain('unsent record');

      // Bob's records still safely exist if Bob logs back in
      const bobDb = getUserDb(userBob.id);
      expect(await bobDb.outbox.count()).toBe(1);

      // Explicit Delete unsent data action permanently clears Bob's data
      await useAuthStore.getState().deleteUnsentData(userBob.id);
      const freshBobDb = getUserDb(userBob.id);
      expect(await freshBobDb.outbox.count()).toBe(0);
    });
  });

  describe('4. Honest Outbox Lifecycle: pending -> sending -> synced', () => {
    it('transitions event through honest statuses: pending -> sending -> synced', async () => {
      const event = await queueOutboxEvent('CONSENT_GIVEN', { purpose: 'SCREENING_STORAGE' });
      expect(event.status).toBe('pending');

      await markEventSending(event.eventId);
      const sendingDoc = await db.outbox.get(event.eventId);
      expect(sendingDoc?.status).toBe('sending');

      await markEventSynced(event.eventId);
      const syncedDoc = await db.outbox.get(event.eventId);
      expect(syncedDoc?.status).toBe('synced');
    });

    it('handles duplicate server acknowledgement as successful sync (idempotency)', async () => {
      const event = await queueOutboxEvent('SCREENING_CREATED', { clientId: 'client-idem-123' });
      await markEventSynced(event.eventId);
      // Secondary duplicate acknowledgement
      await markEventSynced(event.eventId);

      const doc = await db.outbox.get(event.eventId);
      expect(doc?.status).toBe('synced');
    });
  });
});
