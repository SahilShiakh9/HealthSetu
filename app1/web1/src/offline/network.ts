import type { ConnectionQuality } from '@healthsetu/contracts';

type NetworkListener = (status: { isOnline: boolean; quality: ConnectionQuality }) => void;

class NetworkMonitor {
  private isOnlineState: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private qualityState: ConnectionQuality = 'GOOD';
  private listeners: Set<NetworkListener> = new Set();
  private pingIntervalId: number | null = null;
  private apiBaseUrl: string = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.checkRealConnectivity());
      window.addEventListener('offline', () => this.handleOffline());

      // Periodic health ping every 8s
      this.pingIntervalId = window.setInterval(() => {
        this.checkRealConnectivity();
      }, 8000);

      // Initial check
      this.checkRealConnectivity();
    }
  }

  public get isOnline(): boolean {
    return this.isOnlineState;
  }

  public get quality(): ConnectionQuality {
    return this.qualityState;
  }

  public subscribe(listener: NetworkListener): () => void {
    this.listeners.add(listener);
    // Notify immediately with current state
    listener({ isOnline: this.isOnlineState, quality: this.qualityState });

    return () => {
      this.listeners.delete(listener);
    };
  }

  private handleOffline() {
    this.isOnlineState = false;
    this.qualityState = 'VERY_WEAK';
    this.notify();
  }

  public async checkRealConnectivity(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.handleOffline();
      return false;
    }

    // In a browser environment (outside unit test runner), verify true external WAN (Internet) access.
    // Note: When running on localhost, pinging localhost:4000 alone will ALWAYS succeed even with
    // Wi-Fi turned off, because loopback traffic (127.0.0.1) never leaves the machine.
    if (
      typeof window !== 'undefined' &&
      typeof fetch !== 'undefined' &&
      import.meta.env?.MODE !== 'test'
    ) {
      try {
        const wanController = new AbortController();
        const wanTimeout = setTimeout(() => wanController.abort(), 2000);
        await fetch('https://www.gstatic.com/generate_204', {
          mode: 'no-cors',
          cache: 'no-store',
          signal: wanController.signal,
        });
        clearTimeout(wanTimeout);
      } catch {
        // External WAN probe failed -> No real internet connectivity
        this.handleOffline();
        return false;
      }
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`${this.apiBaseUrl}/health`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        this.isOnlineState = true;
        this.notify();
        return true;
      } else {
        this.handleOffline();
        return false;
      }
    } catch {
      this.handleOffline();
      return false;
    }
  }

  public async measureSpeed(): Promise<ConnectionQuality> {
    if (!this.isOnlineState) {
      this.qualityState = 'VERY_WEAK';
      return 'VERY_WEAK';
    }

    try {
      const start = performance.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(`${this.apiBaseUrl}/health/probe`, {
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) throw new Error('Probe failed');

      const buffer = await res.arrayBuffer();
      const durationSec = (performance.now() - start) / 1000;
      const bitsLoaded = buffer.byteLength * 8;
      const speedMbps = bitsLoaded / durationSec / (1024 * 1024);

      if (speedMbps > 1.5) {
        this.qualityState = 'GOOD';
      } else if (speedMbps >= 0.3) {
        this.qualityState = 'WEAK';
      } else {
        this.qualityState = 'VERY_WEAK';
      }

      this.notify();
      return this.qualityState;
    } catch {
      this.qualityState = 'VERY_WEAK';
      this.notify();
      return 'VERY_WEAK';
    }
  }

  private notify() {
    for (const listener of this.listeners) {
      listener({ isOnline: this.isOnlineState, quality: this.qualityState });
    }
  }

  public cleanup() {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
    }
  }
}

export const networkMonitor = new NetworkMonitor();
export const isOnline = (): boolean => networkMonitor.isOnline;
