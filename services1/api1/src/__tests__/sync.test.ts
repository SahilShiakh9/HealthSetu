import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { OtpCode } from '../models/OtpCode.js';
import { hashSecret } from '../services/auth.service.js';

describe('Phase 2 Server Sync & Outbox Batch Ingestion Suite', () => {
  let mongoServer: MongoMemoryServer;
  const app = createApp();
  let userToken = '';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDb(mongoServer.getUri());

    // Create authenticated user
    const phone = '9811223344';
    const code = '556677';
    await OtpCode.create({
      identifier: phone,
      codeHash: hashSecret(code),
      purpose: 'LOGIN',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    const res = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ identifier: phone, code, name: 'Santosh Kumar' });
    userToken = res.body.accessToken;
  }, 60000);

  afterAll(async () => {
    await disconnectDb();
    if (mongoServer) {
      await mongoServer.stop();
    }
  }, 30000);

  it('retrieves sync manifest with ETags and server timestamp', async () => {
    const res = await request(app)
      .get('/api/v1/sync/manifest')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.triageConfigVersion).toBe('1.0.0');
    expect(res.body.triageConfigEtag).toBeDefined();
    expect(res.body.facilitiesVersion).toBe('1.0.0');
    expect(typeof res.body.serverTime).toBe('number');
  });

  it('processes batch outbox push with CONSENT_GIVEN and PROFILE_UPDATED', async () => {
    const consentEventId = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
    const profileEventId = 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e';

    const events = [
      {
        eventId: consentEventId,
        type: 'CONSENT_GIVEN',
        payload: {
          purpose: 'SCREENING_STORAGE',
          granted: true,
          policyVersion: '1.0.0',
          language: 'hi',
        },
        createdAt: Date.now(),
        attempts: 0,
        nextAttemptAt: Date.now(),
        status: 'pending',
      },
      {
        eventId: profileEventId,
        type: 'PROFILE_UPDATED',
        payload: {
          name: 'Santosh Kumar Updated',
          villageCode: 'VIL_999',
        },
        createdAt: Date.now() + 10,
        attempts: 0,
        nextAttemptAt: Date.now() + 10,
        status: 'pending',
      },
    ];

    const res = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ events });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(2);

    const consentResult = res.body.results.find((r: { eventId: string }) => r.eventId === consentEventId);
    expect(consentResult.status).toBe('applied');
    expect(consentResult.serverId).toBeDefined();

    const profileResult = res.body.results.find((r: { eventId: string }) => r.eventId === profileEventId);
    expect(profileResult.status).toBe('applied');

    // Re-pushing identical consent event should be recognized as duplicate
    const dupeRes = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ events: [events[0]] });

    expect(dupeRes.status).toBe(200);
    expect(dupeRes.body.results[0].status).toBe('duplicate');
  });

  it('rejects outbox events where ownerUserId does not match authenticated token', async () => {
    const foreignEventId = 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f';
    const res = await request(app)
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        events: [
          {
            eventId: foreignEventId,
            type: 'CONSENT_GIVEN',
            payload: { purpose: 'SCREENING_STORAGE', granted: true },
            ownerUserId: 'different-user-999',
            createdAt: Date.now(),
            attempts: 0,
            nextAttemptAt: Date.now(),
            status: 'pending',
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].status).toBe('rejected');
    expect(res.body.results[0].error).toContain('does not match');
  });
});
