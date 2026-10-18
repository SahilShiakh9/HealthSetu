import { create } from 'zustand';
import {
  db,
  setActiveUserDb,
  deleteUserDb,
  checkUnsentRecords,
} from '../../offline/db.js';
import { queryClient } from '../../services/queryClient.js';
import type { Role, Language } from '@healthsetu/contracts';

export interface UserState {
  id: string;
  name: string;
  role: Role;
  language: Language;
  phone?: string;
  email?: string;
  facilityName?: string;
  facilityId?: string;
  districtCode?: string;
  age?: number;
  dateOfBirth?: string;
  ageBand?: string;
}

interface AuthStore {
  accessToken: string | null;
  user: UserState | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logoutNotice: string | null;
  unsentCountOnLogout: number;
  setAuth: (token: string, user: UserState) => void;
  updateUser: (patch: Partial<UserState>) => void;
  clearAuth: () => void;
  refreshSession: () => Promise<boolean>;
  initSession: () => Promise<void>;
  logout: (options?: { deleteUnsent?: boolean }) => Promise<{ unsentCount: number }>;
  deleteUnsentData: (userId?: string) => Promise<void>;
  clearNotice: () => void;
}

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

export const useAuthStore = create<AuthStore>((set, get) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,
  logoutNotice: null,
  unsentCountOnLogout: 0,

  updateUser: (patch: Partial<UserState>) => {
    const current = get().user;
    if (!current) return;
    const updated = { ...current, ...patch };
    set({ user: updated });
    db.prefs.put({ key: 'cachedUser', value: updated }).catch(() => {});
  },


  setAuth: (token: string, user: UserState) => {
    // Switch active Dexie database strictly to authenticated user's isolated DB (Section 9.1)
    setActiveUserDb(user.id);

    // In-memory access token only
    set({
      accessToken: token,
      user,
      isAuthenticated: true,
      isLoading: false,
      logoutNotice: null,
      unsentCountOnLogout: 0,
    });

    // Cache user profile in public Dexie for offline shell display
    db.prefs.put({ key: 'cachedUser', value: user }).catch(() => {});
  },

  clearAuth: () => {
    setActiveUserDb('guest');
    set({
      accessToken: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
    db.prefs.delete('cachedUser').catch(() => {});
  },

  clearNotice: () => set({ logoutNotice: null }),

  refreshSession: async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        let currentUser = get().user;

        // Fetch user profile if missing
        if (!currentUser) {
          try {
            const meRes = await fetch(`${API_BASE_URL}/auth/me`, {
              headers: { Authorization: `Bearer ${data.accessToken}` },
              credentials: 'include',
            });
            if (meRes.ok) {
              const meData = await meRes.json();
              currentUser = meData.user;
              db.prefs.put({ key: 'cachedUser', value: meData.user }).catch(() => {});
            }
          } catch {}
        }

        set({
          accessToken: data.accessToken,
          user: currentUser,
          isAuthenticated: Boolean(currentUser),
          isLoading: false,
        });

        if (currentUser?.id) {
          setActiveUserDb(currentUser.id);
        }

        return Boolean(currentUser);
      }
      return false;
    } catch {
      return false;
    }
  },

  logout: async (options?: { deleteUnsent?: boolean }) => {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const token = get().accessToken;
    const currentUser = get().user;
    const userId = currentUser?.id;

    let unsentCount = 0;
    if (userId) {
      unsentCount = await checkUnsentRecords(userId);
    }

    if (isOnline) {
      try {
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers,
          credentials: 'include',
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        // Best effort 5s timeout
      }
      set({ logoutNotice: null });
    } else {
      // Offline logout: Save pending flag so server revocation happens on next online connection
      try {
        localStorage.setItem('healthsetu_logout_pending', 'true');
      } catch {}
      set({
        logoutNotice: 'You are logged out on this phone. Server sign-out will finish when you are online.',
      });
    }

    // Shared-device safety policy (Section 9.3):
    // If outbox is empty or explicit delete requested, delete user's isolated local DB.
    // If unsent items exist and not deleted, keep them isolated for when user re-logs in.
    if (userId) {
      if (unsentCount === 0 || options?.deleteUnsent) {
        await deleteUserDb(userId);
      } else {
        set({
          unsentCountOnLogout: unsentCount,
          logoutNotice: `You have ${unsentCount} unsent record${unsentCount === 1 ? '' : 's'}. Log in again with the same account to send them, or delete them now.`,
        });
      }
    }

    // Switch active DB context back to guest
    setActiveUserDb('guest');

    // 1. Clear in-memory auth store
    set({
      accessToken: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });

    // 2. Clear query cache
    queryClient.clear();

    // 3. Delete cached user profile
    db.prefs.delete('cachedUser').catch(() => {});

    // 4. Broadcast logout to other tabs
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const channel = new BroadcastChannel('healthsetu-auth');
        channel.postMessage('logout');
        channel.close();
      }
    } catch {}

    return { unsentCount };
  },

  deleteUnsentData: async (targetUserId?: string) => {
    const id = targetUserId || get().user?.id;
    if (id) {
      await deleteUserDb(id);
      set({ unsentCountOnLogout: 0, logoutNotice: null });
    }
  },

  initSession: async () => {
    set({ isLoading: true });

    // Check if offline logout was pending
    const logoutPending =
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('healthsetu_logout_pending') === 'true';

    if (logoutPending) {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
            signal: AbortSignal.timeout(5000),
          });
          localStorage.removeItem('healthsetu_logout_pending');
        } catch {}
      }
      // Never auto-restore session while logout was pending!
      set({
        isLoading: false,
        isAuthenticated: false,
        accessToken: null,
        user: null,
      });
      return;
    }

    // Check Dexie for cached user profile (for offline instant UI rendering)
    const cached = await db.prefs.get('cachedUser');
    if (cached?.value) {
      const cachedUser = cached.value as UserState;
      setActiveUserDb(cachedUser.id);
      set({ user: cachedUser, isAuthenticated: true });
    }

    // Try silent cookie refresh if online
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      await get().refreshSession();
    }

    set({ isLoading: false });
  },
}));

// Cross-tab logout listener
if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
  const authChannel = new BroadcastChannel('healthsetu-auth');
  authChannel.onmessage = (event) => {
    if (event.data === 'logout') {
      useAuthStore.setState({
        accessToken: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
      queryClient.clear();
      db.prefs.delete('cachedUser').catch(() => {});
    }
  };
}
