import { create } from 'zustand';

export type SyncState = 'idle' | 'syncing' | 'saved_on_phone' | 'synced' | 'needs_attention';

interface SyncStore {
  status: SyncState;
  pendingCount: number;
  lastSyncTime: number | null;
  setStatus: (status: SyncState) => void;
  setPendingCount: (count: number) => void;
  setLastSyncTime: (time: number) => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  status: 'idle',
  pendingCount: 0,
  lastSyncTime: null,
  setStatus: (status) => set({ status }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setLastSyncTime: (lastSyncTime) => set({ lastSyncTime }),
}));
