import { test, expect } from '@playwright/test';
import path from 'path';

const artifactDir = 'C:/Users/Shaih/.gemini/antigravity-ide/brain/ece18aaf-11c1-45c7-8fef-3c0f074ddbbd';

test.describe('Multi-Organization Workspaces Visual Walkthrough & Screenshots', () => {
  test('1. Patient Workspace Screenshot', async ({ page }) => {
    await page.goto('/home');
    await expect(page.locator('text=HealthSetu Platform')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: path.join(artifactDir, 'screenshot_patient_home.png'), fullPage: true });
  });

  test('2. Hospital Admin Workspace Screenshot', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=Login / Register')).toBeVisible({ timeout: 15000 });
    await page.locator('button:has-text("Staff & Organization")').click();
    await page.locator('button:has-text("Hospital Admin")').click();
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/org/dashboard', { timeout: 15000 });
    await expect(page.locator('text=Healthcare Organization Portal')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifactDir, 'screenshot_hospital_admin.png'), fullPage: true });
  });

  test('3. Doctor Workspace Screenshot', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=Login / Register')).toBeVisible({ timeout: 15000 });
    await page.locator('button:has-text("Staff & Organization")').click();
    await page.locator('button:has-text("Doctor (PHC)")').click();
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/doctor', { timeout: 15000 });
    await expect(page.locator('text=Doctor Portal')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifactDir, 'screenshot_doctor_workspace.png'), fullPage: true });
  });

  test('4. Surveillance Workspace Screenshot', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=Login / Register')).toBeVisible({ timeout: 15000 });
    await page.locator('button:has-text("Staff & Organization")').click();
    await page.locator('button:has-text("IDSP Govt Officer")').click();
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/surveillance', { timeout: 15000 });
    await expect(page.locator('text=Zero Patient PII Accessible')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifactDir, 'screenshot_surveillance_workspace.png'), fullPage: true });
  });
});
