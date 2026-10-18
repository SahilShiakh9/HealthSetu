import { test, expect } from '@playwright/test';

test.describe('Phase 1 & 2: Authentication & Logout Repair Lifecycle', () => {
  test('Patient login via phone OTP -> home -> logout -> visible login page with no white screen', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=Login / Register')).toBeVisible({ timeout: 15000 });

    // Fill phone number
    const phoneInput = page.locator('input[type="tel"]');
    await phoneInput.fill('9876543210');
    await page.click('button[type="submit"]');

    // Wait for OTP input (auto-filled in dev)
    const otpInput = page.locator('input[placeholder="6-digit code"]');
    await expect(otpInput).toBeVisible({ timeout: 15000 });
    await page.click('button[type="submit"]');

    // Should redirect to /home
    await page.waitForURL('**/home', { timeout: 15000 });
    await expect(page.locator('text=HealthSetu Platform')).toBeVisible();

    // Verify AccountMenu is present
    const accountTrigger = page.locator('button[aria-label="User Account Menu"]');
    await expect(accountTrigger).toBeVisible();
    await accountTrigger.click();

    // Click Log out
    const logoutBtn = page.locator('button:has-text("Log out")');
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();

    // Should cleanly navigate to /login and NOT render a white page
    await page.waitForURL('**/login', { timeout: 15000 });
    await expect(page.locator('text=Login / Register')).toBeVisible({ timeout: 15000 });
    // Verify no white screen error
    const bodyContent = await page.textContent('body');
    expect(bodyContent).toContain('Login / Register');
  });

  test('Doctor login -> doctor workspace -> logout -> visible login page with no white screen', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=Login / Register')).toBeVisible({ timeout: 15000 });

    // Switch to Staff & Organization tab
    await page.click('button:has-text("Staff & Organization")');
    await page.click('button:has-text("Doctor (PHC)")');
    await page.click('button[type="submit"]');

    // Should reach /doctor
    await page.waitForURL('**/doctor', { timeout: 15000 });
    await expect(page.locator('text=Doctor Portal')).toBeVisible();

    // Click Logout button in doctor header
    const doctorLogout = page.locator('button[title="Sign Out"]');
    await expect(doctorLogout).toBeVisible();
    await doctorLogout.click();

    // Should redirect to /login
    await page.waitForURL('**/login', { timeout: 15000 });
    await expect(page.locator('text=Login / Register')).toBeVisible({ timeout: 15000 });
  });

  test('Hospital Admin login -> /org/dashboard -> logout -> visible login page', async ({ page }) => {
    await page.goto('/login');
    await page.click('button:has-text("Staff & Organization")');
    await page.click('button:has-text("Hospital Admin")');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/org/dashboard', { timeout: 15000 });
    await expect(page.locator('text=Healthcare Organization Portal')).toBeVisible();

    // Click Logout button in admin portal
    await page.click('button:has-text("Logout")');

    await page.waitForURL('**/login', { timeout: 15000 });
    await expect(page.locator('text=Login / Register')).toBeVisible({ timeout: 15000 });
  });

  test('Govt IDSP Officer login -> /surveillance -> logout -> visible login page', async ({ page }) => {
    await page.goto('/login');
    await page.click('button:has-text("Staff & Organization")');
    await page.click('button:has-text("IDSP Govt Officer")');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/surveillance', { timeout: 15000 });
    await expect(page.locator('text=Government IDSP Surveillance Officer')).toBeVisible();

    // Click Logout button in surveillance bar
    await page.click('button[title="Sign Out"]');

    await page.waitForURL('**/login', { timeout: 15000 });
    await expect(page.locator('text=Login / Register')).toBeVisible({ timeout: 15000 });
  });

  test('Unknown route renders NotFoundPage rather than white screen', async ({ page }) => {
    await page.goto('/unknown-random-route-xyz');
    await expect(page.locator('text=Page Not Found')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('button:has-text("Home")')).toBeVisible();
  });
});
