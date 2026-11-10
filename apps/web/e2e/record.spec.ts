import { expect, test } from '@playwright/test';
import { allMarkets, MARKET, view } from './helpers/near';

test("an author's record matches the contract", async ({ page }) => {
  const scored = (await allMarkets()).find((m) => m.status === 'finalized' && !m.refunds_only && m.post.author_ref.startsWith('x:'));
  test.skip(!scored, 'no settled two-sided market from an X post');
  const authorRef = scored!.post.author_ref;
  const record = await view<{ correct: number; wrong: number }>(MARKET, 'get_record', { author_ref: authorRef });
  const theirs = (await allMarkets()).filter((m) => m.post.author_ref === authorRef);

  await page.goto(`/u/@${authorRef.slice(2)}`);
  await expect(page.getByTestId('record-correct')).toHaveText(String(record.correct));
  await expect(page.getByTestId('record-wrong')).toHaveText(String(record.wrong));
  await expect(page.getByTestId('record-market')).toHaveCount(theirs.length);
  // Only scored markets carry a verdict; a one-sided one is refunded instead.
  await expect(page.getByTestId('record-verdict')).toHaveCount(record.correct + record.wrong);
});
