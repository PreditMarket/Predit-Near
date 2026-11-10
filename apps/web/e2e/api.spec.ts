import { expect, test } from '@playwright/test';

test.describe('server routes', () => {
  test('the AI routes take feed post ids, never text', async ({ request }) => {
    expect((await request.get('/api/detect')).status()).toBe(200);
    expect(await (await request.get('/api/detect')).json()).toEqual({ detected: {} });
    expect((await request.get('/api/draft')).status()).toBe(400);
    expect([404, 503]).toContain((await request.get('/api/draft?post=not-in-the-feed')).status());
  });

  test('unknown posts and evidence are not found', async ({ request }) => {
    expect((await request.get('/api/feed?id=not-in-the-feed')).status()).toBe(404);
    expect((await request.get('/api/evidence/abc')).status()).toBe(404);
    expect((await request.get('/api/evidence/999999')).status()).toBe(404);
  });

  test('the feed always answers, live or sample', async ({ request }) => {
    const body = await (await request.get('/api/feed?limit=5')).json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
    expect(typeof body.sample).toBe('boolean');
  });
});
