import type { Server as SocketIOServer } from 'socket.io';
import type { NgoActivityEvent } from '@healthsetu/contracts';
import { logger } from '../utils/logger.js';

class RealtimeService {
  private io: SocketIOServer | null = null;

  public setIo(serverIo: SocketIOServer): void {
    this.io = serverIo;
    logger.info('RealtimeService attached to Socket.IO server');
  }

  /**
   * Broadcasts a DPDP-compliant, privacy-safe screening lifecycle event to authorized NGO listeners.
   * Zero PHI: Only pseudonymous session references, high-level status, and aggregate metadata are emitted.
   */
  public emitNgoActivity(event: NgoActivityEvent, orgId?: string): void {
    if (!this.io) {
      logger.debug('Socket.IO not initialized on RealtimeService yet; skipping realtime emission');
      return;
    }

    try {
      // 1. Broadcast to general authorized NGO room
      this.io.to('ngo_analytics').emit('screening:activity', event);

      // 2. Broadcast to specific organization room if scoped
      if (orgId) {
        this.io.to(`ngo:${orgId}`).emit('screening:activity', event);
      }

      logger.debug({ eventType: event.type, sessionRef: event.sessionRef }, 'Emitted NGO realtime event');
    } catch (err) {
      logger.warn({ err }, 'Failed to emit realtime NGO activity event');
    }
  }
}

export const realtimeService = new RealtimeService();
