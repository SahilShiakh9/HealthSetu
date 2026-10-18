import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import { logger } from './utils/logger.js';
import { facilityService } from './services/facility.service.js';
import { seedDefaultUsers } from './services/seed.service.js';
import { realtimeService } from './services/realtime.service.js';

const app = createApp();
const server = http.createServer(app);

export const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        origin === env.CORS_ORIGIN ||
        (env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
      ) {
        return callback(null, origin);
      }
      return callback(new Error(`Socket CORS origin ${origin} not allowed`));
    },
    credentials: true,
  },
});

realtimeService.setIo(io);

// Socket connection listener
io.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, 'Socket client connected');

  // Join authorized NGO Analytics room
  socket.on('join:ngo_analytics', (data: { orgId?: string; role?: string }) => {
    // Only permit authorized roles (NGO_OBSERVER, ADMIN, GOVT_OFFICER, PHC_OFFICER)
    const allowedRoles = ['NGO_OBSERVER', 'ADMIN', 'GOVT_OFFICER', 'PHC_OFFICER'];
    if (data?.role && !allowedRoles.includes(data.role)) {
      logger.warn({ socketId: socket.id, role: data.role }, 'Unauthorized socket tried to join ngo_analytics room');
      return;
    }

    socket.join('ngo_analytics');
    if (data?.orgId) {
      socket.join(`ngo:${data.orgId}`);
    }
    logger.info({ socketId: socket.id, role: data?.role, orgId: data?.orgId }, 'Socket joined authorized NGO analytics room');
    socket.emit('ngo:joined', { status: 'connected', room: 'ngo_analytics' });
  });

  // Join authorized consultation / RTC room
  socket.on('join:room', (data: { roomId: string; userId?: string; role?: string }) => {
    if (!data?.roomId) return;
    const existingRoom = io.sockets.adapter.rooms.get(data.roomId);
    const hasExistingPeer = Boolean(existingRoom && existingRoom.size > 0);
    socket.join(data.roomId);
    logger.info({ socketId: socket.id, roomId: data.roomId, userId: data.userId, role: data.role }, 'Socket joined consultation room');
    const peerJoinedPayload = {
      socketId: socket.id,
      userId: data.userId,
      role: data.role,
    };
    socket.to(data.roomId).emit('peer:joined', peerJoinedPayload);
    // Also notify a participant who joins second. This removes the join-order
    // race where the doctor could miss the event and never start negotiation.
    if (hasExistingPeer) {
      socket.emit('peer:joined', peerJoinedPayload);
    }
  });

  // Leave consultation room
  socket.on('leave:room', (data: { roomId: string; userId?: string }) => {
    if (!data?.roomId) return;
    socket.leave(data.roomId);
    logger.info({ socketId: socket.id, roomId: data.roomId }, 'Socket left consultation room');
    socket.to(data.roomId).emit('peer:left', {
      socketId: socket.id,
      userId: data.userId,
    });
  });

  // Relay WebRTC signaling (offers, answers, ICE candidates)
  socket.on('webrtc:signal', (data: { roomId: string; signal: any; toUserId?: string }) => {
    if (!data?.roomId) return;
    socket.to(data.roomId).emit('webrtc:signal', {
      signal: data.signal,
      fromSocketId: socket.id,
      toUserId: data.toUserId,
    });
  });

  // Direct socket message relay
  socket.on('message:send', (data: { roomId: string; message: any }) => {
    if (!data?.roomId || !data?.message) return;
    socket.to(data.roomId).emit('message:new', data);
  });

  socket.on('disconnect', (reason) => {
    logger.info({ socketId: socket.id, reason }, 'Socket client disconnected');
  });
});

if (process.env.NODE_ENV !== 'test') {
  connectDb()
    .then(async () => {
      try {
        await facilityService.seedDefaultFacilities();
        await seedDefaultUsers();
      } catch (err) {
        logger.error({ err }, 'Seed initialization warning');
      }
      server.listen(env.PORT, () => {
        logger.info({ port: env.PORT, env: env.NODE_ENV }, 'HealthSetu API server running');
      });
    })
    .catch((err) => {
      logger.error({ err }, 'Failed to connect to MongoDB on startup');
      // Still start server or let it retry so health check endpoints can respond
      server.listen(env.PORT, () => {
        logger.info({ port: env.PORT, env: env.NODE_ENV }, 'HealthSetu API server running (DB connection pending)');
      });
    });
}

export { server, app };
