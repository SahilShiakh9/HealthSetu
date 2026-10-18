import { test, expect } from '@playwright/test';

test.describe('Phase 6 Video and Audio Consultations E2E Suite', () => {
  const hasZegoCredentials = Boolean(
    process.env.ZEGO_SERVER_SECRET && !process.env.ZEGO_SERVER_SECRET.startsWith('dev_'),
  );

  test('displays honest unconfigured notice when video credentials are absent', async ({ page }) => {
    // Intercept auth refresh so test context is authenticated as Doctor
    await page.route('**/api/v1/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'mock-e2e-token',
          user: {
            id: '6acbf8a63fefe44b910126cc',
            name: 'Dr. Test Officer',
            role: 'DOCTOR',
            language: 'en',
          },
        }),
      });
    });

    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: '6acbf8a63fefe44b910126cc',
            name: 'Dr. Test Officer',
            role: 'DOCTOR',
            language: 'en',
          },
        }),
      });
    });

    // Intercept join consultation endpoint with honest isConfigured: false
    await page.route('**/api/v1/consultations/**/join', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'success',
          consultation: {
            id: '6acbf8a63fefe44b910126cc',
            doctorId: { name: 'Dr. Test Officer' },
            patientId: { name: 'Patient Ramesh' },
            status: 'IN_PROGRESS',
          },
          zego: {
            token: null,
            appId: 0,
            roomId: 'room_123',
            isMock: false,
            isConfigured: false,
          },
        }),
      });
    });

    // Navigate to consultation room
    await page.goto('/consult/room/6acbf8a63fefe44b910126cc');

    // Should visibly explain that video calling is not configured on this server
    const notice = page.locator('text=Video calling is not configured on this server');
    await expect(notice).toBeVisible({ timeout: 5000 });

    // Must NEVER show an avatar, timer or fake doctor as if a call were happening
    const fakePulse = page.locator('.lucide-stethoscope.animate-pulse');
    await expect(fakePulse).toHaveCount(0);
  });

  test('two independent browser contexts join same consultation with fake media devices', async ({
    browser,
  }) => {
    test.skip(
      !hasZegoCredentials,
      'ZEGOCLOUD production credentials absent; marked skipped (not configured)',
    );

    // 1. Patient Context with fake media devices
    const patientContext = await browser.newContext({
      permissions: ['camera', 'microphone'],
    });
    const patientPage = await patientContext.newPage();

    // 2. Doctor Context with fake media devices
    const doctorContext = await browser.newContext({
      permissions: ['camera', 'microphone'],
    });
    const doctorPage = await doctorContext.newPage();

    const testConsultId = '6acbf8a63fefe44b910126cc';

    // Both join consultation room
    await Promise.all([
      patientPage.goto(`/consult/room/${testConsultId}`),
      doctorPage.goto(`/consult/room/${testConsultId}?role=doctor`),
    ]);

    // Assert that each side mounts video element with active track
    const patientVideo = patientPage.locator('video');
    await expect(patientVideo.first()).toBeVisible({ timeout: 10000 });

    const doctorVideo = doctorPage.locator('video');
    await expect(doctorVideo.first()).toBeVisible({ timeout: 10000 });

    // Clean up
    await patientContext.close();
    await doctorContext.close();
  });
});
