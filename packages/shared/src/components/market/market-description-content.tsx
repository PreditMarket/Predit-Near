'use client';

import { useMemo } from 'react';
import { cn } from '@/components/ui/utils';
import {
  isLikelyRichTextHtml,
  sanitizeMarketDescriptionHtml,
} from '@/lib/sanitize-market-description-html';

const proseDescription =
  'market-description-html prose prose-sm max-w-none prose-invert prose-p:my-2 prose-p:leading-relaxed prose-p:text-muted-foreground prose-headings:my-2 prose-headings:text-foreground prose-strong:text-foreground prose-li:my-0.5 prose-li:text-muted-foreground prose-li:marker:text-primary/60 prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-blockquote:border-l-border prose-blockquote:text-muted-foreground prose-code:rounded-md prose-code:border prose-code:border-border prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none prose-pre:border prose-pre:border-border prose-pre:bg-muted prose-pre:text-foreground prose-hr:border-border';

type MarketDescriptionContentProps = {
  value: string;
  className?: string;
};

export function MarketDescriptionContent({ value, className }: MarketDescriptionContentProps) {
  const trimmed = value?.trim() ?? '';
  const rich = useMemo(() => isLikelyRichTextHtml(value), [value]);
  const safeHtml = useMemo(
    () => (rich ? sanitizeMarketDescriptionHtml(value) : ''),
    [rich, value],
  );

  if (!trimmed) return null;

  if (rich && safeHtml.trim()) {
    return (
      <div
        className={cn(proseDescription, className)}
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    );
  }

  return <div className={cn('whitespace-pre-wrap leading-relaxed', className)}>{value}</div>;
}
