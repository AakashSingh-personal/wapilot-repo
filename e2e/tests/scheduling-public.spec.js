import { test, expect } from '@playwright/test';

test.describe('Public scheduling pages', () => {
  test('health endpoint responds', async ({ request }) => {
    const apiBase = process.env.PLAYWRIGHT_API_URL || 'http://localhost:3000';
    const res = await request.get(`${apiBase}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test('public booking page renders for invalid token gracefully', async ({ page }) => {
    await page.goto('/book/invalid-token-e2e');
    await expect(page.locator('body')).toBeVisible();
    const text = await page.locator('body').innerText();
    expect(text.length).toBeGreaterThan(0);
  });

  test('manage appointment page renders for invalid token gracefully', async ({ page }) => {
    await page.goto('/manage/invalid-token-e2e');
    await expect(page.locator('body')).toBeVisible();
  });
});
