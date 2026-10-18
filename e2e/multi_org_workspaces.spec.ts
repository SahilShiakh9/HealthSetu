import { test, expect } from '@playwright/test';

test.describe('Multi-Organization Workspace Partitioning & Navigation', () => {
  test('Patient Home Screen is strictly partitioned and has no surveillance controls', async ({ page }) => {
    // Navigate to homepage
    await page.goto('/home');

    // Verify Patient core action cards exist
    await expect(page.locator('text=HealthSetu Platform')).toBeVisible();

    // Verify PHC Surveillance card is NOT visible to patients
    const phcCard = page.locator('text=PHC Surveillance');
    await expect(phcCard).toHaveCount(0);

    // Verify Emergency 108 Call is available
    await expect(page.locator('a[href="tel:108"]')).toBeVisible();
  });

  test('Doctor workspace is protected by authentication', async ({ page }) => {
    // Unauthenticated visit to /doctor should redirect to /login
    await page.goto('/doctor');
    await expect(page).toHaveURL(/.*login.*/);
  });

  test('Hospital Admin portal is protected by authentication', async ({ page }) => {
    // Unauthenticated visit to /org/dashboard should redirect to /login
    await page.goto('/org/dashboard');
    await expect(page).toHaveURL(/.*login.*/);
  });

  test('Surveillance portal is protected by authentication', async ({ page }) => {
    // Unauthenticated visit to /surveillance should redirect to /login
    await page.goto('/surveillance');
    await expect(page).toHaveURL(/.*login.*/);
  });
});
