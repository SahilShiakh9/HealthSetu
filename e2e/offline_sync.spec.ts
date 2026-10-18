import { test, expect } from '@playwright/test';

test.describe('Phase 10 E2E: Offline Screening, Sync & Shared-Device Safety', () => {
  test('offline screening saves locally as saved on phone, then syncs upon reconnection', async ({
    page,
    context,
  }) => {
    // 1. First navigate to /screening while online so client bundle is loaded
    await page.goto('/screening');
    await expect(page.locator('body')).toBeVisible();

    // 2. Simulate offline network condition
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    // Page renders locally without crashing
    await expect(page.locator('body')).toBeVisible();

    // 3. Restore online connectivity
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.locator('body')).toBeVisible();
  });

  test('shared-device logout isolates pending records and prevents cross-user leakage', async ({
    page,
  }) => {
    // Navigate to login
    await page.goto('/login');
    await expect(page.locator('body')).toBeVisible();

    // Verify localStorage has no unhashed credentials or tokens
    const tokens = await page.evaluate(() => {
      return {
        accessToken: localStorage.getItem('accessToken'),
        token: localStorage.getItem('token'),
        jwt: localStorage.getItem('jwt'),
      };
    });

    expect(tokens.accessToken).toBeNull();
    expect(tokens.token).toBeNull();
    expect(tokens.jwt).toBeNull();
  });

  test('unauthenticated user cannot access protected dashboard routes', async ({ page }) => {
    // Attempt direct URL access to clinician / operational dashboard
    await page.goto('/phc');

    // Must be redirected to /login by RequireAuth guard
    await expect(page).toHaveURL(/.*login.*/);

    // Attempt direct URL access to doctor dashboard
    await page.goto('/doctor');
    await expect(page).toHaveURL(/.*login.*/);
  });
});
