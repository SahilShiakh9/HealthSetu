import Dexie, { type Table } from 'dexie';
import type {
  OutboxEvent,
  ScreeningResponse,
  Facility,
  ConsentPurpose,
  Language,
} from '@healthsetu/contracts';

export interface LocalPref {
  key: string;
  value: unknown;
}

export interface LocalConsent {
  purpose: ConsentPurpose;
  granted: boolean;
  policyVersion: string;
  language: Language;
  givenAt: number;
}

export interface LocalVillage {
  villageCode: string;
  districtCode: string;
  name: { en: string; hi: string; mr: string };
  coordinates: [number, number]; // [lat, lng]
}

export interface LocalQueueSnapshot {
  consultationId: string;
  doctorId: string;
  positionInQueue: number;
  estimatedWaitMinutes: number;
  status: string;
  fetchedAt: number;
}

export interface LocalMediaBlob {
  blobId: string;
  mime: string;
  sizeBytes: number;
  blob: Blob;
  status: 'pending-transcription' | 'pending-upload' | 'uploaded';
  createdAt: number;
}

/**
 * Deterministic hash of user ID to partition Dexie databases per-user (Section 9.1).
 * Avoids any exposure of sensitive patient records between shared-device users.
 */
export const hashUserId = (userId: string): string => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < userId.length; i++) {
    const ch = userId.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(12, '0');
};

/**
 * Public, shared Dexie database for non-sensitive public assets and configuration.
 * (facilities, villages, guidance, triage rules, language preferences)
 */
export class HealthSetuPublicDatabase extends Dexie {
  prefs!: Table<LocalPref, string>;
  facilities!: Table<Facility, string>;
  villages!: Table<LocalVillage, string>;
  configCache!: Table<{ key: string; value: unknown; etag: string; updatedAt: number }, string>;
  guidanceCache!: Table<{ key: string; language: string; pageId: string; data: unknown }, string>;

  constructor() {
    super('healthsetu_public');
    this.version(1).stores({
      prefs: '&key',
      facilities: '&id, districtCode',
      villages: '&villageCode, districtCode',
      configCache: '&key',
      guidanceCache: '&key, language, pageId',
    });
  }
}

/**
 * User-specific Dexie database for sensitive clinical records, drafts, and outbox.
 * Named by hash of the user ID (e.g. `healthsetu_user_a1b2c3d4e5f6`).
 */
export class HealthSetuUserDatabase extends Dexie {
  screenings!: Table<ScreeningResponse & { localId: string; status: string }, string>;
  outbox!: Table<OutboxEvent, string>;
  encountersCache!: Table<{ encounterId: string; data: unknown; updatedAt: number }, string>;
  queueSnapshot!: Table<LocalQueueSnapshot, string>;
  messageDrafts!: Table<{ clientId: string; consultationId: string; body: string; createdAt: number }, string>;
  mediaBlobs!: Table<LocalMediaBlob, string>;
  consentsLocal!: Table<LocalConsent, string>;

  constructor(userId: string) {
    const hashed = hashUserId(userId);
    super(`healthsetu_user_${hashed}`);
    this.version(1).stores({
      screenings: '&localId, status, updatedAt',
      outbox: '&eventId, status, nextAttemptAt, type, ownerUserId',
      encountersCache: '&encounterId, updatedAt',
      queueSnapshot: '&consultationId',
      messageDrafts: '&clientId, consultationId',
      mediaBlobs: '&blobId, status',
      consentsLocal: '&purpose',
    });
  }
}

export const publicDb = new HealthSetuPublicDatabase();

// Active user tracking and DB instance cache
let activeUserId: string = 'guest';
const userDbMap = new Map<string, HealthSetuUserDatabase>();

export const setActiveUserDb = (userId: string | null): void => {
  activeUserId = userId && userId.trim() ? userId.trim() : 'guest';
};

export const getActiveUserId = (): string => activeUserId;

export const getUserDb = (userId?: string): HealthSetuUserDatabase => {
  const targetId = userId && userId.trim() ? userId.trim() : activeUserId;
  const hashed = hashUserId(targetId);
  if (!userDbMap.has(hashed)) {
    userDbMap.set(hashed, new HealthSetuUserDatabase(targetId));
  }
  return userDbMap.get(hashed)!;
};

/**
 * Completely purges and deletes the user's specific database upon empty logout or explicit user confirmation.
 */
export const deleteUserDb = async (userId: string): Promise<void> => {
  const hashed = hashUserId(userId);
  const existing = userDbMap.get(hashed);
  if (existing) {
    existing.close();
    userDbMap.delete(hashed);
  }
  await Dexie.delete(`healthsetu_user_${hashed}`);
};

/**
 * Inspect count of unsent (pending / sending / failed) outbox records for a user.
 */
export const checkUnsentRecords = async (userId: string): Promise<number> => {
  try {
    const userDb = getUserDb(userId);
    return await userDb.outbox
      .where('status')
      .anyOf(['pending', 'sending', 'failed'])
      .count();
  } catch {
    return 0;
  }
};

/**
 * Unified db proxy object to preserve drop-in compatibility across the app codebase:
 * - Public tables route to publicDb
 * - User-specific sensitive tables route to active user's isolated database
 */
export const db = {
  get prefs() {
    return publicDb.prefs;
  },
  get facilities() {
    return publicDb.facilities;
  },
  get villages() {
    return publicDb.villages;
  },
  get configCache() {
    return publicDb.configCache;
  },
  get guidanceCache() {
    return publicDb.guidanceCache;
  },

  get screenings() {
    return getUserDb().screenings;
  },
  get outbox() {
    return getUserDb().outbox;
  },
  get encountersCache() {
    return getUserDb().encountersCache;
  },
  get queueSnapshot() {
    return getUserDb().queueSnapshot;
  },
  get messageDrafts() {
    return getUserDb().messageDrafts;
  },
  get mediaBlobs() {
    return getUserDb().mediaBlobs;
  },
  get consentsLocal() {
    return getUserDb().consentsLocal;
  },
};

// Request persistent storage if supported
if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}
