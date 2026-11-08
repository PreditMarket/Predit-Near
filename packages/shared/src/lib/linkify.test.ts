import { describe, expect, it } from 'vitest';
import { linkLabel, tokenizeContent } from './linkify';

describe('linkLabel', () => {
  it('drops the scheme and www', () => {
    expect(linkLabel('https://www.x.ai/qa')).toBe('x.ai/qa');
  });

  it('truncates long links like X', () => {
    expect(linkLabel('https://chronicles.popvax.com/p/popvax-goes-clinical')).toBe(
      'chronicles.popvax.com/p/popva…',
    );
  });
});

describe('tokenizeContent', () => {
  it('splits links out of the text and leaves trailing punctuation', () => {
    expect(tokenizeContent('see https://x.ai/qa. ok')).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'link', href: 'https://x.ai/qa', label: 'x.ai/qa' },
      { type: 'text', value: '. ok' },
    ]);
  });

  it('keeps mentions as text unless asked', () => {
    expect(tokenizeContent('Try Grok @Bot')).toEqual([
      { type: 'text', value: 'Try Grok @Bot' },
    ]);
  });

  it('turns mentions into tokens when asked, but not emails', () => {
    expect(
      tokenizeContent('Try Grok @Bot, mail a@b.com', { mentions: true }),
    ).toEqual([
      { type: 'text', value: 'Try Grok ' },
      { type: 'mention', handle: 'Bot' },
      { type: 'text', value: ', mail a@b.com' },
    ]);
  });

  it('keeps newlines inside text tokens', () => {
    expect(tokenizeContent('a\n\nhttps://b.co')).toEqual([
      { type: 'text', value: 'a\n\n' },
      { type: 'link', href: 'https://b.co', label: 'b.co' },
    ]);
  });
});
