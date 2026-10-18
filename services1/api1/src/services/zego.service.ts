import crypto from 'crypto';
import { env } from '../config/env.js';

export interface ZegoTokenResult {
  token: string;
  appId: number;
  roomId: string;
  userId: string;
  expiresAt: number;
  isMock: boolean;
}

export class ZegoService {
  private appId: number;
  private serverSecret: string;

  constructor() {
    this.appId = env.ZEGO_APP_ID;
    this.serverSecret = env.ZEGO_SERVER_SECRET;
  }

  /**
   * Generates a signed RTC Room token for ZEGOCLOUD audio/video calls.
   * If running in development or using stub secrets, returns an authenticated mock token.
   */
  generateRtcToken(userId: string, roomId: string, effectiveTimeInSeconds: number = 3600): ZegoTokenResult {
    const isMock = !this.serverSecret || this.serverSecret.startsWith('dev_');
    const createTime = Math.floor(Date.now() / 1000);
    const expireTime = createTime + effectiveTimeInSeconds;
    const nonce = crypto.randomInt(100000, 999999);

    const payload = {
      app_id: this.appId,
      user_id: userId,
      room_id: roomId,
      privilege: {
        1: 1, // login room
        2: 1, // publish stream
      },
      create_time: createTime,
      expire_time: expireTime,
      nonce,
    };

    const payloadStr = JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', this.serverSecret || 'mock_secret');
    hmac.update(payloadStr);
    const signature = hmac.digest('hex');

    const token = `04${Buffer.from(payloadStr).toString('base64')}.${signature}`;

    return {
      token,
      appId: this.appId,
      roomId,
      userId,
      expiresAt: expireTime * 1000,
      isMock,
    };
  }
}

export const zegoService = new ZegoService();
