export const SOCKET_EVENTS = {
  // Client -> Server
  QUEUE_JOIN: 'queue:join',
  DOCTOR_HEARTBEAT: 'doctor:heartbeat',
  CONSULTATION_ACCEPTED: 'consultation:accepted',

  // Server -> Client
  QUEUE_UPDATED: 'queue:updated',
  DOCTOR_PRESENCE: 'doctor:presence',
  CONSULTATION_ASSIGNED: 'consultation:assigned',
  CONSULTATION_MISSED: 'consultation:missed',
  CONSULTATION_CANCELLED: 'consultation:cancelled',
  ALERT_NEW: 'alert:new',
  SYNC_REQUIRED: 'sync:required',

  // Bidirectional
  CONSULTATION_MODE: 'consultation:mode',
  MESSAGE_NEW: 'message:new',
  CALL_ENDED: 'call:ended',
  CONSULTATION_COMPLETED: 'consultation:completed',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
