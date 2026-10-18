import {
  getPendingOutboxEvents,
  markEventSending,
  markEventSynced,
  markEventFailed,
} from './outbox.js';
import { db } from './db.js';
import { networkMonitor } from './network.js';
import { useSyncStore } from '../features/sync/useSyncStore.js';
import { useAuthStore } from '../features/auth/useAuthStore.js';
import { apiClient } from '../services/apiClient.js';
import type { SyncPushResponse } from '@healthsetu/contracts';

class SyncWorker {
  private isSyncing = false;
  private intervalId: number | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      // Listen to network transitions
      networkMonitor.subscribe(({ isOnline }) => {
        if (isOnline) {
          this.syncPending();
        }
      });

      // Periodic check every 15 seconds
      this.intervalId = window.setInterval(() => {
        if (networkMonitor.isOnline) {
          this.syncPending();
        } else {
          this.updatePendingCount();
        }
      }, 15000);

      this.updatePendingCount();
    }
  }

  public async updatePendingCount(): Promise<number> {
    const pendingEvents = await db.outbox.where('status').equals('pending').count();
    const failedEvents = await db.outbox.where('status').equals('failed').count();

    useSyncStore.getState().setPendingCount(pendingEvents);

    if (failedEvents > 0) {
      useSyncStore.getState().setStatus('needs_attention');
    } else if (pendingEvents > 0) {
      useSyncStore.getState().setStatus('saved_on_phone');
    } else {
      useSyncStore.getState().setStatus('synced');
    }

    return pendingEvents;
  }

  public async syncPending(): Promise<void> {
    if (this.isSyncing) return;
    if (!networkMonitor.isOnline) {
      await this.updatePendingCount();
      return;
    }

    try {
      this.isSyncing = true;
      const activeUser = useAuthStore.getState().user?.id;
      const pendingEvents = await getPendingOutboxEvents(activeUser);

      if (pendingEvents.length === 0) {
        await this.updatePendingCount();
        this.isSyncing = false;
        return;
      }

      useSyncStore.getState().setStatus('syncing');

      // Mark outbox events as 'sending'
      for (const event of pendingEvents) {
        await markEventSending(event.eventId);
      }

      // Send batch to server
      const response = await apiClient<SyncPushResponse>('/sync/push', {
        method: 'POST',
        body: JSON.stringify({ events: pendingEvents }),
      });

      for (const item of response.results) {
        if (item.status === 'applied' || item.status === 'duplicate') {
          await markEventSynced(item.eventId);
        } else {
          await markEventFailed(item.eventId, item.error);
        }
      }

      useSyncStore.getState().setLastSyncTime(Date.now());
      await this.updatePendingCount();
    } catch {
      await this.updatePendingCount();
    } finally {
      this.isSyncing = false;
    }
  }

  public cleanup() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
}

export const syncWorker = new SyncWorker();
