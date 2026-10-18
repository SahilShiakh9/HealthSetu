import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

describe('API Health Endpoints', () => {
  const app = createApp();

  it('GET /health returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('healthsetu-api');
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  it('GET /api/v1/health returns 200 with version', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe('1.0.0');
  });

  it('GET /api/v1/health/probe returns 100 KB payload for network quality estimation', async () => {
    const res = await request(app).get('/api/v1/health/probe');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.body.length).toBe(100 * 1024);
  });
});
